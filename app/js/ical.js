/*
 * Minimal iCalendar (.ics) reader: enough for Google Calendar's secret iCal links.
 * Supports timed and all-day events, time zones, and common repeating rules
 * (daily / weekly with BYDAY / monthly / yearly, INTERVAL, UNTIL, COUNT, EXDATE),
 * plus single edited or cancelled occurrences of a repeating event.
 */
window.ICal = (function () {
  'use strict';

  var DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  function unfold(text) {
    return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  }

  function unescapeText(v) {
    return v.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
  }

  function parseLine(line) {
    var colon = -1, inQuote = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') inQuote = !inQuote;
      else if (ch === ':' && !inQuote) { colon = i; break; }
    }
    if (colon < 0) return null;
    var left = line.slice(0, colon), value = line.slice(colon + 1);
    var parts = left.split(';');
    var params = {};
    for (var p = 1; p < parts.length; p++) {
      var kv = parts[p].split('=');
      params[kv[0].toUpperCase()] = (kv[1] || '').replace(/"/g, '');
    }
    return { name: parts[0].toUpperCase(), params: params, value: value };
  }

  // Outlook / Exchange feeds use Windows zone names; map the common ones to IANA names.
  var WINZONES = {
    'Arabian Standard Time': 'Asia/Dubai', 'Arab Standard Time': 'Asia/Riyadh', 'Arabic Standard Time': 'Asia/Baghdad',
    'India Standard Time': 'Asia/Kolkata', 'Egypt Standard Time': 'Africa/Cairo', 'Pakistan Standard Time': 'Asia/Karachi',
    'Singapore Standard Time': 'Asia/Singapore', 'Turkey Standard Time': 'Europe/Istanbul', 'GMT Standard Time': 'Europe/London',
    'W. Europe Standard Time': 'Europe/Berlin', 'Romance Standard Time': 'Europe/Paris', 'Central Europe Standard Time': 'Europe/Budapest',
    'Central European Standard Time': 'Europe/Warsaw', 'E. Europe Standard Time': 'Europe/Chisinau', 'Eastern Standard Time': 'America/New_York',
    'Central Standard Time': 'America/Chicago', 'Mountain Standard Time': 'America/Denver', 'Pacific Standard Time': 'America/Los_Angeles',
    'Greenwich Standard Time': 'Atlantic/Reykjavik', 'UTC': 'UTC', 'Coordinated Universal Time': 'UTC', 'China Standard Time': 'Asia/Shanghai',
    'Tokyo Standard Time': 'Asia/Tokyo', 'AUS Eastern Standard Time': 'Australia/Sydney', 'Russian Standard Time': 'Europe/Moscow'
  };
  function ianaZone(tz) { tz = String(tz).replace(/^"|"$/g, ''); return WINZONES[tz] || tz; }

  // Offset (ms) of a named time zone at a UTC instant.
  function tzOffset(tz, utcMs) {
    var f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    var parts = {};
    f.formatToParts(new Date(utcMs)).forEach(function (p) { parts[p.type] = p.value; });
    var asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
    return asUtc - utcMs;
  }

  function parseDate(prop) {
    var v = prop.value.trim();
    var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v);
    if (!m) return null;
    var y = +m[1], mo = +m[2] - 1, d = +m[3];
    if (!m[4]) return { date: new Date(y, mo, d), allDay: true };
    var h = +m[4], mi = +m[5], s = +m[6];
    if (m[7]) return { date: new Date(Date.UTC(y, mo, d, h, mi, s)), allDay: false };
    var tz = prop.params.TZID ? ianaZone(prop.params.TZID) : null;
    if (tz) {
      try {
        var guess = Date.UTC(y, mo, d, h, mi, s);
        var off = tzOffset(tz, guess);
        var res = guess - off;
        var off2 = tzOffset(tz, res);          // correct across DST edges
        if (off2 !== off) res = guess - off2;
        return { date: new Date(res), allDay: false };
      } catch (e) { /* unknown zone → treat as TV-local time */ }
    }
    return { date: new Date(y, mo, d, h, mi, s), allDay: false };
  }

  function parseDuration(v) {
    var m = /^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v || '');
    if (!m) return 0;
    var ms = ((+m[2] || 0) * 7 * 86400 + (+m[3] || 0) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
    return m[1] ? -ms : ms;
  }

  function parseRRule(v) {
    var r = {};
    v.split(';').forEach(function (kv) {
      var p = kv.split('=');
      r[p[0].toUpperCase()] = p[1];
    });
    return r;
  }

  function parse(text) {
    var lines = unfold(text);
    var events = [], cur = null;
    lines.forEach(function (raw) {
      if (!raw) return;
      if (raw === 'BEGIN:VEVENT') { cur = { exdates: [] }; return; }
      if (raw === 'END:VEVENT') { if (cur) events.push(cur); cur = null; return; }
      if (!cur) return;
      var p = parseLine(raw);
      if (!p) return;
      switch (p.name) {
        case 'UID': cur.uid = p.value; break;
        case 'SUMMARY': cur.summary = unescapeText(p.value); break;
        case 'LOCATION': cur.location = unescapeText(p.value); break;
        case 'STATUS': cur.status = p.value.toUpperCase(); break;
        case 'DTSTART': cur.start = parseDate(p); break;
        case 'DTEND': cur.end = parseDate(p); break;
        case 'DURATION': cur.duration = parseDuration(p.value); break;
        case 'RRULE': cur.rrule = parseRRule(p.value); break;
        case 'RECURRENCE-ID': cur.recurrenceId = parseDate(p); break;
        case 'EXDATE':
          p.value.split(',').forEach(function (v) {
            var d = parseDate({ value: v, params: p.params });
            if (d) cur.exdates.push(d.date.getTime());
          });
          break;
      }
    });
    return events.filter(function (e) { return e.start; });
  }

  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function addMonths(d, n) { var x = new Date(d.getTime()); x.setMonth(x.getMonth() + n); return x; }

  // All occurrences of one event that overlap [from, to).
  function occurrences(ev, from, to, overridden) {
    var startMs = ev.start.date.getTime();
    var dur = ev.end ? ev.end.date.getTime() - startMs : (ev.duration || (ev.start.allDay ? 86400000 : 3600000));
    var out = [];
    function consider(d) {
      var t = d.getTime();
      if (ev.exdates.indexOf(t) >= 0) return;
      if (overridden && overridden[t]) return;
      if (t < to.getTime() && t + dur > from.getTime()) out.push({ start: d, end: new Date(t + dur) });
    }
    if (!ev.rrule) { consider(ev.start.date); return out; }

    var r = ev.rrule;
    var interval = +(r.INTERVAL || 1);
    var until = r.UNTIL ? parseDate({ value: r.UNTIL, params: {} }) : null;
    var untilMs = until ? until.date.getTime() + (until.allDay ? 86399999 : 0) : Infinity;
    var count = r.COUNT ? +r.COUNT : Infinity;
    var made = 0, guard = 0;
    var base = ev.start.date;

    if (r.FREQ === 'WEEKLY') {
      var byday = r.BYDAY ? r.BYDAY.split(',').map(function (s) { return DAYS[s.slice(-2)]; }) : [base.getDay()];
      byday.sort();
      var weekStart = addDays(base, -base.getDay());     // Sunday of the first week
      while (guard++ < 3000) {
        for (var i = 0; i < byday.length; i++) {
          var d = addDays(weekStart, byday[i]);
          if (d < base) continue;
          if (d.getTime() > untilMs || made >= count || d >= to) return out;
          made++;
          consider(d);
        }
        weekStart = addDays(weekStart, 7 * interval);
      }
      return out;
    }

    var cur = base;
    while (guard++ < 5000) {
      if (cur.getTime() > untilMs || made >= count || cur >= to) break;
      made++;
      consider(cur);
      if (r.FREQ === 'DAILY') cur = addDays(cur, interval);
      else if (r.FREQ === 'MONTHLY') cur = addMonths(base, made * interval);
      else if (r.FREQ === 'YEARLY') cur = addMonths(base, made * 12 * interval);
      else break;
    }
    return out;
  }

  // Returns [{title, start, end, allDay}] overlapping [from, to), sorted by start.
  function eventsBetween(texts, from, to) {
    var all = [];
    texts.forEach(function (t) {
      var src = typeof t === 'string' ? { text: t } : t;
      all = all.concat(parse(src.text || '').map(function (e) { e.work = !!src.work; return e; }));
    });
    var overrides = {};
    all.forEach(function (e) {
      if (e.recurrenceId && e.uid) {
        overrides[e.uid] = overrides[e.uid] || {};
        overrides[e.uid][e.recurrenceId.date.getTime()] = true;
      }
    });
    var list = [];
    all.forEach(function (e) {
      if (e.status === 'CANCELLED') return;
      var ov = e.recurrenceId ? null : overrides[e.uid];
      occurrences(e, from, to, ov).forEach(function (o) {
        list.push({ title: e.summary || '(No title)', start: o.start, end: o.end, allDay: e.start.allDay, work: e.work });
      });
    });
    list.sort(function (a, b) { return a.start - b.start; });
    return list;
  }

  return { eventsBetween: eventsBetween };
})();
