"""Reads Gmail (read-only, IMAP) for delivery and bill emails and writes /data/inbox.json for the TV.

  python mailwatch.py login   # one-time: paste a Google *app password* (typing hidden)
  python mailwatch.py serve   # loop every 10 minutes (container default)
  python mailwatch.py once    # one pass, print a summary
"""
import email, getpass, html, imaplib, json, os, re, sys, time
from datetime import datetime, timedelta, timezone
from email.header import decode_header, make_header
from email.utils import parsedate_to_datetime

DATA = "/data"
SECRET = os.path.join(DATA, "mail-secret.json")
OUT = os.path.join(DATA, "inbox.json")
USER = os.environ.get("GMAIL_USER", "")
EVERY = int(os.environ.get("MAIL_EVERY", "150"))
TZ = timezone(timedelta(hours=float(os.environ.get("UTC_OFFSET_HOURS", "4"))))

SHOPS = "amazon.ae OR temu.com OR noon.com OR namshi.com OR talabat.com OR carrefouruae.com"
BILLERS = "dewa.gov.ae OR ducustomercare.ae OR du.ae OR eand.com OR etisalat.ae OR airtel.com OR emiratesnbd.com OR addc.ae OR empower.ae"


def log(m):
    print(datetime.now(TZ).strftime("%F %T"), m, flush=True)


# ---------------- IMAP ----------------
def connect():
    pw = json.load(open(SECRET))["p"]
    m = imaplib.IMAP4_SSL("imap.gmail.com", 993)
    m.login(USER, pw)
    m.select('"[Gmail]/All Mail"', readonly=True)          # read-only: never marks mail as read
    return m


def fetch(m, raw_query, limit=150):
    typ, data = m.search(None, "X-GM-RAW", '"%s"' % raw_query.replace('"', '\\"'))
    ids = (data[0] or b"").split()[-limit:]
    out = []
    for i in ids:
        typ, msg = m.fetch(i, "(BODY.PEEK[])")
        if typ != "OK" or not msg or not isinstance(msg[0], tuple):
            continue
        out.append(email.message_from_bytes(msg[0][1]))
    return out


def text_of(msg):
    plain, htm = "", ""
    for part in msg.walk():
        ct = part.get_content_type()
        if part.get_content_maintype() == "multipart" or part.get("Content-Disposition", "").startswith("attachment"):
            continue
        try:
            payload = part.get_payload(decode=True)
            if payload is None:
                continue
            s = payload.decode(part.get_content_charset() or "utf-8", "replace")
        except Exception:  # noqa: BLE001
            continue
        if ct == "text/plain" and not plain:
            plain = s
        elif ct == "text/html" and not htm:
            htm = s
    if not plain and htm:
        plain = re.sub(r"(?is)<(script|style).*?</\1>", " ", htm)
        plain = re.sub(r"(?s)<br\s*/?>|</(p|div|tr|td|li|h\d)>", "\n", plain)
        plain = html.unescape(re.sub(r"(?s)<[^>]+>", " ", plain))
    return re.sub(r"[ \t |]+", " ", plain)


def meta(msg):
    subj = str(make_header(decode_header(msg.get("Subject", ""))))
    frm = email.utils.parseaddr(msg.get("From", ""))[1].lower()
    try:
        when = parsedate_to_datetime(msg.get("Date")).astimezone(TZ)
    except Exception:  # noqa: BLE001
        when = datetime.now(TZ)
    return subj, frm, when


# ---------------- Deliveries ----------------
def clean_title(subj):
    m = re.search(r"[“\"](.+?)[”\"]", subj)
    t = m.group(1).rstrip(". ") if m else ""
    more = re.search(r"and (\d+) more item", subj)
    if t and more:
        t += " + %s more" % more.group(1)
    return t


def delivery_from(subj, frm, when, body):
    s = subj.lower()
    if "amazon.ae" in frm:
        now_order = "amazon now" in s or "amazon now" in body[:300].lower()
        shop = "Amazon Now" if now_order else "Amazon"
        oid = re.search(r"\b(\d{3}-\d{7}-\d{7})\b", body)
        if "cancel" in s:
            status = "cancelled"
        elif "delivered" in s:
            status = "delivered"
        elif "out for delivery" in s or "arriving today" in s:
            status = "out"
        elif "shipped" in s or "dispatched" in s or "arriving" in s:
            status = "shipped"
        elif "ordered" in s or "order confirm" in s or "placed" in s:
            status = "ordered"
        else:
            return None
        eta = ""
        m = re.search(r"Delivery within next (\d+) minutes", body)
        if m:
            eta = "by " + (when + timedelta(minutes=int(m.group(1)))).strftime("%-I:%M %p")
        m = re.search(r"Arriving (today|tomorrow|[A-Z][a-z]+day(?:,? \d{1,2} [A-Z][a-z]+)?)\s*([\d:]+ ?[AP]M ?[–-] ?[\d:]+ ?[AP]M)?", body)
        eta_date = None
        if m and not eta:
            day = m.group(1).lower()
            eta_date = when.date() if day == "today" else (when + timedelta(days=1)).date() if day == "tomorrow" else None
            eta = (m.group(2) or "").replace(" ", "") if eta_date else m.group(1) + (" " + m.group(2) if m.group(2) else "")
        if eta_date:
            eta = (eta_date.isoformat() + " " + eta).strip()
        return {"shop": shop, "key": oid.group(1) if oid else "amz-" + subj[:40], "title": clean_title(subj), "status": status, "eta": eta, "when": when}
    if "temu.com" in frm:
        oid = re.search(r"PO-[\d-]+", subj + " " + body)
        if "delivered" in s:
            status = "delivered"
        elif "out-for-delivery" in s or "out for delivery" in s:
            status = "out"
        elif "shipped" in s or "transferred" in s or "tracking" in s:
            status = "shipped"
        elif "confirm" in s or "order placed" in s:
            status = "ordered"
        else:
            return None
        return {"shop": "Temu", "key": oid.group(0) if oid else "temu-" + subj[:30], "title": "", "status": status, "eta": "", "when": when}
    if any(d in frm for d in ("noon.com", "namshi.com", "talabat.com", "carrefouruae.com")):
        shop = "noon" if "noon" in frm else frm.split("@")[-1].split(".")[0].capitalize()
        oid = re.search(r"\b(N[A-Z]{0,3}\d{6,}|\d{9,})\b", subj + " " + body)
        if "deliver" in s and ("out" in s or "on the way" in s or "today" in s):
            status = "out"
        elif "delivered" in s:
            status = "delivered"
        elif any(k in s for k in ("shipped", "dispatched", "on its way", "on the way")):
            status = "shipped"
        elif "cancel" in s:
            status = "cancelled"
        elif "confirm" in s or "placed" in s:
            status = "ordered"
        else:
            return None
        return {"shop": shop, "key": oid.group(1) if oid else shop + "-" + subj[:30], "title": "", "status": status, "eta": "", "when": when}
    return None


def deliveries(m):
    latest = {}
    for msg in fetch(m, "newer_than:10d from:(%s)" % SHOPS):
        subj, frm, when = meta(msg)
        d = delivery_from(subj, frm, when, text_of(msg))
        if not d:
            continue
        k = d["key"]
        prev = latest.get(k)
        if not prev or d["when"] >= prev["when"]:
            if prev and not d["title"]:
                d["title"] = prev["title"]
            if prev and not d["eta"] and d["status"] == prev["status"]:
                d["eta"] = prev["eta"]
            latest[k] = d
        elif prev and not prev["title"] and d["title"]:
            prev["title"] = d["title"]
    now = datetime.now(TZ)
    out = []
    for d in latest.values():
        age = now - d["when"]
        if d["status"] in ("delivered", "cancelled"):
            if d["status"] == "delivered" and d["when"].date() == now.date():
                out.append(d)
            continue
        if age < timedelta(days=7 if d["status"] != "out" else 2):
            out.append(d)
    order = {"out": 0, "shipped": 1, "ordered": 2, "delivered": 3}
    out.sort(key=lambda d: (order.get(d["status"], 9), -d["when"].timestamp()))
    return [{**d, "when": int(d["when"].timestamp())} for d in out[:8]]


# ---------------- Bills ----------------
def num(s):
    return float(s.replace(",", ""))


def date_any(s):
    for fmt in ("%d/%m/%Y", "%d %b %Y", "%d %B %Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s.strip(), fmt).date()
        except ValueError:
            pass
    return None


# These are examples for UAE and Indian providers. Edit them for your own bills:
# copy a line, change the sender domain and the text patterns from one of your bill emails.
RULES = [
    # name, sender match, bill subject match, amount regex, due regex, paid subject match, currency
    ("DEWA", "dewa.gov.ae", r"green bill|bill for the month", r"Total amount due \(AED\)\s*([\d,]+\.\d{2})", r"Due Before:\s*(\d{2}/\d{2}/\d{4})", r"bill payment details|payment receipt|thank you for your payment", "AED"),
    ("du", "ducustomercare.ae", r"monthly bill|bill for your du", r"(?:Total due AED|bill of AED)\s*([\d,]+\.\d{2})", r"(?:Due date|due on)\s*(\d{2}/\d{2}/\d{4})", r"bill is paid|payment received", "AED"),
    ("e&", "eand.com", r"statement for", r"GRAND TOTAL\s*([\d,]+\.\d{2})", r"PAY BEFORE\s*(\d{1,2} \w{3} \d{4})", r"e-receipt|payment received", "AED"),
    ("Airtel", "airtel.com", r"bill for your", r"Total amount payable:\s*₹\s*([\d,]+(?:\.\d+)?)", r"Due Date:\s*(\d{1,2} \w{3} \d{4})", r"payment.*(received|successful)", "INR"),
    ("Credit card", "emiratesnbd.com", r"statement for .*credit card", None, None, r"credit card bill payment", "AED"),
]


def bills(m):
    msgs = fetch(m, "newer_than:45d from:(%s)" % BILLERS, limit=120)
    found, paid = {}, {}
    for msg in msgs:
        subj, frm, when = meta(msg)
        body = None
        for name, sender, bill_re, amt_re, due_re, paid_re, cur in RULES:
            if sender not in frm:
                continue
            if re.search(paid_re, subj, re.I):
                paid[name] = max(paid.get(name, when), when)
                continue
            if not re.search(bill_re, subj, re.I):
                continue
            body = body or (subj + "\n" + text_of(msg))
            amt = re.search(amt_re, body, re.I) if amt_re else None
            due = re.search(due_re, body, re.I) if due_re else None
            due_d = date_any(due.group(1)) if due else (when + timedelta(days=25)).date()
            b = {"name": name, "amount": num(amt.group(1)) if amt else None, "currency": cur, "due": due_d.isoformat() if due_d else None,
                 "estimated": not due, "issued": when}
            if name not in found or when > found[name]["issued"]:
                found[name] = b
    today = datetime.now(TZ).date()
    out = []
    for name, b in found.items():
        b["paid"] = bool(paid.get(name) and paid[name] > b["issued"])
        due = datetime.fromisoformat(b["due"]).date() if b["due"] else None
        if b["paid"]:
            if paid[name].date() >= today - timedelta(days=3):
                out.append(b)
        elif not due or due >= today - timedelta(days=10):
            out.append(b)
        b["issued"] = int(b["issued"].timestamp())
    out.sort(key=lambda b: (b["paid"], b["due"] or "9999"))
    return out


def run_once():
    m = connect()
    try:
        data = {"at": int(time.time()), "deliveries": deliveries(m), "bills": bills(m)}
    finally:
        try:
            m.logout()
        except Exception:  # noqa: BLE001
            pass
    tmp = OUT + ".part"
    json.dump(data, open(tmp, "w"))
    os.replace(tmp, OUT)
    return data


def login():
    print("Gmail account: %s" % USER)
    print("Create an app password at https://myaccount.google.com/apppasswords (name it 'Home TV').")
    pw = ""
    while len(pw) != 16:
        pw = getpass.getpass("Type the 16-letter app password, then press Enter (typing hidden): ").replace(" ", "")
        if len(pw) != 16:
            print("  Got %d letters, expected 16. Please try again." % len(pw))
    os.makedirs(DATA, exist_ok=True)
    json.dump({"p": pw}, open(SECRET, "w"))
    os.chmod(SECRET, 0o600)
    d = run_once()
    print("Connected. Found %d active deliveries and %d bills." % (len(d["deliveries"]), len(d["bills"])))


def serve():
    log("mail watcher started (every %ds)" % EVERY)
    while True:
        try:
            if os.path.exists(SECRET):
                d = run_once()
                log("ok: %d deliveries, %d bills" % (len(d["deliveries"]), len(d["bills"])))
        except Exception as e:  # noqa: BLE001
            log("error: %s" % e)
        time.sleep(EVERY)


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else "serve"
    if arg == "login":
        login()
    elif arg == "once":
        print(json.dumps(run_once(), indent=1, default=str))
    else:
        serve()
