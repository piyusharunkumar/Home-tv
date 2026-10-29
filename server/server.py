"""Home server relay for the Samsung TV dashboard.

The TV fetches a few feeds (Google Calendar iCal, Google News RSS, a published
Google Sheet) that refuse cross-site requests from a TV app. The TV asks this
relay instead:  GET /proxy?url=<encoded https URL>
Only hosts in ALLOWED_HOSTS are fetched; responses are cached briefly.
"""
import asyncio, hashlib, json, os, time, threading, urllib.parse, urllib.request
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
    """The next timed meeting on REMIND_WHO's phone calendar starting within REMIND_MIN minutes, once each."""
    from datetime import datetime
    if not REMIND_WHO:
        return None
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
            return self._send(200, json.dumps({"powerOn": POWER_ON["t"], "part": POWER_ON.get("part", ""), "arriveAt": arrive, "cmd": CMD if CMD.get("t") else None, "remind": REMIND if REMIND.get("t") and time.time() - REMIND["t"] < 600 else None}).encode(), "application/json")
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
