"""Family photo frame for the TV: picks good photos from the backup and serves TV-sized JPEGs.

GET /next   -> {"url": "/img/<name>.jpg", "caption": "...", "kicker": "..."}
GET /img/x  -> the prepared 960x640 JPEG (portraits centred on a blurred copy of themselves)
"""
import hashlib, json, os, random, re, threading, time
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image, ImageFilter, ImageOps, ImageStat
from pillow_heif import register_heif_opener

register_heif_opener()
ROOT = os.environ.get("PHOTO_ROOT", "/photos")
CACHE = os.environ.get("CACHE_DIR", "/data/photo-cache")
W, H = 1440, 960
EXT = (".jpg", ".jpeg", ".heic", ".heif")
os.makedirs(CACHE, exist_ok=True)
_index, _lock, _recent = [], threading.Lock(), []


def log(m):
    print(datetime.now().strftime("%F %T"), m, flush=True)


def build_index():
    items = []
    for dirpath, _, files in os.walk(ROOT):
        if "/." in dirpath or "Archive" in dirpath.split(os.sep):
            continue
        m = re.search(r"/(\d{4})/(\d{2})(?:/|$)", dirpath)
        for f in files:
            if f.lower().endswith(EXT) and not f.startswith("."):
                items.append((os.path.join(dirpath, f), int(m.group(1)) if m else 0, int(m.group(2)) if m else 0))
    return items


def refresher():
    global _index
    while True:
        try:
            idx = build_index()
            with _lock:
                _index = idx
            log("indexed %d photos" % len(idx))
        except Exception as e:  # noqa: BLE001
            log("index error: %s" % e)
        time.sleep(6 * 3600)


def taken(img):
    try:
        ex = img.getexif()
        s = ex.get_ifd(0x8769).get(36867) or ex.get(306)        # DateTimeOriginal / DateTime
        return datetime.strptime(str(s)[:19], "%Y:%m:%d %H:%M:%S") if s else None
    except Exception:  # noqa: BLE001
        return None


def good(img):
    """Skip screenshots, documents/receipts, tiny and blurry images."""
    ex = img.getexif()
    if not ex.get(271) and not ex.get(272):          # no camera make/model -> screenshot or download
        return False
    if min(img.size) < 900:
        return False
    small = img.convert("RGB").resize((256, int(256 * img.size[1] / img.size[0]) or 1))
    g = small.convert("L")
    if ImageStat.Stat(g.filter(ImageFilter.FIND_EDGES)).stddev[0] < 14:    # soft / blurry
        return False
    lum = ImageStat.Stat(g)
    if lum.mean[0] < 75 or lum.stddev[0] < 35:            # dark (night, concert, indoor low light) or flat/hazy
        return False
    hsv = small.convert("HSV")
    sat = ImageStat.Stat(hsv.getchannel("S")).mean[0]
    if sat > 150:                                         # stage lights / heavy colour cast
        return False
    hue = hsv.getchannel("H").histogram()
    if max(hue) / float(sum(hue) or 1) > 0.45 and sat > 90:   # one strong colour floods the frame
        return False
    bright = sum(1 for v in g.getdata() if v > 225) / (g.size[0] * g.size[1])
    if bright > 0.45 and sat < 30:                     # mostly white, colourless -> paper/receipt/whiteboard
        return False
    return True


def render(path, out):
    img = Image.open(path)
    img = ImageOps.exif_transpose(img).convert("RGB")
    bg = ImageOps.fit(img, (W, H)).filter(ImageFilter.GaussianBlur(28))
    bg = Image.blend(bg, Image.new("RGB", (W, H), (12, 14, 18)), 0.35)
    if img.width / img.height >= 1.2:
        fg = ImageOps.fit(img, (W, H), Image.LANCZOS)
        bg = fg
    else:
        fg = ImageOps.contain(img, (W, H), Image.LANCZOS)
        bg.paste(fg, ((W - fg.width) // 2, (H - fg.height) // 2))
    bg.save(out, "JPEG", quality=88, optimize=True, progressive=True)


def pick():
    now = datetime.now()
    with _lock:
        idx = list(_index)
    if not idx:
        return None
    same_month = [x for x in idx if x[2] == now.month and x[1] and x[1] < now.year]
    pools = []
    if same_month and random.random() < 0.45:
        pools.append(("otd", same_month))
    pools.append(("any", idx))
    for kind, pool in pools:
        for _ in range(25):
            path, y, mth = random.choice(pool)
            if path in _recent:
                continue
            try:
                img = Image.open(path)
                if not good(img):
                    continue
                t = taken(img) or (datetime(y, mth, 15) if y else None)
                if kind == "otd" and (not t or abs((t.replace(year=now.year) - now).days) > 3):
                    continue
                name = hashlib.md5((path + "@%dx%d" % (W, H)).encode()).hexdigest()[:8] + ".jpg"
                out = os.path.join(CACHE, name)
                if not os.path.exists(out):
                    render(path, out)
                _recent.append(path)
                del _recent[:-200]
                if kind == "otd" and t:
                    yrs = now.year - t.year
                    kicker, cap = "On this day", "%d year%s ago · %d" % (yrs, "" if yrs == 1 else "s", t.year)
                else:
                    kicker, cap = "From our photos", t.strftime("%B %Y") if t else ""
                return {"url": "/img/" + name, "kicker": kicker, "caption": cap}
            except Exception as e:  # noqa: BLE001
                log("skip %s: %s" % (os.path.basename(path), e))
    return None


def tidy_cache():
    files = sorted((os.path.join(CACHE, f) for f in os.listdir(CACHE)), key=os.path.getmtime)
    for f in files[:-400]:
        try:
            os.remove(f)
        except OSError:
            pass


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store" if ctype.startswith("application") else "max-age=86400")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/next"):
            p = pick()
            if not p and _recent:          # shown everything recently: start over
                del _recent[:]
                p = pick()
            tidy_cache()
            return self._send(200 if p else 503, json.dumps(p or {}).encode(), "application/json")
        m = re.match(r"^/img/([0-9a-f]{8}\.jpg)$", self.path)
        if m and os.path.exists(os.path.join(CACHE, m.group(1))):
            with open(os.path.join(CACHE, m.group(1)), "rb") as f:
                return self._send(200, f.read(), "image/jpeg")
        if self.path == "/health":
            return self._send(200, json.dumps({"photos": len(_index)}).encode(), "application/json")
        self._send(404, b"not found", "text/plain")

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    threading.Thread(target=refresher, daemon=True).start()
    log("photo frame on :8081")
    ThreadingHTTPServer(("0.0.0.0", 8081), Handler).serve_forever()
