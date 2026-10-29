"""Find My -> TV: publishes one iPhone's location to /data/location.json during the evening window.

  python findmy.py login   # one-time interactive sign-in (password + 6-digit code), saves a trusted session
  python findmy.py serve   # background loop (the container's default)
"""
import getpass, json, math, os, socket, sys, time, urllib.parse, urllib.request
from datetime import datetime

from pyicloud import PyiCloudService

DATA = "/data"
COOKIES = os.path.join(DATA, "findmy-session")
SECRET = os.path.join(DATA, "findmy-secret.json")
OUT = os.path.join(DATA, "location.json")
APPLE_ID = os.environ.get("APPLE_ID", "")
DAYS = {int(d) for d in os.environ.get("FINDMY_DAYS", "0,1,2,3,4").split(",")}   # Mon=0 … Sun=6
START, END = os.environ.get("FINDMY_FROM", "16:00"), os.environ.get("FINDMY_UNTIL", "21:00")
EVERY = int(os.environ.get("FINDMY_EVERY", "120"))
IDLE_EVERY = int(os.environ.get("FINDMY_IDLE_EVERY", "180"))        # outside the evening window: last-known location only
PRESENCE = os.path.join(DATA, "presence.json")
HOME_R = float(os.environ.get("HOME_RADIUS_M", "350"))
AWAY_MIN = float(os.environ.get("AWAY_MINUTES", "30"))


def log(m):
    print(datetime.now().strftime("%F %T"), m, flush=True)


def telegram(text):
    tok, chat = os.environ.get("TELEGRAM_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not tok or not chat:
        return
    try:
        body = urllib.parse.urlencode({"chat_id": chat, "text": "[Home TV] " + text}).encode()
        urllib.request.urlopen("https://api.telegram.org/bot%s/sendMessage" % tok, body, timeout=15)
    except Exception as e:  # noqa: BLE001
        log("telegram failed: %s" % e)


def write(obj):
    tmp = OUT + ".part"
    with open(tmp, "w") as f:
        json.dump(obj, f)
    os.replace(tmp, OUT)


def metres(a, b, c, d):
    x = math.radians(d - b) * math.cos(math.radians((a + c) / 2))
    y = math.radians(c - a)
    return 6371000 * math.hypot(x, y)


def wake_tv():
    """Magic packet straight to the TV's address (it keeps Wi-Fi on in standby)."""
    mac, ip = os.environ.get("TV_MAC", ""), os.environ.get("TV_IP", "")
    if not mac or not ip:
        return
    pkt = b"\xff" * 6 + bytes.fromhex(mac.replace(":", "").replace("-", "")) * 16
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    for _ in range(5):
        for port in (9, 7):
            s.sendto(pkt, (ip, port))
        time.sleep(0.5)
    s.close()
    log("sent wake signal to the TV")


def presence_update(lat, lng, now):
    """Tracks home/away; records an 'arrive' event after being away AWAY_MIN+ minutes."""
    try:
        p = json.load(open(PRESENCE))
    except Exception:  # noqa: BLE001
        p = {"home": [float(os.environ.get("HOME_LAT", "0")), float(os.environ.get("HOME_LNG", "0"))], "state": "unknown"}
    # Learn the exact home spot from where the phone sleeps (1-5 AM).
    if 1 <= now.hour < 5:
        h = p["home"]
        if not h[0] or metres(h[0], h[1], lat, lng) < 1500:
            p["home"] = [round(h[0] * 0.8 + lat * 0.2, 6), round(h[1] * 0.8 + lng * 0.2, 6)] if h[0] else [lat, lng]
    d = metres(p["home"][0], p["home"][1], lat, lng) if p["home"][0] else 1e9
    t = int(time.time())
    if d > max(HOME_R * 2.5, 800):
        if p.get("state") != "away":
            p["state"], p["awaySince"] = "away", t
    elif d < HOME_R:
        if p.get("state") == "away" and t - p.get("awaySince", t) >= AWAY_MIN * 60:
            p["arriveAt"] = t
            log("arrived home after %d min away" % ((t - p["awaySince"]) // 60))
            if 8 <= now.hour < 22:
                wake_tv()
        p["state"] = "home"
    p["dist"], p["at"] = int(d), t
    tmp = PRESENCE + ".part"
    json.dump(p, open(tmp, "w"))
    os.replace(tmp, PRESENCE)


def in_window(now):
    hm = now.strftime("%H:%M")
    return now.weekday() in DAYS and START <= hm < END


def connect(password):
    return PyiCloudService(APPLE_ID, password, cookie_directory=COOKIES, with_family=False, refresh_interval=None)


def login():
    os.makedirs(DATA, exist_ok=True)
    print("Signing in to Find My as %s" % APPLE_ID)
    pw = getpass.getpass("Apple ID password (typing is hidden): ")
    api = connect(pw)
    if api.requires_2fa:
        try:
            api.request_2fa_code()
        except Exception:  # noqa: BLE001
            pass
        code = input("Enter the 6-digit code shown on your iPhone: ").strip()
        if not api.validate_2fa_code(code):
            print("That code was not accepted - run login again.")
            sys.exit(1)
        api.trust_session()
    with open(SECRET, "w") as f:
        json.dump({"p": pw}, f)
    os.chmod(SECRET, 0o600)
    names = [d.name for d in api.devices]
    print("Signed in. Devices: %s" % ", ".join(names))
    print("Done - you can close this.")


def pick_iphone(api):
    devs = list(api.devices)
    for d in devs:
        if "iphone" in (d.data.get("deviceClass", "") + d.data.get("deviceDisplayName", "")).lower():
            return d
    return devs[0] if devs else None


def serve():
    log("Find My service started; window %s-%s, days %s" % (START, END, sorted(DAYS)))
    api, warned, active = None, 0, False
    while True:
        now = datetime.now()
        win = in_window(now)
        if not win and active:
            write({"active": False, "at": int(time.time())})
            active = False
            log("window closed")
        try:
            if not os.path.exists(SECRET):
                raise RuntimeError("not signed in yet")
            if api is None:
                api = connect(json.load(open(SECRET))["p"])
                if api.requires_2fa or api.requires_2sa:
                    api = None
                    raise RuntimeError("Apple needs a fresh sign-in")
            api.devices.refresh(locate=win)
            dev = pick_iphone(api)
            loc = dev.location if dev else None
            if loc and loc.get("latitude") is not None:
                presence_update(loc["latitude"], loc["longitude"], now)
            if win and loc and loc.get("latitude") is not None:
                write({"active": True, "at": int(time.time()), "lat": loc["latitude"], "lng": loc["longitude"],
                       "acc": loc.get("horizontalAccuracy"), "fixAt": int((loc.get("timeStamp") or 0) / 1000),
                       "battery": dev.data.get("batteryLevel")})
                active = True
            elif win:
                log("no location in this refresh")
            warned = 0
        except Exception as e:  # noqa: BLE001
            api = None
            log("error: %s" % e)
            if time.time() - warned > 12 * 3600:
                telegram("Your location can't be shown on the TV (%s). Ask Claude to renew the Find My sign-in." % e)
                warned = time.time()
            time.sleep(300)
            continue
        time.sleep(EVERY if win else IDLE_EVERY)


if __name__ == "__main__":
    login() if len(sys.argv) > 1 and sys.argv[1] == "login" else serve()
