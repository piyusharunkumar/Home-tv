"""Home server relay for the Samsung TV dashboard.

The TV fetches a few feeds (Google Calendar iCal, Google News RSS, a published
Google Sheet) that refuse cross-site requests from a TV app. The TV asks this
relay instead:  GET /proxy?url=<encoded https URL>
Only hosts in ALLOWED_HOSTS are fetched; responses are cached briefly.
"""
import asyncio, hashlib, json, os, re, time, threading, urllib.error, urllib.parse, urllib.request
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

ALLOWED_HOSTS = {h.strip().lower() for h in os.environ.get(
    "ALLOWED_HOSTS",
    "calendar.google.com,news.google.com,docs.google.com,"
    "sheets.googleusercontent.com,doc-0s-sheets.googleusercontent.com,"
    "outlook.office365.com,outlook.office.com,outlook.live.com,query1.finance.yahoo.com"
).split(",") if h.strip()}
ALLOWED_SUFFIXES = (".googleusercontent.com",)
CACHE_SECONDS = int(os.environ.get("CACHE_SECONDS", "300"))
MAX_BYTES = 5 * 1024 * 1024
_cache, _lock = {}, threading.Lock()
STARTED = time.time()
CMD = {}
REMIND = {}            # last meeting reminder handed to the TV
REMIND_DONE = set()    # meetings already announced
TEST_REMIND = {}
REMIND_WHO = os.environ.get("REMIND_WHO", "")          # whose phone calendar triggers reminders
REMIND_MIN = int(os.environ.get("REMIND_MINUTES", "5"))
POWER_ON = {"t": 0}   # set by the TV watcher each time the TV switches on

# ---- Text-to-speech (/tts?text=...&voice=...) -> MP3, via Microsoft Edge neural voices ----
TTS_DIR = os.environ.get("TTS_DIR", "/tmp/tts")
TTS_VOICE = os.environ.get("TTS_VOICE", "en-IN-NeerjaNeural")
_tts_lock = threading.Lock()
os.makedirs(TTS_DIR, exist_ok=True)


def tts(text, voice):
    text = " ".join(text.split())[:1500]
    if not text:
        raise ValueError("empty text")
    key = hashlib.sha1((voice + "|" + text).encode()).hexdigest()
    path = os.path.join(TTS_DIR, key + ".mp3")
    if not os.path.exists(path):
        import edge_tts  # installed in the relay image
        tmp = path + ".part"
        with _tts_lock:
            asyncio.run(edge_tts.Communicate(text, voice, rate="+0%").save(tmp))
        os.replace(tmp, path)
        files = sorted((os.path.join(TTS_DIR, f) for f in os.listdir(TTS_DIR)), key=os.path.getmtime)
        for old in files[:-300]:
            try: os.remove(old)
            except OSError: pass
    with open(path, "rb") as f:
        return f.read()


def host_ok(url):
    p = urllib.parse.urlsplit(url)
    h = (p.hostname or "").lower()
    return p.scheme == "https" and (h in ALLOWED_HOSTS or h.endswith(ALLOWED_SUFFIXES))


def fetch(url):
    now = time.time()
    with _lock:
        hit = _cache.get(url)
        if hit and now - hit[0] < CACHE_SECONDS:
            return hit[1], hit[2]
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (home-tv-dashboard)"})
    with urllib.request.urlopen(req, timeout=15) as r:
        if not host_ok(r.geturl()):
            raise ValueError("redirected to a host that is not allowed")
        body = r.read(MAX_BYTES + 1)
        if len(body) > MAX_BYTES:
            raise ValueError("response too large")
        ctype = r.headers.get("Content-Type", "text/plain; charset=utf-8")
    with _lock:
        _cache[url] = (now, body, ctype)
        if len(_cache) > 200:
            for k, _ in sorted(_cache.items(), key=lambda kv: kv[1][0])[:50]:
                _cache.pop(k, None)
    return body, ctype


# ---- Dubai retail gold rate (what jewellers in Dubai charge, set each morning) ----
GOLD = {"t": 0, "data": None}
GOLD_URL = os.environ.get("GOLD_URL", "https://dubaicityofgold.com/")


def dubai_gold():
    if GOLD["data"] and time.time() - GOLD["t"] < 900:
        return GOLD["data"]
    req = urllib.request.Request(GOLD_URL, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"})
    with urllib.request.urlopen(req, timeout=15) as r:
        html = r.read(3 * 1024 * 1024).decode("utf-8", "replace")
    rates = {}
    for k, v in re.findall(r'gold-type">\s*(\d{2})K Gold\s*</span>\s*<span[^>]*gold-value">\s*AED\s*([\d.,]+)', html):
        rates[k] = float(v.replace(",", ""))
    if "22" not in rates:
        raise ValueError("22K rate not found on the page")
    # remember one value per day so the TV can show the change from the previous day's rate
    hf = os.path.join(PUSH_DIR, "gold-history.json")
    try:
        with open(hf, encoding="utf-8") as fh:
            hist = json.load(fh)
    except Exception:  # noqa: BLE001
        hist = {}
    today = time.strftime("%Y-%m-%d")
    hist[today] = rates["22"]
    for k in sorted(hist)[:-14]:
        hist.pop(k, None)
    try:
        with open(hf, "w", encoding="utf-8") as fh:
            json.dump(hist, fh)
    except Exception:  # noqa: BLE001
        pass
    prev = [hist[k] for k in sorted(hist) if k < today]
    data = {"k22": rates["22"], "k24": rates.get("24"), "k21": rates.get("21"),
            "change": round(rates["22"] - prev[-1], 2) if prev else None, "at": int(time.time())}
    GOLD.update(t=time.time(), data=data)
    return data


# ---- iPhone push (/push from an iOS Shortcut, /pushed read by the TV) ----
PUSH_KEY = os.environ.get("PUSH_KEY", "")
PUSH_DIR = os.environ.get("PUSH_DIR", "/data")


def parse_push(body):
    d = json.loads(body.decode("utf-8", "replace"))
    who = "".join(ch for ch in str(d.get("who", "phone")) if ch.isalnum())[:20] or "phone"
    events, reminders = [], []
    for line in str(d.get("events", "")).splitlines():
        p = [x.strip() for x in line.split("|")]
        if len(p) >= 5 and p[0]:          # start | end | all-day | calendar | title
            events.append({"start": p[0], "end": p[1], "allDay": p[2].lower() in ("yes", "true", "1"),
                           "calendar": p[3][:60], "title": "|".join(p[4:])[:200]})
        elif len(p) >= 3 and p[0]:        # start | end | title  (all-day worked out from the times)
            allday = p[0][11:16] in ("", "00:00") and p[1][11:16] in ("", "00:00", "23:59") and p[0][:10] != p[1][:10] or len(p[0]) == 10
            events.append({"start": p[0], "end": p[1], "allDay": bool(allday), "calendar": "",
                           "title": "|".join(p[2:])[:200]})
    for line in str(d.get("reminders", "")).splitlines():
        p = [x.strip() for x in line.split("|")]
        if len(p) >= 3 and p[2]:          # due | list | title
            reminders.append({"due": p[0], "list": p[1][:60], "title": "|".join(p[2:])[:200]})
        elif len(p) == 2 and p[1]:        # due | title
            reminders.append({"due": p[0], "list": "", "title": p[1][:200]})
        elif len(p) == 1 and p[0]:        # title only
            reminders.append({"due": "", "list": "", "title": p[0][:200]})
    return who, {"who": who, "at": int(time.time()), "events": events[:200], "reminders": reminders[:100]}


def due_meeting():
    if not REMIND_WHO:
        return None
    """The next timed meeting on REMIND_WHO's phone calendar starting within REMIND_MIN minutes, once each."""
    from datetime import datetime
    try:
        with open(os.path.join(PUSH_DIR, "push-%s.json" % REMIND_WHO), encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception:  # noqa: BLE001
        return None
    now = time.time()
    for e in data.get("events", []):
        if e.get("allDay"):
            continue
        try:
            st = datetime.fromisoformat(str(e.get("start", "")).replace("Z", "+00:00")).timestamp()
        except ValueError:
            continue
        key = "%s|%s" % (int(st), e.get("title", ""))
        if key in REMIND_DONE:
            continue
        if -60 <= st - now <= REMIND_MIN * 60:
            return {"key": key, "title": e.get("title", "Meeting"), "start": int(st), "who": REMIND_WHO}
    return None


def read_pushed():
    out = []
    if os.path.isdir(PUSH_DIR):
        for f in sorted(os.listdir(PUSH_DIR)):
            if f.startswith("push-") and f.endswith(".json"):
                try:
                    with open(os.path.join(PUSH_DIR, f), encoding="utf-8") as fh:
                        out.append(json.load(fh))
                except Exception:  # noqa: BLE001
                    pass
    return out


# ---- Ask the TV (/ask from the iPhone Shortcut; /context posted by the TV) ----
# The question goes to Claude together with what the dashboard knows right now. The structured
# answer is kept here; the TV picks it up through /state and shows it as a card or a full screen.
ASK_STATE = {"busy": None, "last": None, "context": {}, "context_at": 0}
ASK_HISTORY = {}          # who -> [(t, role, text)] for follow-up questions (15 minutes)
WAKE_REQ = {"t": 0}      # Sam was asked to switch the TV on; the laptop picks this up within a minute
ASK_MODEL = os.environ.get("ASK_MODEL", "claude-haiku-5-5")
try:
    with open(os.path.join(os.environ.get("PUSH_DIR", "/data"), "context.json"), encoding="utf-8") as _fh:
        _c = json.load(_fh)
        ASK_STATE["context"], ASK_STATE["context_at"] = _c.get("context") or {}, _c.get("at") or 0
except Exception:  # noqa: BLE001
    pass


# ---- YouTube search (no API key: reads the public results page) + DIAL launch on the TV ----
import re
TV_IP = os.environ.get("TV_IP", "")          # your TV's address, for opening YouTube videos

YT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

def _txt(o):
    if not o: return ""
    if "simpleText" in o: return o["simpleText"]
    return "".join(r.get("text", "") for r in o.get("runs", []))

def _walk(o, out):
    if isinstance(o, dict):
        v = o.get("videoRenderer")
        if v and v.get("videoId") and v.get("lengthText"):      # lengthText missing = live/upcoming
            out.append(v)
        for x in o.values():
            if isinstance(x, (dict, list)): _walk(x, out)
    elif isinstance(o, list):
        for x in o: _walk(x, out)

def youtube_search(q, n=6, timeout=12):
    url = "https://www.youtube.com/results?" + urllib.parse.urlencode({"search_query": q, "hl": "en", "gl": "AE"})
    req = urllib.request.Request(url, headers={"User-Agent": YT_UA, "Accept-Language": "en-US,en;q=0.9",
                                               "Cookie": "CONSENT=YES+1; SOCS=CAI"})
    html = urllib.request.urlopen(req, timeout=timeout).read().decode("utf-8", "replace")
    m = re.search(r"var ytInitialData = (\{.*?\});</script>", html, re.S)
    if not m: return []
    found = []
    _walk(json.loads(m.group(1)), found)
    seen, res = set(), []
    for v in found:
        vid = v["videoId"]
        if vid in seen: continue
        seen.add(vid)
        res.append({"id": vid, "title": _txt(v.get("title"))[:120], "channel": _txt(v.get("ownerText"))[:60],
                    "length": _txt(v.get("lengthText")), "views": _txt(v.get("shortViewCountText")),
                    "age": _txt(v.get("publishedTimeText"))})
        if len(res) >= n: break
    return res


def youtube_play(vid):
    """Ask the TV's YouTube app to open a video (DIAL, the same way phones cast)."""
    if not TV_IP:
        return False, "TV_IP not set"
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", vid or ""):
        return False, "bad id"
    req = urllib.request.Request("http://%s:8080/ws/apps/YouTube" % TV_IP, data=("v=" + vid).encode(),
                                 headers={"Content-Type": "text/plain; charset=utf-8"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return True, "HTTP %s" % r.status
    except urllib.error.HTTPError as e:
        return e.code in (200, 201), "HTTP %s" % e.code
    except Exception as e:  # noqa: BLE001
        return False, str(e)[:120]


def ask_settings():
    try:
        with open(os.path.join(PUSH_DIR, "ask-secret.json"), encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:  # noqa: BLE001
        return {}


RESPOND_TOOL = {
    "name": "respond",
    "description": "Give the answer to show on the family TV. Always finish by calling this exactly once.",
    "input_schema": {
        "type": "object",
        "properties": {
            "kind": {"type": "string", "enum": ["card", "route", "trip", "explainer", "quiz", "videos"],
                     "description": "card: a one-line answer or a confirmation. videos: anything to watch or listen to on YouTube (songs, music, recipes, how-to videos, workouts, kids' shows). route: directions or drive time to a place. trip: travel plans. explainer: anything with more than two facts (how things work, how-tos, recommendations, lists, comparisons, recipes). quiz: quizzes and games."},
            "speech": {"type": "string", "description": "What the TV says out loud. One or two short, warm sentences."},
            "card": {"type": "object", "properties": {
                "answer": {"type": "string", "description": "The main answer, under 18 words"},
                "detail": {"type": "string", "description": "Optional one-line extra detail"}}},
            "route": {"type": "object", "properties": {
                "destination": {"type": "string", "description": "A place Google Maps can find, e.g. 'Fujairah International Airport, UAE'"},
                "label": {"type": "string", "description": "Short name to show, e.g. 'Fujairah Airport'"}},
                "required": ["destination"]},
            "trip": {"type": "object", "properties": {
                "title": {"type": "string"}, "meta": {"type": "string", "description": "Who, when, weather, how to get there; under 25 words"},
                "days": {"type": "array", "items": {"type": "object", "properties": {
                    "label": {"type": "string", "description": "e.g. Day 1"}, "title": {"type": "string"},
                    "stops": {"type": "array", "items": {"type": "object", "properties": {
                        "time": {"type": "string", "description": "Morning, Midday, 4 PM ..."}, "name": {"type": "string"},
                        "desc": {"type": "string", "description": "One sentence"}, "lat": {"type": "number"}, "lng": {"type": "number"}},
                        "required": ["time", "name", "desc"]}}},
                    "required": ["label", "title", "stops"]}}},
                "required": ["title", "days"]},
            "explainer": {"type": "object", "properties": {
                "title": {"type": "string"}, "audience": {"type": "string", "description": "e.g. for ages 7+ (leave empty if not for children)"},
                "points": {"type": "array", "items": {"type": "string"},
                           "description": "The points, one sentence each. Exactly as many as were asked for (e.g. 3 facts = 3 points); otherwise 3-6. The TV shows three per page."},
                "image_query": {"type": "string", "description": "2-3 words to find a gentle museum painting or print to illustrate it, e.g. 'volcano eruption', 'sleeping cat'"}},
                "required": ["title", "points"]},
            "quiz": {"type": "object", "properties": {
                "topic": {"type": "string"}, "players": {"type": "array", "items": {"type": "string"}},
                "questions": {"type": "array", "items": {"type": "object", "properties": {
                    "q": {"type": "string"}, "options": {"type": "array", "items": {"type": "string"}, "minItems": 4, "maxItems": 4},
                    "answer": {"type": "integer", "description": "index 0-3 of the right option"}},
                    "required": ["q", "options", "answer"]}}},
                "required": ["topic", "questions"]},
            "videos": {"type": "object", "properties": {
                "query": {"type": "string", "description": "What to search YouTube for, e.g. 'easy sushi recipe at home', 'Eagles Hotel California'"},
                "title": {"type": "string", "description": "Short heading for the screen, e.g. 'Sushi at home'"},
                "autoplay": {"type": "boolean", "description": "true when they asked to play one specific thing (a named song or video); false when they want to browse"}},
                "required": ["query"]},
            "actions": {"type": "array", "items": {"type": "object", "properties": {
                "do": {"type": "string", "enum": ["gallery", "home", "play_jazz", "play_bhajans", "stop_music", "show_screen", "open_app", "tv_on"]},
                "target": {"type": "string", "description": "screen name (commute, calendar, weather, orders, memories, news) or app name"}},
                "required": ["do"]}},
            "phone_text": {"type": "string", "description": "Plain-text copy for the phone. For trips include the whole plan; otherwise repeat the answer briefly."},
        },
        "required": ["kind", "speech", "phone_text"],
    },
}


def ask_system(who):
    cfg = ask_settings()
    ctx = ASK_STATE["context"] or {}
    age = int(time.time() - ASK_STATE["context_at"]) if ASK_STATE["context_at"] else None
    rules = (
        "You are " + cfg.get("name", "the TV") + ", the voice of a family's living-room TV dashboard (the family says "
        "'Hey " + cfg.get("name", "TV") + "' to ask you things). You answer questions spoken to an iPhone, "
        "and your answer appears on the big TV screen and is read aloud. If it fits naturally, you can refer to yourself by name.\n"
        "Household: " + cfg.get("family", "a family") + ". Home: " + cfg.get("home", cfg.get("city", "Dubai")) + ".\n\n"
        "Rules:\n"
        "- Always finish by calling the respond tool once. Use kind=card only for one-line answers and confirmations. "
        "Use route for directions or 'how long to get to X' (the TV draws a live traffic map from home). "
        "Use trip for travel plans, explainer for anything with more than two facts, quiz for quizzes. "
        "A full screen is better than a cramped card, so when in doubt, choose the full screen.\n"
        "- 'Here' or 'from here' means home, unless the question says otherwise.\n"
        "- Personality: you're a cheerful, curious friend to the whole family, not a search engine. Talk like a person: "
        "use the asker's name now and then, contractions, a little warmth or humour, and react to what they said "
        "('Ooh, Salalah in November is a great idea!'). With children, be playful and encouraging.\n"
        "- speech is read aloud: 2-3 natural sentences, no lists, no URLs. Answer first, then, when it helps, end with "
        "one short, useful follow-up offer or question ('Want me to add a beach day?', 'Shall I quiz you on the 8 times table next?'). "
        "Don't ask a follow-up every single time, and never for simple confirmations.\n"
        "- The on-screen card answer can be conversational too, but keep it under 18 words.\n"
        "- Follow-ups come as a new question a moment later ('yes please', 'make it shorter'); use the earlier turns to understand them.\n"
        "- Never guess facts. Weather, times and numbers come from the dashboard data (given after these rules) or from a web search, nothing else.\n"
        "- Use web search for anything current (prices, opening hours, events, weather beyond the dashboard, news). "
        "Don't search for things the dashboard already knows.\n"
        "- Family members' whereabouts: give only an ETA or 'on the way home' / 'at home', never an address or coordinates.\n"
        "- You can't change calendars, send messages, buy or book anything; say so kindly and suggest what to do instead.\n"
        "- Everything you show may be seen by children: keep it family-friendly.\n"
        "- Trips: 2-4 stops per day with real places and approximate lat/lng; a realistic pace for kids if kids are coming.\n"
        "- Explainers: pitch the language at the audience asked for (default: a curious 9-year-old). If someone asks for a number of "
        "things (three facts, five ideas), give exactly that many points; never pad with filler.\n"
        "- Quizzes: 8 questions unless asked otherwise, 4 options each; list the players if they were named.\n"
        "- Videos: for anything to watch or listen to (a song, 'play X', recipes, tutorials, workouts, cartoons) use kind=videos with a "
        "good YouTube search query; the TV finds the videos itself, so don't web search for them. Spotify isn't connected, so 'play X on "
        "Spotify' also becomes videos (say you're playing it from YouTube). Keep queries family-friendly. Don't add an open_app action for videos: the TV shows the picker and opens YouTube itself.\n"
        "- Turning the TV on: when asked to switch/turn the TV on, add the action tv_on and say it'll be on in about a minute. "
        "If the TV seems to be off (the dashboard hasn't checked in for more than 5 minutes) and they ask for something to see on it, "
        "add tv_on as well and mention you're switching it on. You can't switch the TV off; say they can use the remote.\n"
        "- Actions: use them when asked to show the gallery, go home, play or stop music, show a screen or open an app.\n"
    )
    now = (
        "The person asking now: " + (who or "someone at home") + ".\n"
        "Right now it is " + time.strftime("%A %d %B %Y, %H:%M") + " local time.\n"
        "What the dashboard knows" + (" (updated %d s ago)" % age if age is not None else "") + ":\n"
        + json.dumps(ctx, ensure_ascii=False)[:12000]
    )
    # The rules never change, so Claude can reuse them from its cache (about a tenth of the price) between questions.
    return [{"type": "text", "text": rules, "cache_control": {"type": "ephemeral"}}, {"type": "text", "text": now}]


def ask_claude(who, question):
    cfg = ask_settings()
    key = cfg.get("api_key")
    if not key:
        raise RuntimeError("Ask the TV isn't set up yet (no API key on the laptop).")
    now = time.time()
    hist = [h for h in ASK_HISTORY.get(who, []) if now - h[0] < 15 * 60][-6:]
    msgs = [{"role": r, "content": t} for _, r, t in hist]
    msgs.append({"role": "user", "content": question})
    tools = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 1}, RESPOND_TOOL]
    for _ in range(4):
        body = json.dumps({"model": cfg.get("model", ASK_MODEL), "max_tokens": 6000, "system": ask_system(who),
                           "tools": tools, "messages": msgs}).encode()
        req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, headers={
            "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                d = json.load(r)
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "replace")
            if "credit balance" in msg:
                raise RuntimeError("The Claude account is out of credit. Top it up at console.anthropic.com.")
            raise RuntimeError("Claude error %s" % e.code)
        content = d.get("content", [])
        for b in content:
            if b.get("type") == "tool_use" and b.get("name") == "respond":
                res = b.get("input") or {}
                ASK_HISTORY[who] = hist + [(now, "user", question), (now, "assistant", json.dumps(res, ensure_ascii=False)[:1500])]
                return res
        if d.get("stop_reason") == "pause_turn":          # long web search: let it carry on
            msgs.append({"role": "assistant", "content": content})
            continue
        text = " ".join(b.get("text", "") for b in content if b.get("type") == "text").strip()
        if text:                                          # answered in plain text: show it as a card
            res = {"kind": "card", "speech": text[:300], "card": {"answer": text[:140]}, "phone_text": text}
            ASK_HISTORY[who] = hist + [(now, "user", question), (now, "assistant", text[:1500])]
            return res
        msgs.append({"role": "assistant", "content": content})
        msgs.append({"role": "user", "content": "Please give the answer now by calling the respond tool."})
    raise RuntimeError("Claude didn't give an answer.")


def handle_ask(who, question):
    ASK_STATE["busy"] = {"t": time.time(), "q": question[:200], "who": who}
    try:
        res = ask_claude(who, question)
    except Exception as e:  # noqa: BLE001
        res = {"kind": "card", "speech": str(e), "card": {"answer": str(e)}, "phone_text": str(e)}
    if res.get("kind") == "videos":
        v = res.get("videos") or {}
        try:
            v["items"] = youtube_search(v.get("query") or question, 6)
        except Exception as e:  # noqa: BLE001
            v["items"] = []
            print("youtube search failed:", e)
        res["videos"] = v
        if not v["items"]:
            res = {"kind": "card", "speech": "Sorry, I couldn't reach YouTube just now. Try again in a minute?",
                   "card": {"answer": "Couldn't reach YouTube just now"}, "phone_text": "Couldn't reach YouTube just now."}
    if any((a or {}).get("do") == "tv_on" for a in (res.get("actions") or [])):
        WAKE_REQ["t"] = time.time()
    ASK_STATE["busy"] = None
    ASK_STATE["last"] = {"id": time.time(), "q": question[:200], "who": who, "result": res}
    try:
        with open(os.path.join(PUSH_DIR, "ask-log.txt"), "a", encoding="utf-8") as fh:
            fh.write("%s %s [%s] %s%s\n" % (time.strftime("%F %T"), who, res.get("kind"), question[:200],
                     "  actions=" + json.dumps(res.get("actions")) if res.get("actions") else ""))
    except Exception:  # noqa: BLE001
        pass
    return res

class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="text/plain; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_POST(self):
        parts = urllib.parse.urlsplit(self.path)
        if parts.path == "/tvlog":                     # errors and notes reported by the TV app (for fixing problems)
            n = int(self.headers.get("Content-Length") or 0)
            if 0 < n <= 16 * 1024:
                try:
                    with open(os.path.join(PUSH_DIR, "tv-log.txt"), "a", encoding="utf-8") as fh:
                        fh.write(time.strftime("%F %T ") + self.rfile.read(n).decode("utf-8", "replace").replace("\n", " | ")[:2000] + "\n")
                except Exception:  # noqa: BLE001
                    pass
            return self._send(204, b"")
        if parts.path == "/context":                   # the TV's current view of the household, for Ask the TV
            n = int(self.headers.get("Content-Length") or 0)
            if 0 < n <= 256 * 1024:
                try:
                    ASK_STATE["context"] = json.loads(self.rfile.read(n).decode("utf-8", "replace"))
                    ASK_STATE["context_at"] = time.time()
                    with open(os.path.join(PUSH_DIR, "context.json"), "w", encoding="utf-8") as fh:   # survives restarts
                        json.dump({"at": ASK_STATE["context_at"], "context": ASK_STATE["context"]}, fh)
                except Exception:  # noqa: BLE001
                    pass
            return self._send(204, b"")
        if parts.path == "/ask":                       # from the iPhone Shortcut: {"key", "who", "q"}
            n = int(self.headers.get("Content-Length") or 0)
            try:
                d = json.loads(self.rfile.read(n).decode("utf-8", "replace")) if 0 < n <= 64 * 1024 else {}
            except Exception:  # noqa: BLE001
                d = {}
            if not PUSH_KEY or d.get("key") != PUSH_KEY:
                return self._send(403, b"wrong key")
            q = " ".join(str(d.get("q", "")).split())[:1000]
            who = "".join(ch for ch in str(d.get("who", "")) if ch.isalnum())[:20]
            if not q:
                return self._send(400, b"Say something after Hey TV")
            res = handle_ask(who, q)
            return self._send(200, str(res.get("phone_text") or res.get("speech") or "Done").encode())
        if parts.path != "/push":
            return self._send(404, b"not found")
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > 512 * 1024:
            return self._send(400, b"bad size")
        try:
            body = self.rfile.read(n)
            if not PUSH_KEY or json.loads(body.decode("utf-8", "replace")).get("key") != PUSH_KEY:
                return self._send(403, b"wrong key")
            who, data = parse_push(body)
            os.makedirs(PUSH_DIR, exist_ok=True)
            tmp = os.path.join(PUSH_DIR, "push-%s.json.part" % who)
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(data, fh)
            os.replace(tmp, os.path.join(PUSH_DIR, "push-%s.json" % who))
            msg = "Thanks %s - %d events, %d reminders sent to the TV" % (who, len(data["events"]), len(data["reminders"]))
            return self._send(200, msg.encode())
        except Exception as e:  # noqa: BLE001
            return self._send(400, ("could not read that: %s" % e).encode())

    def do_GET(self):
        parts = urllib.parse.urlsplit(self.path)
        if parts.path == "/health":
            info = {"ok": True, "uptime_s": int(time.time() - STARTED), "cached": len(_cache)}
            return self._send(200, json.dumps(info).encode(), "application/json")
        if parts.path == "/poweron":
            POWER_ON["t"] = int(time.time())
            POWER_ON["part"] = urllib.parse.parse_qs(parts.query).get("part", [""])[0][:12]  # demo: morning/afternoon/evening
            return self._send(200, b"ok")
        if parts.path == "/cmd":                       # e.g. /cmd?do=gallery  (gallery | home | music), LAN only
            CMD["do"] = urllib.parse.parse_qs(parts.query).get("do", [""])[0][:12]
            CMD["t"] = int(time.time())
            return self._send(200, b'{"ok": true}', "application/json")
        if parts.path == "/gold":                      # Dubai retail gold (AED per gram)
            try:
                return self._send(200, json.dumps(dubai_gold()).encode(), "application/json")
            except Exception as e:  # noqa: BLE001
                return self._send(502, json.dumps({"error": str(e)[:200]}).encode(), "application/json")
        if parts.path == "/wake/claim":               # asked every 15 s by the laptop's wake task
            want = WAKE_REQ["t"] and time.time() - WAKE_REQ["t"] < 180
            WAKE_REQ["t"] = 0
            return self._send(200, json.dumps({"wake": bool(want)}).encode(), "application/json")
        if parts.path == "/ytplay":                    # TV asks: open this YouTube video (LAN only)
            vid = urllib.parse.parse_qs(parts.query).get("v", [""])[0][:11]
            ok, info = youtube_play(vid)
            print("ytplay", vid, ok, info)
            return self._send(200, json.dumps({"ok": ok, "info": info}).encode(), "application/json")
        if parts.path == "/remind/test":               # demo: the next claim returns a pretend meeting in 5 minutes
            TEST_REMIND["at"] = int(time.time())
            return self._send(200, b'{"ok": true}', "application/json")
        if parts.path == "/remind/claim":              # asked every 10 s by the TV watcher while the TV is on
            due = due_meeting()
            if not due and TEST_REMIND.get("at"):
                TEST_REMIND.clear()
                due = {"key": "test%d" % time.time(), "title": "Test meeting", "start": int(time.time()) + REMIND_MIN * 60, "who": REMIND_WHO}
            if due:
                REMIND.clear(); REMIND.update(due); REMIND["t"] = int(time.time())
                REMIND_DONE.add(due["key"])
                return self._send(200, json.dumps({"due": True, "title": due["title"]}).encode(), "application/json")
            return self._send(200, b'{"due": false}', "application/json")
        if parts.path == "/state":
            arrive = 0
            try:
                with open(os.path.join(PUSH_DIR, "presence.json"), encoding="utf-8") as fh:
                    arrive = json.load(fh).get("arriveAt", 0)
            except Exception:  # noqa: BLE001
                pass
            return self._send(200, json.dumps({"powerOn": POWER_ON["t"], "part": POWER_ON.get("part", ""), "arriveAt": arrive, "cmd": CMD if CMD.get("t") else None, "remind": REMIND if REMIND.get("t") and time.time() - REMIND["t"] < 600 else None, "askBusy": ASK_STATE["busy"], "ask": ASK_STATE["last"] if ASK_STATE["last"] and time.time() - ASK_STATE["last"]["id"] < 600 else None}).encode(), "application/json")
        if parts.path == "/inbox":
            try:
                with open(os.path.join(PUSH_DIR, "inbox.json"), encoding="utf-8") as fh:
                    return self._send(200, fh.read().encode(), "application/json")
            except Exception:  # noqa: BLE001
                return self._send(200, b'{"deliveries": [], "bills": []}', "application/json")
        if parts.path == "/location":
            try:
                with open(os.path.join(PUSH_DIR, "location.json"), encoding="utf-8") as fh:
                    loc = json.load(fh)
            except Exception:  # noqa: BLE001
                loc = {"active": False}
            if loc.get("active") and time.time() - loc.get("at", 0) > 900:
                loc = {"active": False, "stale": True}
            return self._send(200, json.dumps(loc).encode(), "application/json")
        if parts.path == "/pushed":
            return self._send(200, json.dumps(read_pushed()).encode(), "application/json")
        if parts.path == "/tts":
            q = urllib.parse.parse_qs(parts.query)
            voice = q.get("voice", [TTS_VOICE])[0]
            if not voice.replace("-", "").isalnum():
                return self._send(400, b"bad voice")
            try:
                return self._send(200, tts(q.get("text", [""])[0], voice), "audio/mpeg")
            except Exception as e:  # noqa: BLE001
                return self._send(502, ("tts error: %s" % e).encode())
        if parts.path != "/proxy":
            return self._send(404, b"not found")
        url = urllib.parse.parse_qs(parts.query).get("url", [""])[0]
        if not host_ok(url):
            return self._send(403, b"host not allowed")
        try:
            body, ctype = fetch(url)
            self._send(200, body, ctype)
        except Exception as e:  # noqa: BLE001
            self._send(502, ("upstream error: %s" % e).encode())

    def log_message(self, fmt, *args):
        print("%s %s" % (self.address_string(), fmt % args), flush=True)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    print("TV relay listening on %d, allowed: %s" % (port, sorted(ALLOWED_HOSTS)), flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
