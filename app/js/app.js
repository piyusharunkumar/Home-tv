/* Main app: drawing, card rotation, idle gallery, remote control. */
(function () {
  'use strict';

  var C = window.CONFIG;
  var DEMO = C.demo || /[?&]demo=1/.test(location.search);
  var ON_TV = typeof window.tizen !== 'undefined';
  var $ = function (id) { return document.getElementById(id); };
  var esc = U.esc;

  // ---------- State ----------
  var S = {
    weather: null, aqi: null, prayers: null, fx: null, commute: null, events: null,
    music: null, musicError: false, cricket: null, news: null, kids: null, flights: [],
    airportMinutes: null, artHome: null, artIdle: null
  };
  var view = { card: null, idle: false, lastInput: Date.now(), focusRow: 'apps', focusIdx: 0 };

  // ---------- Icons ----------
  var ICON = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="#F2B36B" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="#F2B36B" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="#C9CDD3" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7z"/></svg>',
    'cloud-sun': '<svg viewBox="0 0 24 24" fill="none" stroke="#F2B36B" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v1.5M3.5 8H2M4.6 4.6l1 1M12.5 7.5A4 4 0 0 0 5 9"/><path d="M9 20h8a3.5 3.5 0 0 0 .5-7A5 5 0 0 0 8 14a3 3 0 0 0 1 6z" stroke="#C9CDD3"/></svg>',
    fog: '<svg viewBox="0 0 24 24" fill="none" stroke="#C9CDD3" stroke-width="1.6" stroke-linecap="round"><path d="M4 9h16M3 13h18M5 17h14"/></svg>',
    rain: '<svg viewBox="0 0 24 24" fill="none" stroke="#7FB2F0" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 8a3.5 3.5 0 0 0 1 7z" stroke="#C9CDD3"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/></svg>',
    storm: '<svg viewBox="0 0 24 24" fill="none" stroke="#F2B36B" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 8a3.5 3.5 0 0 0 1 7z" stroke="#C9CDD3"/><path d="M12 15l-2 4h3l-2 4"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="#F2B36B" stroke-width="1.6" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="#F3F1EC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 20L9 12l10-8v16zM5 19V5"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="#F3F1EC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4l10 8-10 8V4zM19 5v14"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="none" stroke="#F3F1EC" stroke-width="2.4" stroke-linecap="round"><path d="M8 5v14M16 5v14"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="#F3F1EC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4l13 8-13 8V4z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="#8FD1B0" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>',
    circle: '<svg viewBox="0 0 24 24" fill="none" stroke="#6F7682" stroke-width="2.2"><circle cx="12" cy="12" r="9"/></svg>'
  };

  // ---------- Helpers ----------
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function longDate(d) { return WEEKDAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function shortDay(d) { return WEEKDAYS[d.getDay()].slice(0, 3) + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3); }
  function clockParts(d) { var s = U.time12(d).split(' '); return { hm: s[0], ap: s[1] }; }
  function mmss(ms) { var s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + U.pad(s % 60); }
  function minsToday(hhmm) { var p = hhmm.split(':'); return +p[0] * 60 + +p[1]; }
  function isWorkday(d) { return C.weekend.indexOf(d.getDay()) < 0; }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.add('hidden'); }, 3500);
  }

  // ---------- Header, prayers ----------
  function drawClock() {
    var now = new Date(), cp = clockParts(now), h = now.getHours();
    $('clock').textContent = cp.hm;
    $('ampm').textContent = cp.ap;
    $('date').textContent = longDate(now);
    $('greeting').textContent = (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening') + ', ' + C.familyName;
    $('iClock').textContent = cp.hm;
    $('iAmpm').textContent = cp.ap;
    $('iDate').textContent = longDate(now) + (S.weather ? ' · ' + S.weather.temp + '° ' + S.weather.desc : '');
  }

  function drawWeather() {
    var w = S.weather;
    if (w) {
      $('wxIcon').innerHTML = ICON[w.icon] || ICON.cloud;
      $('wxTemp').textContent = w.temp + '°';
      $('wxDesc').textContent = w.desc;
      $('wxRange').textContent = 'High ' + w.high + '° · Low ' + w.low + '°';
      $('chipUv').textContent = 'UV ' + w.uv + ' · ' + (w.uv <= 2 ? 'Low' : w.uv <= 5 ? 'Moderate' : w.uv <= 7 ? 'High' : w.uv <= 10 ? 'Very high' : 'Extreme');
      $('chipUv').classList.remove('hidden');
      $('chipSunrise').textContent = 'Sunrise ' + U.time12(w.sunrise);
      $('chipSunrise').classList.remove('hidden');
      $('chipSunset').textContent = 'Sunset ' + U.time12(w.sunset);
      $('chipSunset').classList.remove('hidden');
    }
    if (S.aqi) {
      $('chipAqi').textContent = 'Air quality ' + S.aqi.value + ' · ' + S.aqi.label;
      $('chipAqi').classList.remove('hidden');
    }
  }

  function nextPrayer() {
    if (!S.prayers) return null;
    var now = new Date(), m = now.getHours() * 60 + now.getMinutes();
    for (var i = 0; i < S.prayers.length; i++) {
      if (minsToday(S.prayers[i].time) > m) return { p: S.prayers[i], tomorrow: false };
    }
    return { p: S.prayers[0], tomorrow: true };
  }

  function drawPrayers() {
    // Prayer times are switched off; the idle screen shows sunrise / sunset instead.
    var w = S.weather;
    $('iPrayer').innerHTML = w ? '<span class="m">Sunrise</span>&nbsp;' + esc(U.time12(w.sunrise)) + '&nbsp;·&nbsp;<span class="m">Sunset</span>&nbsp;' + esc(U.time12(w.sunset)) : '';
  }

  // ---------- Side tiles ----------
  function nextCountdown() {
    var today = new Date(), best = null;
    (C.countdowns || []).forEach(function (c) {
      var d = U.parseLocalDate(c.date), n = U.daysBetween(today, d);
      if (n >= 0 && (!best || n < best.days)) best = { label: c.label, days: n, date: d };
    });
    return best;
  }

  function tileCommute() {
    var c = C.commute, now = new Date(), h = now.getHours();
    var inWindow = isWorkday(now) && h >= c.fromHour && h < c.toHour;
    if (S.commute && inWindow) {
      var start = minsToday(c.startTime), leave = start - S.commute.minutes - 10;
      var leaveTxt = leave > 0 ? 'Leave by ' + U.time12(Math.floor(leave / 60) + ':' + U.pad(leave % 60)) : '';
      return '<p class="k">' + esc(c.label) + '</p><p class="v">' + S.commute.minutes + '<span class="u">min</span></p><p class="s">' + esc(leaveTxt) + '</p>';
    }
    // Outside commute hours: weekend countdown.
    var n = 0;
    while (C.weekend.indexOf((now.getDay() + n) % 7) < 0 && n < 7) n++;
    return '<p class="k">Weekend</p><p class="v">' + (n === 0 ? 'Today' : n + '<span class="u">' + (n === 1 ? 'day' : 'days') + '</span>') +
      '</p><p class="s">' + (n === 0 ? 'Enjoy it' : 'until ' + WEEKDAYS[(now.getDay() + n) % 7]) + '</p>';
  }

  function tileFx() {
    var f = S.fx;
    if (!f) return '<p class="k">Exchange rates</p><p class="v">—</p>';
    function arrow(c, tiny) {
      if (c == null || Math.abs(c) < tiny) return '<i class="fx-a flat">•</i>';
      return '<i class="fx-a ' + (c > 0 ? 'up' : 'down') + '">' + (c > 0 ? '▲' : '▼') + '</i>';
    }
    function row(k, v, c, tiny) { return '<div class="fx-row"><span class="fx-k">' + k + '</span><span class="fx-v">' + v + arrow(c, tiny) + '</span></div>'; }
    var X = C.fx || {}, base = X.base || 'AED', quote = X.quote || 'INR';
    var SYM = { INR: '₹', USD: '$', EUR: '€', GBP: '£', PKR: 'Rs ', AED: 'AED ', SAR: 'SAR ', PHP: '₱' }, q = SYM[quote] || quote + ' ';
    var out = '<p class="k">Exchange rates</p>' + row('1 ' + base, q + f.rate.toFixed(2), f.change, 0.005);
    if (base !== 'USD' && quote !== 'USD') out += row('1 USD', f.usd ? q + f.usd.toFixed(2) : '—', f.usdChange, 0.005);
    if (X.gold !== false) out += row('Gold<small>22K</small>', f.gold ? f.gold.toFixed(0) + '<small> ' + base + '/g</small>' : '—', f.goldChange, 0.5);
    return out;
  }

  function tileCountdown() {
    var cd = nextCountdown();
    if (!cd) {
      return '<p class="k">Countdown</p><p class="s">Add dates under countdowns in config.js</p>';
    }
    var big = cd.days === 0 ? 'Today' : cd.days + '<span class="u">' + (cd.days === 1 ? 'day' : 'days') + '</span>';
    return '<p class="k">' + esc(cd.label) + '</p><p class="v">' + big + '</p><p class="s">' + esc(longDate(cd.date)) + '</p>';
  }

  function musicProgress(m) {
    var p = m.progress + (m.playing ? Date.now() - m.fetchedAt : 0);
    return Math.min(p, m.duration);
  }

  function tileMusic() {
    var m = S.music;
    if (!C.spotify.clientId && !DEMO) return '<p class="k">Spotify</p><p class="t2" style="white-space:normal">Connect Spotify in config.js to see what\'s playing.</p>';
    if (S.musicError) return '<p class="k">Spotify</p><p class="t2" style="white-space:normal">Reconnect needed — rerun tools/spotify_auth.py.</p>';
    if (!m || !m.title) return '<p class="k accent">Spotify</p><p class="t1">Nothing playing</p>';
    var pct = (musicProgress(m) / m.duration * 100).toFixed(1);
    return '<p class="k accent">' + (m.playing ? 'Now playing' : 'Paused') + '</p><p class="t1">' + esc(m.title) + '</p><p class="t2">' + esc(m.artist) +
      '</p><div class="bar" style="margin-top:auto"><i style="width:' + pct + '%"></i></div>';
  }

  // ---------- World clock ----------
  // World clock: set worldClock in config.js as [{ name, tz, base (minutes from UTC, used only if the TV lacks time-zone data), dst: 'eu'|'na'|'eg'|null }]
  var CITIES = (C.worldClock && C.worldClock.length) ? C.worldClock : [
    { name: 'Hyderabad', tz: 'Asia/Kolkata', base: 330, dst: null },
    { name: 'Riyadh', tz: 'Asia/Riyadh', base: 180, dst: null },
    { name: 'Cairo', tz: 'Africa/Cairo', base: 120, dst: 'eg' },
    { name: 'Toronto', tz: 'America/Toronto', base: -300, dst: 'na' },
    { name: 'Berlin', tz: 'Europe/Berlin', base: 60, dst: 'eu' }
  ];
  function nthSunday(y, m, n) {          // n-th Sunday of month m (0-based); n = -1 for last
    if (n > 0) { var d = new Date(Date.UTC(y, m, 1)); d.setUTCDate(1 + (7 - d.getUTCDay()) % 7 + (n - 1) * 7); return d; }
    var e = new Date(Date.UTC(y, m + 1, 0)); e.setUTCDate(e.getUTCDate() - e.getUTCDay()); return e;
  }
  function lastWeekday(y, m, wd) { var e = new Date(Date.UTC(y, m + 1, 0)); e.setUTCDate(e.getUTCDate() - ((e.getUTCDay() - wd + 7) % 7)); return e; }
  function fallbackOffset(c, now) {        // used only if the TV browser lacks time-zone data
    var y = now.getUTCFullYear(), t = now.getTime(), on = false;
    if (c.dst === 'eu') on = t >= nthSunday(y, 2, -1).getTime() + 3600000 && t < nthSunday(y, 9, -1).getTime() + 3600000;
    if (c.dst === 'na') on = t >= nthSunday(y, 2, 2).getTime() + 7 * 3600000 && t < nthSunday(y, 10, 1).getTime() + 6 * 3600000;
    if (c.dst === 'eg') on = t >= lastWeekday(y, 3, 5).getTime() - 2 * 3600000 && t < lastWeekday(y, 9, 4).getTime() + 22 * 3600000;
    return (c.base || 0) + (on ? 60 : 0);
  }
  function cityTime(c, now) {
    try {
      var s = new Intl.DateTimeFormat('en-US', { timeZone: c.tz, hour: 'numeric', minute: '2-digit', hour12: true, weekday: 'short' }).format(now);
      var m = s.match(/^(\w+),?\s+(\d{1,2}:\d{2})\s*([AP]M)$/);
      if (m) return { time: m[2], ap: m[3], day: m[1] };
    } catch (e) { /* fall through */ }
    var d = new Date(now.getTime() + fallbackOffset(c, now) * 60000);
    var h = d.getUTCHours(), mi = d.getUTCMinutes();
    return { time: ((h % 12) || 12) + ':' + U.pad(mi), ap: h < 12 ? 'AM' : 'PM', day: WEEKDAYS[d.getUTCDay()].slice(0, 3) };
  }
  function tileWorld() {
    var now = new Date(), today = WEEKDAYS[now.getDay()].slice(0, 3);
    return '<p class="k">World clock</p>' + CITIES.map(function (c) {
      var t = cityTime(c, now);
      return '<div class="wc-row"><span class="wc-n">' + esc(c.name) + (t.day !== today ? '<small class="wc-d">' + esc(t.day) + '</small>' : '') +
        '</span><span class="wc-t">' + esc(t.time) + '<small> ' + t.ap + '</small></span></div>';
    }).join('');
  }

  function tileDays() {
    // Commute during the morning window; otherwise weekend + next countdown together.
    var c = C.commute, now = new Date(), h = now.getHours();
    if (S.commute && isWorkday(now) && h >= c.fromHour && h < c.toHour) return tileCommute();
    var n = 0;
    while (C.weekend.indexOf((now.getDay() + n) % 7) < 0 && n < 7) n++;
    var rows = '<div class="fx-row"><span class="fx-k">Weekend</span><span class="fx-v">' + (n === 0 ? 'Today' : n + '<span class="u">' + (n === 1 ? 'day' : 'days') + '</span>') + '</span></div>';
    var cd = nextCountdown();
    if (cd) rows += '<div class="fx-row"><span class="fx-k">' + esc(cd.label) + '</span><span class="fx-v">' + (cd.days === 0 ? 'Today' : cd.days + '<span class="u">' + (cd.days === 1 ? 'day' : 'days') + '</span>') + '</span></div>';
    return '<p class="k">Coming up</p>' + rows;
  }

  function drawTiles() {
    $('tileA').innerHTML = tileDays();
    $('tileB').innerHTML = tileFx();
    $('tileC').innerHTML = tileCountdown();
    $('tileD').innerHTML = tileWorld();

    var cd = nextCountdown();
    $('iCount').textContent = cd ? (cd.days === 0 ? cd.label + ' is today' : cd.label + ' in ' + cd.days + (cd.days === 1 ? ' day' : ' days')) : '';
    $('iCount').classList.toggle('hidden', !cd);
    var m = S.music;
    if (m && m.title && m.playing) {
      $('iMusic').innerHTML = ICON.note + '<span><b>' + esc(m.title) + '</b><span class="m"> · ' + esc(m.artist) + '</span></span>';
      $('iMusic').classList.remove('hidden');
    } else $('iMusic').classList.add('hidden');
  }

  // ---------- Rotating cards ----------
  function activeFlight(now) {
    return (S.flights || []).filter(function (f) {
      if (f.arriveUtc) return now - f.arriveUtc < 2 * 3600000 && f.arriveUtc - now < 18 * 3600000;
      return f.date === U.dayKey(now);
    })[0] || null;
  }

  function eligibleCards() {
    // Which screens apply right now (sorted by relevance below).
    var now = new Date(), h = now.getHours(), list = ['calendar'];
    if (S.papa && !(S.papa.km != null && S.papa.km < 0.15)) list.unshift('papa');   // evening: where the family member is, first
    if (S.phone && S.phone.reminders && S.phone.reminders.length) list.push('reminders');
    if (S.weather && S.weather.hours) list.push('weather');
    if (activeFlight(now)) list.push('flight');
    // While the live 'on the way home' map is up, the fixed office → home commute would only contradict it.
    if (C.googleMapsKey && C.commute.origin && (S.route || !S.routeFailed) && !(list.indexOf('papa') >= 0 && !routeDir().toWork)) list.push('commute');
    if (S.inbox && ((S.inbox.deliveries || []).length || (S.inbox.bills || []).some(function (b) { return !b.paid; }))) list.push('orders');
    if (S.kids && S.kids.length && h >= 6 && h < 21) list.push('kids');
    if (S.cricket && (S.cricket.live || S.cricket.next)) list.push('cricket');
    if (S.music && S.music.title && S.music.playing) list.push('music');
    if (S.memory) list.push('memories');
    if (S.news && S.news.length) list.push('news');            // headlines always last
    // Most relevant first: score each screen for "right now"; headlines stay last.
    var sc = {};
    list.forEach(function (c, i) { sc[c] = relevance(c, now) - i * 0.01; });
    list.sort(function (a, b) { return a === 'news' ? 1 : b === 'news' ? -1 : sc[b] - sc[a]; });
    view.scores = sc;
    return list;
  }

  // 0–100: how useful each screen is at this moment.
  function relevance(card, now) {
    var h = now.getHours() + now.getMinutes() / 60, work = isWorkday(now), today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (card) {
      case 'papa': return 100;                                         // someone's on the way home
      case 'memories': return S.memory && S.memory.kicker === 'On this day' ? 58 : 34;
      case 'flight': return 97;
      case 'orders': {
        var ib = S.inbox || {}, out = (ib.deliveries || []).some(function (x) { return x.status === 'out'; });
        var dueSoon = (ib.bills || []).some(function (b) { return !b.paid && b.due && (U.parseLocalDate(b.due) - today0) / 86400000 <= 1; });
        var todayDl = (ib.deliveries || []).some(function (x) { return /^\d{4}/.test(x.eta || '') && x.eta.slice(0, 10) === U.dayKey(now); });
        return out ? 95 : dueSoon ? 72 : todayDl ? 62 : 25;
      }
      case 'commute': return work && h >= 6 && h < 9.5 ? 90 : 18;      // before leaving for work
      case 'calendar': {
        var ev = S.events || [], soon = ev.some(function (e) { return !e.allDay && e.start > now && e.start - now < 75 * 60000 || e.start <= now && e.end > now && !e.allDay; });
        return soon ? 88 : h >= 5 && h < 10 ? 60 : h >= 20 ? 50 : 45;   // evenings: tomorrow's plan
      }
      case 'reminders': {
        var r = remindersDue(now);
        return r.length ? (h >= 17 ? 70 : 55) : 28;
      }
      case 'weather': {
        var w = S.weather, rain = w && w.hours && w.hours.slice(0, 6).some(function (x) { return x.rain >= 50; });
        return rain ? 80 : h >= 5 && h < 8.5 ? 50 : 32;
      }
      case 'kids': return (h >= 6 && h < 7.75) || (h >= 18 && h < 20.5) ? 74 : 20;   // school prep & homework/bedtime
      case 'cricket': return S.cricket && S.cricket.live ? 86 : 15;
      case 'music': return 84;
      default: return 10;
    }
  }

  // If something becomes clearly more relevant (a delivery goes out, a meeting is about to start), jump to it.
  function promoteRelevant() {
    if (view.idle || G.active || view.tour || view.focusRow === 'music') return;
    if (view.manualAt && Date.now() - view.manualAt < 2 * 60000) return;
    var list = eligibleCards(), top = list[0], sc = view.scores || {};
    if (top && top !== view.card && top !== view.lastTop && sc[top] >= 80) { view.card = top; drawCard(true); }
    view.lastTop = top;
  }

  function remindersDue(now) {
    var end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return ((S.phone && S.phone.reminders) || []).filter(function (r) { return !r.due || r.due < end; });
  }
  function cardReminders() {
    var now = new Date(), list = (S.phone && S.phone.reminders) || [];
    var today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()), tmr = new Date(today0.getTime() + 86400000);
    function when(r) {
      if (!r.due) return '';
      if (r.due < today0) return '<span class="rm-over">Overdue</span>';
      if (r.due < tmr) return r.due.getHours() || r.due.getMinutes() ? U.time12(r.due) : 'Today';
      if (r.due < new Date(tmr.getTime() + 86400000)) return 'Tomorrow';
      return shortDay(r.due);
    }
    var rows = list.slice(0, 7).map(function (r) {
      return '<div class="rm"><span class="rm-dot"></span><p class="rm-t">' + esc(r.title) + (r.list ? '<small>' + esc(r.list) + '</small>' : '') + '</p><p class="rm-w">' + when(r) + '</p></div>';
    }).join('');
    return '<div class="rms">' + rows + '</div>' + (list.length > 7 ? '<p class="rm-more">+' + (list.length - 7) + ' more on your phone</p>' : '');
  }

  function cardMemories() {
    var m = S.memory;
    if (!m) return '<p class="empty">Picking a photo…</p>';
    return '<div class="mem-card"><div class="mem-wrap"><img class="mem-img" src="' + esc(m.src) + '" alt=""></div>' +
      '<div class="mem-info"><p class="mem-kick">' + esc(m.kicker) + '</p><p class="mem-cap">' + esc(m.caption) + '</p>' +
      '<p class="mem-note">From our family photos</p></div></div>';
  }

  function cardPapa() {
    var r = S.papa, name = (C.greetings && C.greetings.morningName) || 'Papa';
    if (!r) return '<p class="empty">Locating…</p>';
    var mins = r.minutes, near = r.km != null && r.km < 0.4;
    var head = near ? 'Almost home' : (mins != null ? mins + '<span>min</span>' : '…');
    function row(k, v) { return '<div class="cm-row"><span>' + k + '</span><b>' + v + '</b></div>'; }
    return '<div class="cm-card">' + (r.mapUrl ? '<div class="cm-mapwrap"><img class="cm-map" src="' + esc(r.mapUrl) + '" alt=""></div>' : '') +
      '<div class="cm-info"><p class="cm-dir">' + esc(name) + ' → Home<span>Seen ' + U.time12(r.fixAt || r.at) + '</span></p>' +
      '<div class="cm-head"><p class="cm-time">' + head + '</p></div>' +
      '<p class="cm-via">' + (r.desc ? 'via ' + esc(r.desc) : '') + '</p>' +
      '<div class="cm-rows">' + (mins != null ? row('Home by', U.time12(new Date(Math.max(Date.now(), (r.fixAt || r.at || new Date()).getTime() + mins * 60000)))) : '') +
        (r.km != null ? row('Distance', r.km + ' km') : '') + '</div></div></div>';
  }

  var SHOP_ICON = { 'Amazon': '📦', 'Amazon Now': '⚡', 'Temu': '🛍️', 'noon': '🟡' };
  function etaLabel(d) {
    var e = d.eta || '', m = e.match(/^(\d{4}-\d{2}-\d{2})\s*(.*)$/);
    if (!m) return e;
    var day = U.parseLocalDate(m[1]), t0 = new Date(), today = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate());
    var diff = Math.round((day - today) / 86400000);
    var lbl = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff < 0 ? 'Expected ' + shortDay(day) : WEEKDAYS[day.getDay()].slice(0, 3);
    return lbl + (m[2] ? ' ' + m[2].replace(/:00/g, '') : '');
  }
  var STATUS = { out: 'Out for delivery', shipped: 'On the way', ordered: 'Ordered', delivered: 'Delivered today' };
  function billDue(b) {
    if (!b.due) return '';
    var t0 = new Date(), today = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate()), due = U.parseLocalDate(b.due);
    var n = Math.round((due - today) / 86400000);
    return (b.estimated ? '~' : '') + (n < 0 ? 'Overdue' : n === 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : n < 7 ? 'Due ' + WEEKDAYS[due.getDay()].slice(0, 3) : 'Due ' + shortDay(due));
  }
  function cardOrders() {
    var d = S.inbox || { deliveries: [], bills: [] };
    var dl = (d.deliveries || []).slice(0, 4).map(function (x) {
      var cls = x.status === 'out' ? ' hot' : x.status === 'delivered' ? ' done' : '';
      return '<div class="od' + cls + '"><span class="od-i">' + (SHOP_ICON[x.shop] || '📦') + '</span><div class="od-t"><p>' + esc(x.title || x.shop + ' order') +
        '</p><small>' + esc(x.shop) + ' · ' + STATUS[x.status] + '</small></div><b>' + esc(x.status === 'delivered' ? '✓' : etaLabel(x)) + '</b></div>';
    }).join('') || '<p class="od-none">No deliveries on the way</p>';
    var bl = (d.bills || []).slice(0, 4).map(function (b) {
      var due = billDue(b), cls = b.paid ? ' done' : /Overdue|today|tomorrow/.test(due) ? ' hot' : '';
      var amt = b.amount != null ? (b.currency === 'INR' ? '₹' : b.currency + ' ') + Math.round(b.amount).toLocaleString('en-US') : '';
      return '<div class="od' + cls + '"><div class="od-t"><p>' + esc(b.name) + '</p><small>' + (b.paid ? 'Paid ✓' : esc(due)) + '</small></div><b>' + amt + '</b></div>';
    }).join('') || '<p class="od-none">No bills due</p>';
    return '<div class="ods"><div><p class="subhead" style="margin:0 0 6px">Deliveries</p>' + dl + '</div><div><p class="subhead" style="margin:0 0 6px">Bills</p>' + bl + '</div></div>';
  }

  var TITLES = { weather: 'Weather · ' + C.location.name, calendar: 'Today', music: 'Now playing', cricket: 'Live · Cricket', kids: "Kids' board", news: 'Headlines', flight: 'Arriving flight', commute: 'Commute', reminders: 'Reminders', papa: 'On the way home', orders: 'Deliveries & bills', memories: 'Memories' };

  function cardCalendar() {
    if (!C.calendars.length && !DEMO) {
      return '<p class="empty">Add your Google Calendar\'s secret iCal link to config.js to see the family\'s day here.<small>Google Calendar → Settings → your calendar → "Secret address in iCal format"</small></p>';
    }
    if (!S.events) return '<p class="empty">Loading calendar…</p>';
    var now = new Date();
    var todayKey = U.dayKey(now);
    var today = S.events.filter(function (e) { return U.dayKey(e.start) === todayKey || (e.start < now && e.end > now); });
    var upcoming = today.filter(function (e) { return e.end > now; });
    var showTomorrow = upcoming.length === 0 || (now.getHours() >= 20);
    var rows = [];
    function row(e) {
      var cls = e.end <= now ? ' past' : (e.start <= now ? ' now' : '');
      var when = e.allDay ? 'All day' : (e.start <= now && e.end > now ? 'Now' : U.time12(e.start));
      return '<div class="ev' + cls + '"><p class="when">' + esc(when) + '</p><p class="what">' + esc(e.title) + '</p></div>';
    }
    if (!showTomorrow) {
      today.filter(function (e) { return e.end > new Date(now.getTime() - 2 * 3600000); }).slice(0, 4).forEach(function (e) { rows.push(row(e)); });
      return rows.join('');
    }
    if (upcoming.length) upcoming.slice(0, 2).forEach(function (e) { rows.push(row(e)); });
    else rows.push('<p class="ev"><span class="what" style="color:var(--muted)">Nothing else today</span></p>');
    var tmr = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    var tomorrow = S.events.filter(function (e) { return U.dayKey(e.start) === U.dayKey(tmr); }).slice(0, 3);
    rows.push('<p class="subhead">Tomorrow</p>');
    if (tomorrow.length) tomorrow.forEach(function (e) { rows.push(row(e)); });
    else rows.push('<div class="ev"><p class="what" style="color:var(--muted)">Nothing planned</p></div>');
    return rows.join('');
  }

  function cardMusic() {
    var m = S.music;
    var pos = musicProgress(m);
    var pct = (pos / m.duration * 100).toFixed(1);
    return '<div class="music"><div class="cover" style="background-image:' + (m.image ? 'url(' + esc(m.image) + ')' : 'none') + '"></div>' +
      '<div class="music-info">' +
      (m.device ? '<p class="eyebrow" style="color:var(--muted);font-size:20px">On ' + esc(m.device) + '</p>' : '') +
      '<p class="music-title">' + esc(m.title) + '</p>' +
      '<p class="music-artist">' + esc(m.artist) + (m.album ? ' · ' + esc(m.album) : '') + '</p>' +
      '<div class="progress"><span>' + mmss(pos) + '</span><div class="bar"><i style="width:' + pct + '%"></i></div><span>' + mmss(m.duration) + '</span></div>' +
      '<div class="controls">' +
      '<div class="ctl" data-ctl="prev">' + ICON.prev + '</div>' +
      '<div class="ctl" data-ctl="toggle">' + (m.playing ? ICON.pause : ICON.play) + '</div>' +
      '<div class="ctl" data-ctl="next">' + ICON.next + '</div>' +
      '</div></div></div>';
  }

  function scoreLine(s) {
    if (!s) return '';
    return s.r + '/' + s.w + ' <small>(' + s.o + ' ov)</small>';
  }

  function cardCricket() {
    var c = S.cricket, team = C.cricket.team;
    var html = '';
    if (c.live) {
      var m = c.live;
      var opp = m.teams.filter(function (t) { return t.toLowerCase().indexOf(team.toLowerCase()) !== 0; })[0] || '';
      function scoreFor(t) {
        var s = m.scores.filter(function (x) { return x.inning.toLowerCase().indexOf(t.toLowerCase()) === 0; });
        return s.length ? s[s.length - 1] : null;
      }
      var mine = scoreFor(team), theirs = opp ? scoreFor(opp) : null;
      html += '<p class="mini-s" style="margin:0 0 12px">' + esc(m.name) + '</p><div class="box">' +
        '<div class="score-row"><p class="score-team">' + esc(team) + '</p><p class="score-val">' + (mine ? scoreLine(mine) : '<small>Yet to bat</small>') + '</p></div>' +
        '<div class="score-row dim" style="margin-top:12px"><p class="score-team">' + esc(opp) + '</p><p class="score-val">' + (theirs ? scoreLine(theirs) : 'Yet to bat') + '</p></div>' +
        '<p class="status">' + esc(m.status || '') + '</p></div>';
    }
    if (c.next) {
      var n = c.next;
      html += '<div class="box" style="margin-top:' + (c.live ? '20px' : '0') + '"><p class="mini-k">Next match</p><p class="mini-v">' + esc(n.name) + '</p><p class="mini-s">' +
        (n.start ? esc(shortDay(n.start) + ' · ' + U.time12(n.start)) : '') + '</p></div>';
    }
    return html;
  }

  function cardKids() {
    return '<div class="kids">' + S.kids.slice(0, 3).map(function (k) {
      return '<div class="kid"><p class="kid-name">' + esc(k.name) + '</p>' + k.tasks.slice(0, 4).map(function (t) {
        return '<div class="task' + (t.done ? ' done' : '') + '">' + (t.done ? ICON.check : ICON.circle) + '<span>' + esc(t.text) + '</span></div>';
      }).join('') + '</div>';
    }).join('') + '</div>';
  }

  function ago(d) {
    if (!d || isNaN(d)) return '';
    var m = Math.round((Date.now() - d) / 60000);
    if (m < 60) return Math.max(m, 1) + ' min ago';
    var h = Math.round(m / 60);
    return h < 24 ? h + ' h ago' : shortDay(d);
  }

  function cardNews() {
    return '<div class="news">' + S.news.slice(0, 2).map(function (col) {
      return '<div class="news-col"><p class="subhead" style="margin:0">' + esc(col.label) + '</p>' + col.items.slice(0, 2).map(function (it) {
        return '<div class="hl"><p class="hl-t">' + esc(it.title) + '</p><p class="hl-s">' + esc([it.source, ago(it.date)].filter(Boolean).join(' · ')) + '</p></div>';
      }).join('') + '</div>';
    }).join('') + '</div>';
  }

  function cardFlight() {
    var f = activeFlight(new Date());
    if (f.unknown) {
      return '<p class="fl-who">' + esc(f.label) + '</p><p class="fl-sub">' + esc(f.number) + ' · ' + esc(f.date) + '</p>' +
        '<p class="empty">Add a free AeroDataBox key in config.js for live status.</p>';
    }
    var now = Date.now(), pct = 0;
    if (f.departUtc && f.arriveUtc) pct = Math.max(0, Math.min(100, (now - f.departUtc) / (f.arriveUtc - f.departUtc) * 100));
    var landed = /arrived|landed/i.test(f.status) || (f.arriveUtc && now > f.arriveUtc.getTime());
    var delayed = /delay/i.test(f.status);
    var left = f.arriveUtc ? Math.max(0, Math.round((f.arriveUtc - now) / 60000)) : null;
    var leftTxt = landed ? 'Landed' : left == null ? '—' : (left >= 60 ? Math.floor(left / 60) + ' h ' + (left % 60) + ' min' : left + ' min');
    var drive = S.airportMinutes != null ? S.airportMinutes + ' min' : '—';
    var leaveBy = '';
    if (!landed && f.arriveUtc && S.airportMinutes != null) {
      var leave = new Date(f.arriveUtc.getTime() + 30 * 60000 - S.airportMinutes * 60000);   // allow ~30 min for bags
      leaveBy = ' · leave ' + U.time12(leave);
    }
    return '<div style="display:flex;justify-content:space-between;align-items:flex-start"><div><p class="fl-who">' + esc(f.label) + '</p>' +
      '<p class="fl-sub">' + esc([f.number, f.airline].filter(Boolean).join(' · ')) + '</p></div>' +
      '<p class="pill' + (delayed ? ' warn' : '') + '">' + esc(landed ? 'Landed' : delayed ? 'Delayed' : 'On its way') + '</p></div>' +
      '<div class="route"><div><p class="code">' + esc(f.from) + '</p><p class="tm">Departed ' + esc(f.depart ? U.time12(f.depart) : '—') + '</p></div>' +
      '<div class="line"><i style="width:' + (landed ? 100 : pct.toFixed(0)) + '%"></i></div>' +
      '<div style="text-align:right"><p class="code">' + esc(f.to) + '</p><p class="tm">Lands ' + esc(f.arrive ? U.time12(f.arrive) : '—') + '</p></div></div>' +
      '<div class="grid3"><div><p class="mini-s">Terminal</p><p class="mini-v">' + esc(f.terminal || '—') + '</p></div>' +
      '<div><p class="mini-s">Time left</p><p class="mini-v">' + esc(leftTxt) + '</p></div>' +
      '<div><p class="mini-s">Drive to airport</p><p class="mini-v">' + esc(drive + leaveBy) + '</p></div></div>';
  }

  function cardWeather() {
    var w = S.weather;
    var hrs = w.hours.map(function (x) {
      return '<div class="wh"><p class="wh-t">' + esc(U.time12(x.time).replace(':00', '')) + '</p>' + (ICON[x.icon] || ICON.cloud) +
        '<p class="wh-v">' + x.temp + '°</p>' + (x.rain >= 20 ? '<p class="wh-r">' + x.rain + '%</p>' : '') + '</div>';
    }).join('');
    var days = w.days.slice(0, 5).map(function (d) {
      var dt = U.parseLocalDate(d.date);
      return '<div class="wd"><p class="wd-d">' + esc(WEEKDAYS[dt.getDay()].slice(0, 3)) + '</p>' + (ICON[d.icon] || ICON.cloud) +
        '<p class="wd-v">' + d.high + '° <span>' + d.low + '°</span></p></div>';
    }).join('');
    return '<div class="wx-card"><div class="wx-now"><p class="mini-k">Feels like</p><p class="mini-v">' + w.feels + '°</p>' +
      '<p class="mini-k">Humidity</p><p class="mini-v">' + w.humidity + '%</p>' +
      '<p class="mini-k">Wind</p><p class="mini-v">' + w.wind + ' km/h</p></div>' +
      '<div class="wx-right"><div class="wx-hours">' + hrs + '</div><div class="wx-days">' + days + '</div></div></div>';
  }

  // Morning: home → office. From 1 PM: office → home.
  function routeDir() { var toWork = new Date().getHours() < 13; return { toWork: toWork, from: toWork ? C.commute.origin : C.commute.destination, to: toWork ? C.commute.destination : C.commute.origin }; }
  async function loadRoute(force) {
    var d = routeDir();
    if (!force && S.route && S.route.toWork === d.toWork && Date.now() - S.route.at < 5 * 60000) return;
    if (loadRoute.busy) return;
    loadRoute.busy = true;
    try {
      var r = DEMO ? Sources.demo().route : await Sources.commuteDetail(d.from, d.to);
      if (r) { r.toWork = d.toWork; r.at = r.at || new Date(); S.route = r; S.routeFailed = false; } else S.routeFailed = true;
    } catch (e) { console.warn('[route]', e.message); S.routeFailed = true; }
    loadRoute.busy = false;
    if (view.card === 'commute' && !view.idle) drawCard(false);
  }
  function cardCommute() {
    var r = S.route, d = routeDir();
    if (!r || r.toWork !== d.toWork) { loadRoute(); return '<p class="empty">Checking the roads…</p>'; }
    if (Date.now() - r.at > 15 * 60000) loadRoute();
    var delta = r.minutes - r.usual, cls = delta >= 8 ? 'bad' : delta >= 3 ? 'warn' : 'good';
    var pill = delta >= 3 ? '+' + delta + ' min traffic' : 'Light traffic';
    var arrive = new Date(Date.now() + r.minutes * 60000);
    function row(k, v) { return '<div class="cm-row"><span>' + k + '</span><b>' + v + '</b></div>'; }
    var alt = (r.alts || [])[0];
    return '<div class="cm-card"><div class="cm-mapwrap"><img class="cm-map" src="' + esc(r.mapUrl) + '" alt=""></div>' +
      '<div class="cm-info">' +
        '<p class="cm-dir">' + (r.toWork ? 'Home → Office' : 'Office → Home') + '<span>Live · ' + U.time12(r.at) + '</span></p>' +
        '<div class="cm-head"><p class="cm-time">' + r.minutes + '<span>min</span></p><span class="cm-pill ' + cls + '">' + pill + '</span></div>' +
        '<p class="cm-via">' + (r.desc ? 'via ' + esc(r.desc) : '') + '</p>' +
        '<div class="cm-rows">' + row('Arrive if you leave now', U.time12(arrive)) + row('Usually', r.usual + ' min') + row('Distance', r.km + ' km') +
          (alt ? row(esc('Or via ' + (alt.desc || 'another route')), alt.minutes + ' min') : '') + '</div>' +
      '</div></div>';
  }

  var CARD_FN = { memories: cardMemories, orders: cardOrders, papa: cardPapa, reminders: cardReminders, commute: cardCommute, weather: cardWeather, calendar: cardCalendar, music: cardMusic, cricket: cardCricket, kids: cardKids, news: cardNews, flight: cardFlight };

  function drawCard(animate) {
    var list = eligibleCards();
    if (list.indexOf(view.card) < 0) view.card = list[0];
    $('cardTitle').textContent = TITLES[view.card];
    $('cardDots').innerHTML = list.length > 1 ? list.map(function (c) { return '<span class="dot' + (c === view.card ? ' on' : '') + '"></span>'; }).join('') : '';
    var el = $('card');
    el.innerHTML = CARD_FN[view.card]();
    if (animate) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
    if (view.card !== 'music' && view.focusRow === 'music') { view.focusRow = 'panel'; }
    drawFocus();
  }

  function rotateCard(step, manual) {
    if (view.tour && !manual) return;
    if (view.focusRow === 'music') return;           // don't move the card while you're using its buttons
    if (!manual && view.manualAt && Date.now() - view.manualAt < 60000) return;  // pause auto-rotation after a manual switch
    var list = eligibleCards();
    if (manual) list = list.concat(['gallery']);       // the art gallery is the last stop when you switch by hand
    var i = list.indexOf(view.card);
    var n = list.length;
    var next = list[((i + (step || 1)) % n + n) % n];
    if (manual) view.manualAt = Date.now();
    if (next === 'gallery') { view.manualGallery = true; enterIdle(); return; }
    view.card = next;
    drawCard(true);
  }

  // ---------- Apps row & focus ----------
  function appIcon(appId) {
    if (!ON_TV || !appId) return '';
    try {
      var info = tizen.application.getAppInfo(appId);
      var p = info && info.iconPath;
      if (!p) return '';
      return /^(file|https?):/.test(p) ? p : 'file://' + p;
    } catch (e) { return ''; }
  }

  var APP_DOT = { 'netflix': '#E50914', 'youtube': '#FF0033', 'youtube kids': '#FF4E45', 'prime video': '#1A98FF', 'disney+': '#2F5BFF',
    'spotify': '#1DB954', 'apple tv': '#A1A1A6', 'shahid': '#2EC4B6', 'osn+': '#E4A11B', 'jiohotstar': '#1F80E0' };
  // The apps row, plus a last "Gallery" tile (Samsung's smart remote has no colour buttons).
  function appTiles() { return C.apps.concat([{ label: 'Gallery', gallery: true, color: '#F2B36B' }]); }
  function drawApps() {
    // Calm, identical tiles: name + a small brand-colour dot (no mismatched logo images).
    $('apps').innerHTML = appTiles().map(function (a, i) {
      var dot = a.color || APP_DOT[String(a.label).toLowerCase()] || '#F2B36B';
      return '<div class="app app-c" data-i="' + i + '"><b class="app-dot" style="background:' + esc(dot) + '"></b><span>' + esc(a.label) + '</span></div>';
    }).join('');
    drawFocus();
  }

  function focusables(row) {
    if (row === 'music') return Array.prototype.slice.call(document.querySelectorAll('#card .ctl'));
    if (row === 'panel') return Array.prototype.slice.call(document.querySelectorAll('.card-wrap'));
    return Array.prototype.slice.call(document.querySelectorAll('#apps .app'));
  }

  function drawFocus() {
    document.querySelectorAll('.focus').forEach(function (e) { e.classList.remove('focus'); });
    var list = focusables(view.focusRow);
    if (!list.length) { view.focusRow = 'apps'; list = focusables('apps'); }
    view.focusIdx = Math.max(0, Math.min(view.focusIdx, list.length - 1));
    if (list[view.focusIdx]) list[view.focusIdx].classList.add('focus');
  }

  function launchApp(a) {
    if (a && a.gallery) { view.manualGallery = true; enterIdle(); return; }
    if (!a.appId) { toast('No app ID set for ' + a.label + ' — press the BLUE button to find it.'); return; }
    if (!ON_TV) { toast('Would open ' + a.label + ' (' + a.appId + ') on the TV'); return; }
    try {
      tizen.application.launch(a.appId, function () {}, function (e) { toast('Could not open ' + a.label + ': ' + e.message); });
    } catch (e) { toast('Could not open ' + a.label); }
  }

  async function musicAction(which) {
    if (DEMO) {
      if (which === 'toggle') S.music.playing = !S.music.playing;
      drawAll();
      return;
    }
    var m = S.music;
    var action = which === 'toggle' ? (m && m.playing ? 'pause' : 'play') : which;
    try {
      await Sources.spotifyControl(action);
      setTimeout(loadMusic, 700);
    } catch (e) {
      toast('Spotify control needs Spotify Premium (and an active device).');
    }
  }

  // ---------- Background & gallery ----------
  function drawBackground() {
    var a = S.artHome;
    $('bgDim').style.background = 'rgba(10,12,16,' + C.backgroundDim + ')';
    if (!a) return;
    var bg = $('bg');
    if (bg.dataset.src !== a.src) {
      bg.style.opacity = 0;
      setTimeout(function () { bg.style.backgroundImage = 'url("' + a.src + '")'; bg.dataset.src = a.src; bg.style.opacity = 1; }, 600);
    }
    $('credit').textContent = a.title + ' · ' + a.artist + (a.date ? ', ' + a.date : '') + ' · ' + a.museum;
  }

  function drawIdleArt() {
    var a = S.artIdle;
    if (!a) return;
    var stage = $('iStage').getBoundingClientRect();
    var maxW = (stage.width > 200 ? stage.width : 1100) - 40;        // older TV browsers can report 0 here
    var maxH = (stage.height > 200 ? stage.height : 720) - 40;       // frame padding
    var w = maxW, h = w / a.ratio;
    if (h > maxH) { h = maxH; w = h * a.ratio; }
    var frame = $('iFrame');
    frame.style.width = Math.round(w + 40) + 'px';
    frame.style.height = Math.round(h + 40) + 'px';
    $('iImg').src = a.src;
    $('iImg').alt = a.title + ' by ' + a.artist;
    $('iTheme').textContent = 'Gallery · ' + a.theme;
    $('iTitle').textContent = a.title;
    $('iArtist').textContent = a.artist;
    $('iMeta').textContent = [a.date, a.medium].filter(Boolean).join(' · ');
    $('iNote').textContent = a.note || '';
    $('iMuseum').textContent = (a.film || a.family) ? a.museum : a.museum + ' · Open Access';
  }

  async function loadHomeArt() {
    var dayIndex = Math.floor(Date.now() / 86400000);
    var art = await Sources.pickArt('landscape', dayIndex);
    if (art) S.artHome = art;
  }

  async function loadIdleArt() {
    if (loadIdleArt.busy) return;
    loadIdleArt.busy = true;
    try { await loadIdleArtInner(); } finally { loadIdleArt.busy = false; }
  }
  async function loadIdleArtInner() {
    var art = null;
    if (view.manualGallery) {
      // Carousel (opened from the Gallery tile): four paintings, then a film poster, and round again.
      var slot = view.gSlot = (view.gSlot || 0) + 1;
      if (slot % 5 === 0 && C.tmdbKey) { try { art = await Sources.pickFilm(); } catch (e) { console.warn('[poster]', e.message); } }
      if (!art) art = await Sources.pickArt('any', null, true);
    } else if (C.photoFrame !== false) {
      // Night gallery: every few pictures, a family photo instead of a painting.
      loadIdleArt.n = (loadIdleArt.n || 0) + 1;
      if (loadIdleArt.n % (C.photoEvery || 4) === 0) {
        try {
          var p = await nextPhoto();
          if (p) art = { src: p.src, ratio: p.ratio, title: p.kicker, artist: p.caption, date: '', medium: '', note: '', museum: 'From our family photos', theme: 'Family', family: true };
        } catch (e) { console.warn('[gallery photo]', e.message); }
      }
    }
    if (!art) art = await Sources.pickArt('any');
    if (art) {
      var frame = $('iFrame');
      if (view.idle) { frame.style.opacity = 0; await new Promise(function (r) { setTimeout(r, 900); }); }
      S.artIdle = art;
      drawIdleArt();
      frame.style.opacity = 1;
    }
  }

  function enterIdle() {
    if (view.idle) return;
    view.idle = true;
    $('idle').classList.remove('hidden');
    $('home').classList.add('hidden');
    drawIdleArt();
    view.gSlot = 0;
    loadIdleArt();
    clearInterval(view.carousel);
    if (view.manualGallery) view.carousel = setInterval(function () { if (view.idle && !document.hidden) loadIdleArt(); }, (C.galleryCarouselSeconds || 60) * 1000);
  }

  function exitIdle() {
    clearInterval(view.carousel);
    view.idle = false;
    view.manualGallery = false;
    $('idle').classList.add('hidden');
    $('home').classList.remove('hidden');
    drawAll();
  }

  // ---------- Ask the TV (questions come from the iPhone Shortcut via the laptop) ----------
  // The laptop asks Claude; answers arrive through /state as a short card or a full screen
  // (trip plan, explainer, quiz). Remote: arrows move, OK picks, BACK closes.
  var A = { open: false, kind: '', data: null, page: 0, quiz: null, cardTimer: null };

  function postContext() {
    if (!RELAY) return;
    var now = new Date(), soon = now.getTime() + 3 * 86400000;
    function t(d) { try { return d ? new Date(d).toString().slice(0, 21) : ''; } catch (e) { return ''; } }
    var w = S.weather || {};
    var snap = {
      screen: A.open ? 'ask:' + A.kind : view.idle ? 'gallery' : view.card,
      weather: S.weather ? { now: w.temp + '°, ' + w.desc, feels: w.feels, high: w.high, low: w.low, uv: w.uv, humidity: w.humidity,
        sunrise: w.sunrise, sunset: w.sunset, nextHours: (w.hours || []).slice(0, 8), nextDays: (w.days || []).slice(0, 5) } : null,
      airQuality: S.aqi || null,
      calendar: (S.events || []).filter(function (e) { return e.end > now && e.start < soon; }).slice(0, 30).map(function (e) {
        return { title: e.title, start: t(e.start), end: t(e.end), allDay: !!e.allDay, who: e.who || '' };
      }),
      reminders: S.phone && S.phone.reminders ? S.phone.reminders.slice(0, 15) : [],
      commuteToOffice: S.route ? { minutes: S.route.minutes, usual: S.route.usual, km: S.route.km, via: S.route.desc, direction: S.route.toWork ? 'home to office' : 'office to home', checked: t(S.route.at) } : null,
      onTheWayHome: S.papa ? { minutesToHome: S.papa.minutes, km: S.papa.km, via: S.papa.desc, seen: t(S.papa.fixAt || S.papa.at) } : null,
      exchangeRates: S.fx ? { base: (C.fx || {}).base || 'AED', quote: (C.fx || {}).quote || 'INR', rate: S.fx.rate, usd: S.fx.usd, gold22kPerGram: S.fx.gold,
        changeToday: { base: S.fx.change, usd: S.fx.usdChange, gold: S.fx.goldChange } } : null,
      deliveries: S.inbox ? (S.inbox.deliveries || []) : [],
      bills: S.inbox ? (S.inbox.bills || []) : [],
      headlines: (S.news || []).slice(0, 8).map(function (n) { return n.title; }),
      onScreenArt: (view.idle ? S.artIdle : S.artHome) ? (function (a) { return { title: a.title, by: a.artist, date: a.date, museum: a.museum, note: a.note }; })(view.idle ? S.artIdle : S.artHome) : null,
      screens: eligibleCards(),
      apps: C.apps.map(function (a) { return a.label; })
    };
    try { fetch(RELAY + '/context', { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(snap) }); } catch (e) { /* ignore */ }
  }

  function askChip(busy) {
    var el = $('askchip');
    if (!busy) { el.classList.add('hidden'); return; }
    el.innerHTML = '<span class="askdot"></span>' + esc(C.assistantName ? C.assistantName + ' is thinking…' : 'Thinking…') + ' <q>' + esc(busy.q || '') + '</q>';
    el.classList.remove('hidden');
  }

  function askActions(list) {
    (list || []).forEach(function (a) {
      try {
        if (a.do === 'gallery') { view.manualGallery = true; enterIdle(); }
        else if (a.do === 'home') { if (view.idle) exitIdle(); }
        else if (a.do === 'play_jazz') playCalm(false, 'jazz');
        else if (a.do === 'play_bhajans') playCalm(false, 'bhajans');
        else if (a.do === 'stop_music') stopCalm();
        else if (a.do === 'show_screen' && a.target) {
          var tgt = String(a.target).toLowerCase(), map = { deliveries: 'orders', bills: 'orders', photos: 'memories', headlines: 'news', 'on the way home': 'papa' };
          tgt = map[tgt] || tgt;
          if (eligibleCards().indexOf(tgt) >= 0) { if (view.idle) exitIdle(); view.card = tgt; view.manualAt = Date.now(); drawCard(true); }
        } else if (a.do === 'open_app' && a.target) {
          var name = String(a.target).toLowerCase();
          var app = C.apps.filter(function (x) { return x.label.toLowerCase() === name; })[0] ||
            C.apps.filter(function (x) { return x.label.toLowerCase().indexOf(name) >= 0 || name.indexOf(x.label.toLowerCase()) >= 0; })[0];
          if (app) setTimeout(function () { launchApp(app); }, 2500);   // let the card and voice start first
        }
      } catch (e) { console.warn('[ask action]', e.message); }
    });
  }

  // Claude's answers are usually well-formed, but tidy up the odd variation before drawing.
  function tidyAsk(r) {
    var e = r.explainer;
    if (e) {
      var pages = e.pages || (e.points ? [e.points] : []);
      var flat = [];
      (pages || []).forEach(function (p) { if (typeof p === 'string') flat.push(p); else if (p && p.length) p.forEach(function (x) { if (x) flat.push(String(x)); }); });
      e.pages = [];
      for (var i = 0; i < flat.length && e.pages.length < 4; i += 3) e.pages.push(flat.slice(i, i + 3));
    }
    var t = r.trip;
    if (t && t.days) t.days = t.days.filter(function (d) { return d && d.stops && d.stops.length; }).slice(0, 7);
    var q = r.quiz;
    if (q && q.questions) q.questions = q.questions.filter(function (x) {
      return x && x.q && x.options && x.options.length === 4 && x.answer >= 0 && x.answer < 4;
    }).slice(0, 15);
    return r;
  }

  function tvlog(msg) { try { if (RELAY) fetch(RELAY + '/tvlog', { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: String(msg).slice(0, 2000) }); } catch (e) { /* ignore */ } }
  window.addEventListener('error', function (e) { tvlog('JS error: ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno); });

  function handleAsk(a) {
    try { handleAskInner(a); } catch (e) {
      tvlog('handleAsk failed (' + ((a.result || {}).kind) + '): ' + e.message + ' ' + (e.stack || '').slice(0, 600));
      try { showAskCard(a, a.result || {}); } catch (e2) { /* ignore */ }
    }
  }
  function handleAskInner(a) {
    askChip(null);
    var r = tidyAsk(a.result || {});
    var kind = r.kind;
    if (kind === 'trip' && !(r.trip && r.trip.days && r.trip.days.length)) kind = 'card';
    if (kind === 'explainer' && !(r.explainer && r.explainer.pages && r.explainer.pages.length)) kind = 'card';
    if (kind === 'quiz' && !(r.quiz && r.quiz.questions && r.quiz.questions.length)) kind = 'card';
    if (kind === 'route' && !(r.route && r.route.destination && C.googleMapsKey)) kind = 'card';
    askActions(r.actions);
    if (kind === 'card') showAskCard(a, r);
    else openAsk(kind, a, r);
    tvlog('ask shown: ' + kind + ' (asked for ' + r.kind + ') · ' + (a.q || '').slice(0, 80));
    if (r.speech) speak(r.speech, C.assistantVoice);
  }

  function showAskCard(a, r) {
    var c = r.card || {}, el = $('askcard');
    el.innerHTML = '<p class="ak">' + esc(C.assistantName ? 'Ask ' + C.assistantName : 'Ask the TV') + '<span>“' + esc(a.q || '') + '”</span></p>' +
      '<p class="aans">' + esc(c.answer || r.speech || '') + '</p>' +
      (c.detail ? '<p class="asub">' + esc(c.detail) + '</p>' : '') +
      '<p class="ahint">Closes by itself · BACK to close now · Ask for “more detail” to open it full screen</p>';
    el.classList.remove('hidden');
    clearTimeout(A.cardTimer);
    A.cardTimer = setTimeout(closeAskCard, 25000);
  }
  function closeAskCard() { clearTimeout(A.cardTimer); $('askcard').classList.add('hidden'); }

  function openAsk(kind, a, r) {
    closeAskCard();
    A.open = true; A.kind = kind; A.q = a.q; A.who = a.who; A.data = r[kind]; A.page = 0; A.quiz = null; A.img = null;
    if (kind === 'quiz') {
      var players = (A.data.players || []).filter(Boolean);
      A.quiz = { i: 0, focus: 0, players: players, turn: 0, scores: players.map(function () { return 0; }), total: 0, answered: -1, done: false };
    }
    if (kind === 'route') {
      A.route = null; A.routeErr = false;
      Sources.commuteDetail(C.commute.origin, A.data.destination, true).then(function (rt) {
        if (A.open && A.kind === 'route') { A.route = rt; A.routeErr = !rt; drawAsk(); }
      }).catch(function () { if (A.open && A.kind === 'route') { A.routeErr = true; drawAsk(); } });
    }
    if (kind === 'explainer' && A.data.image_query) {
      var want = A.data.image_query;
      U.json('https://openaccess-api.clevelandart.org/api/artworks/?cc0=1&has_image=1&limit=8&q=' + encodeURIComponent(want))
        .then(function (d) {
          var hit = (d.data || []).filter(function (x) { return x.images && x.images.web && x.images.web.width >= 700; })[0];
          if (hit && A.open && A.kind === 'explainer') { A.img = { src: hit.images.web.url, credit: hit.title + ', ' + ((hit.creators && hit.creators[0] && hit.creators[0].description) || 'Cleveland Museum of Art').replace(/\s*\(.*$/, '') }; drawAsk(); }
        }).catch(function () { /* no picture is fine */ });
    }
    $('ask').classList.remove('hidden');
    drawAsk();
  }
  function closeAsk() { A.open = false; $('ask').classList.add('hidden'); $('ask').innerHTML = ''; }

  function tripMapUrl(stops) {
    var pts = (stops || []).filter(function (s) { return typeof s.lat === 'number' && typeof s.lng === 'number'; });
    if (!C.googleMapsKey || !pts.length) return '';
    var st = ['element:geometry|color:0x1d2330', 'element:labels.text.fill|color:0x9aa3b2', 'element:labels.text.stroke|color:0x12151c',
      'feature:water|element:geometry|color:0x0e2233', 'feature:road|element:geometry|color:0x2b3342', 'feature:poi|visibility:off'];
    var q = ['size=640x440', 'scale=2', 'key=' + encodeURIComponent(C.googleMapsKey)];
    st.forEach(function (x) { q.push('style=' + encodeURIComponent(x)); });
    pts.forEach(function (p, i) { q.push('markers=' + encodeURIComponent('color:0xF2B36B|label:' + (i + 1) + '|' + p.lat + ',' + p.lng)); });
    return 'https://maps.googleapis.com/maps/api/staticmap?' + q.join('&');
  }

  function askTop(right) {
    var n = new Date(), h = n.getHours() % 12 || 12;
    return '<div class="atop"><p class="at">' + h + ':' + U.pad(n.getMinutes()) + '<small>' + (n.getHours() < 12 ? 'AM' : 'PM') + '</small></p><div class="ar">' + right + '</div></div>';
  }
  function askBottom(parts) { return '<div class="abottom">' + parts.map(function (p) { return '<span>' + p + '</span>'; }).join('') + '</div>'; }

  function drawAsk() {
    var el = $('ask'), d = A.data, html = '', asked = '“' + esc(A.q || '') + '”' + (A.who ? ' · ' + esc(A.who) : '');
    if (A.kind === 'route') {
      var rt = A.route, name = d.label || d.destination;
      function rrow(k, v) { return '<div class="arow"><span>' + k + '</span><b>' + v + '</b></div>'; }
      html = askTop(asked) + '<div class="aroute"><div class="armap">' + (rt && rt.mapUrl ? '<img src="' + esc(rt.mapUrl) + '" alt="">' : '<p class="await">' + (A.routeErr ? 'Couldn\'t find a route there.' : 'Checking live traffic…') + '</p>') + '</div>' +
        '<div class="arinfo"><p class="ak">Route · from home</p><p class="attl">' + esc(name) + '</p>' +
        (rt ? '<p class="armin">' + rt.minutes + '<span>min</span>' + (rt.usual && rt.minutes - rt.usual >= 5 ? '<em>+' + (rt.minutes - rt.usual) + ' min traffic</em>' : '') + '</p>' +
          (rt.desc ? '<p class="arvia">via ' + esc(rt.desc) + '</p>' : '') +
          '<div class="arows">' + rrow('Arrive if you leave now', U.time12(new Date(Date.now() + rt.minutes * 60000))) + (rt.usual ? rrow('Usually', rt.usual + ' min') : '') + rrow('Distance', rt.km + ' km') + '</div>' : '') +
        '</div></div>' + askBottom(['', 'Live traffic from Google', '<b>BACK</b> close']);
    } else if (A.kind === 'trip') {
      var days = d.days, day = days[A.page] || days[0], map = tripMapUrl(day.stops);
      html = askTop(asked) + '<div class="atrip"><div class="al"><p class="ak">Trip plan</p><p class="attl">' + esc(d.title) + '</p>' +
        (d.meta ? '<p class="ameta">' + esc(d.meta) + '</p>' : '') +
        (map ? '<div class="amap"><img src="' + esc(map) + '" alt=""></div>' : '') + '</div>' +
        '<div class="arr"><div class="atabs">' + days.map(function (x, i) { return '<span class="atab' + (i === A.page ? ' on' : '') + '">' + esc(x.label || 'Day ' + (i + 1)) + '</span>'; }).join('') + '</div>' +
        '<p class="aday">' + esc(day.title || '') + '</p><div class="astops">' + day.stops.map(function (s, i) {
          return '<div class="astop"><p class="atm">' + esc(s.time || '') + '</p><div><p class="anm"><span class="an">' + (i + 1) + '</span>' + esc(s.name) + '</p><p class="ads">' + esc(s.desc || '') + '</p></div></div>';
        }).join('') + '</div></div></div>' +
        askBottom(['<b>◀ ▶</b> change day', 'A copy is on your phone', '<b>BACK</b> close']);
    } else if (A.kind === 'explainer') {
      var pages = d.pages, pg = pages[A.page] || pages[0];
      html = askTop(asked) + '<div class="aexp' + (A.img ? '' : ' noimg') + '">' + (A.img ? '<div class="aimg"><img src="' + esc(A.img.src) + '" alt=""></div>' : '') +
        '<div><p class="ak">' + esc(C.assistantName || 'Ask the TV') + (d.audience ? ' · ' + esc(d.audience) : '') + '</p><p class="attl">' + esc(d.title) + '</p>' +
        pg.map(function (p, i) { return '<div class="apt"><span class="anum">' + (A.page * 3 + i + 1) + '</span><p>' + esc(p) + '</p></div>'; }).join('') +
        (pages.length > 1 ? '<div class="adots">' + pages.map(function (x, i) { return '<i' + (i === A.page ? ' class="on"' : '') + '></i>'; }).join('') + '</div>' : '') +
        '</div></div>' + askBottom([pages.length > 1 ? '<b>◀ ▶</b> more' : '', A.img ? 'Picture: ' + esc(A.img.credit) : '', '<b>BACK</b> close']);
    } else if (A.kind === 'quiz') {
      var Q = A.quiz, qs = d.questions;
      var score = Q.players.length ? Q.players.map(function (p, i) { return '<span' + (!Q.done && i === Q.turn ? ' class="turn"' : '') + '>' + esc(p) + '<b>' + Q.scores[i] + '</b></span>'; }).join('') : '<span>Score<b>' + Q.total + ' / ' + qs.length + '</b></span>';
      if (Q.done) {
        var best = Q.players.length ? Math.max.apply(null, Q.scores) : Q.total;
        var winners = Q.players.filter(function (p, i) { return Q.scores[i] === best; });
        html = askTop('<div class="ascore">' + score + '</div>') + '<div class="aquiz"><p class="ak">' + esc(d.topic) + ' · finished</p>' +
          '<p class="aqq small">' + (Q.players.length ? (winners.length > 1 ? 'It\'s a tie!' : esc(winners[0]) + ' wins!') : 'You got ' + Q.total + ' out of ' + qs.length + '!') + '</p></div>' +
          askBottom(['', '<b>OK</b> or <b>BACK</b> close', '']);
      } else {
        var q = qs[Q.i];
        html = askTop('<div class="ascore">' + score + '</div>') + '<div class="aquiz"><p class="ak">Quiz · ' + esc(d.topic) + ' · question ' + (Q.i + 1) + ' of ' + qs.length + '</p>' +
          '<p class="aqq' + (q.q.length > 40 ? ' small' : '') + '">' + esc(q.q) + '</p><div class="aopts">' + q.options.map(function (o, i) {
            var cls = 'aopt';
            if (Q.answered >= 0) { if (i === q.answer) cls += ' right'; else if (i === Q.answered) cls += ' wrong'; }
            else if (i === Q.focus) cls += ' f';
            return '<div class="' + cls + '"><i>' + 'ABCD'[i] + '</i>' + esc(o) + '</div>';
          }).join('') + '</div></div>' +
          askBottom(['<b>Arrows</b> choose', '<b>OK</b> answer' + (Q.players.length ? ' · ' + esc(Q.players[Q.turn]) + '\'s turn' : ''), '<b>BACK</b> stop the quiz']);
      }
    }
    el.innerHTML = html;
  }

  function askKey(code) {
    if (code === KEY.BACK || code === KEY.ESC) { closeAsk(); stopSpeech(); return; }
    if (A.kind === 'route') return;
    if (A.kind === 'trip' || A.kind === 'explainer') {
      var n = A.kind === 'trip' ? A.data.days.length : A.data.pages.length;
      if (code === KEY.RIGHT || code === KEY.DOWN || code === KEY.ENTER) A.page = Math.min(n - 1, A.page + 1);
      else if (code === KEY.LEFT || code === KEY.UP) A.page = Math.max(0, A.page - 1);
      drawAsk();
      return;
    }
    if (A.kind === 'quiz') {
      var Q = A.quiz, q = A.data.questions[Q.i];
      if (Q.done) { if (code === KEY.ENTER) closeAsk(); return; }
      if (Q.answered >= 0) return;                                   // waiting for the next question
      if (code === KEY.LEFT) Q.focus = Q.focus % 2 ? Q.focus - 1 : Q.focus;
      else if (code === KEY.RIGHT) Q.focus = Q.focus % 2 ? Q.focus : Q.focus + 1;
      else if (code === KEY.UP) Q.focus = Q.focus >= 2 ? Q.focus - 2 : Q.focus;
      else if (code === KEY.DOWN) Q.focus = Q.focus < 2 ? Q.focus + 2 : Q.focus;
      else if (code === KEY.ENTER) {
        Q.answered = Q.focus;
        var ok = Q.focus === q.answer;
        if (ok) { if (Q.players.length) Q.scores[Q.turn]++; else Q.total++; }
        speak(ok ? 'Correct!' : 'Not quite. It\'s ' + q.options[q.answer] + '.', C.assistantVoice);
        setTimeout(function () {
          if (!A.open || A.kind !== 'quiz') return;
          Q.answered = -1; Q.focus = 0;
          if (Q.players.length) Q.turn = (Q.turn + 1) % Q.players.length;
          if (Q.i + 1 >= A.data.questions.length) {
            Q.done = true;
            var best = Q.players.length ? Math.max.apply(null, Q.scores) : Q.total;
            var winners = Q.players.filter(function (p, i) { return Q.scores[i] === best; });
            speak(Q.players.length ? (winners.length > 1 ? 'It\'s a tie! Well played.' : winners[0] + ' wins! Well played.') : 'You got ' + Q.total + ' out of ' + A.data.questions.length + '.', C.assistantVoice);
          } else Q.i++;
          drawAsk();
        }, 2600);
      }
      drawAsk();
    }
  }

  // ---------- Meeting reminder (the laptop brings the app to the front over Netflix etc.) ----------
  function closeOverlay() { var ov = $('overlay'); ov.classList.add('hidden'); ov.classList.remove('remind'); ov.dataset.kind = ''; clearTimeout(closeOverlay.t); }
  function showMeetingReminder(r) {
    var st = new Date((r.start || 0) * 1000), mins = Math.max(0, Math.round((st - Date.now()) / 60000));
    var who = r.who || '', when = mins <= 0 ? 'starting now' : 'in ' + mins + ' minute' + (mins === 1 ? '' : 's');
    var ov = $('overlay');
    ov.dataset.kind = 'remind';
    ov.classList.add('remind');
    ov.innerHTML = '<p class="rmd-k">' + esc(who ? who + "'s meeting" : 'Meeting') + ' · ' + esc(when) + '</p>' +
      '<p class="rmd-t">' + esc(r.title || 'Meeting') + '</p>' +
      '<p class="rmd-w">' + esc(U.time12(st)) + '</p>' +
      '<p class="rmd-h">Press BACK to return to what you were watching</p>';
    ov.classList.remove('hidden');
    speak((who ? who + ', your ' : 'Your ') + 'meeting ' + (r.title || '') + ' starts ' + when + '.');
    clearTimeout(closeOverlay.t);
    closeOverlay.t = setTimeout(closeOverlay, 3 * 60000);
  }

  // ---------- Overlay: installed app IDs ----------
  function showAppIds() {
    var ov = $('overlay');
    ov.classList.remove('hidden');
    ov.innerHTML = '<h2>Apps installed on this TV</h2><p class="hint">Copy the IDs you need into the apps list in js/config.js. Press BACK to close.</p><div class="list">Loading…</div>';
    if (!ON_TV) { ov.querySelector('.list').textContent = 'This list only works on the TV.'; return; }
    try {
      tizen.application.getAppsInfo(function (apps) {
        apps.sort(function (a, b) { return a.name.localeCompare(b.name); });
        ov.querySelector('.list').innerHTML = apps.filter(function (a) { return a.show !== false; }).map(function (a) {
          return '<div>' + esc(a.name) + ' — <b>' + esc(a.id) + '</b></div>';
        }).join('');
      }, function (e) { ov.querySelector('.list').textContent = 'Could not read apps: ' + e.message; });
    } catch (e) { ov.querySelector('.list').textContent = 'Could not read apps: ' + e.message; }
  }

  // ---------- Spoken greetings (morning on workdays, evening every day) ----------
  var G = { active: null, buttons: [], idx: 0, audio: null, music: null, timer: null };
  var RELAY = (C.corsProxy || '').replace(/\/proxy\?url=$/, '');

  function todayStamp(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function spokenTime(d) {
    var h = d.getHours(), m = d.getMinutes(), ap = h < 12 ? 'AM' : 'PM';
    h = h % 12 || 12;
    return h + (m ? ':' + U.pad(m) : '') + ' ' + ap;
  }
  function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function firstSentence(t) { var m = String(t || '').match(/^.*?[.!?](\s|$)/); return (m ? m[0] : String(t || '')).trim().slice(0, 220); }

  // Speak through the home-server relay (natural voice). Resolves when finished, or on any error.
  function speak(text, voice) {
    stopSpeech();
    return new Promise(function (resolve) {
      if (!RELAY || !text) { resolve(); return; }
      var a = new Audio(RELAY + '/tts?voice=' + encodeURIComponent(voice || (C.greetings && C.greetings.voice) || '') + '&text=' + encodeURIComponent(text));
      G.audio = a;
      var finished = false;
      var done = function () { if (finished) return; finished = true; clearTimeout(t1); clearTimeout(t2); if (G.audio === a) G.audio = null; resolve(); };
      a.onended = done; a.onerror = done;
      // Never get stuck: give up if the voice hasn't started in 10 s, or after 60 s overall.
      var t1 = setTimeout(function () { if (a.paused || !a.currentTime) { try { a.pause(); } catch (e) { /* ignore */ } done(); } }, 10000);
      var t2 = setTimeout(done, 60000);
      if (G.music) G.music.volume = 0.25;
      var p = a.play();
      if (p && p.catch) p.catch(done);
    }).then(function () { if (G.music) G.music.volume = 1; });
  }
  function stopSpeech() { if (G.audio) { try { G.audio.pause(); } catch (e) { /* ignore */ } G.audio = null; } }

  function greetPanel(title, lines, buttons) {
    var el = $('greet');
    el.innerHTML = '<p class="g-title">' + esc(title) + '</p>' +
      lines.map(function (l) { return '<p class="g-line">' + esc(l) + '</p>'; }).join('') +
      (buttons.length ? '<div class="g-btns">' + buttons.map(function (b, i) {
        return '<span class="g-btn' + (i === 0 ? ' g-on' : '') + '">' + esc(b.label) + '</span>';
      }).join('') + '</div><p class="g-hint">◀ ▶ and OK · BACK to close</p>' : '');
    el.classList.remove('hidden');
    G.buttons = buttons; G.idx = 0;
    view.lastInput = Date.now();
    clearTimeout(G.timer);
    G.timer = setTimeout(closeGreet, 3 * 60000);      // nobody answered: tidy up, TV stays on
  }
  function drawGreetFocus() {
    var b = $('greet').querySelectorAll('.g-btn');
    for (var i = 0; i < b.length; i++) b[i].classList.toggle('g-on', i === G.idx);
  }
  function closeGreet() {
    clearTimeout(G.timer);
    stopSpeech();
    G.active = null; G.buttons = [];
    $('greet').classList.add('hidden');
    view.lastInput = Date.now();
  }

  function greetKey(code) {
    view.lastInput = Date.now();
    if (!G.buttons.length) { if (code === KEY.BACK || code === KEY.ESC || code === KEY.ENTER) closeGreet(); return; }
    if (code === KEY.LEFT) { G.idx = Math.max(0, G.idx - 1); drawGreetFocus(); }
    else if (code === KEY.RIGHT) { G.idx = Math.min(G.buttons.length - 1, G.idx + 1); drawGreetFocus(); }
    else if (code === KEY.ENTER) { var b = G.buttons[G.idx]; if (b) b.run(); else closeGreet(); }
    else if (code === KEY.BACK || code === KEY.ESC) closeGreet();
  }

  function waitFor(test, ms) {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function poll() { if (test() || Date.now() - t0 > ms) resolve(); else setTimeout(poll, 500); })();
    });
  }

  function weatherSentence() {
    var w = S.weather;
    if (!w) return '';
    return 'It\'s ' + w.temp + ' degrees and ' + String(w.desc).toLowerCase() + ' outside' +
      (w.high != null ? ', with a high of ' + w.high + '.' : '.');
  }

  function daySummary() {
    var now = new Date(), key = U.dayKey(now);
    var ev = (S.events || []).filter(function (e) { return (U.dayKey(e.start) === key || e.start < now) && e.end > now; });
    if (!ev.length) return { say: 'Nothing on the calendar today.', lines: ['Nothing on the calendar today'] };
    var timed = ev.filter(function (e) { return !e.allDay; }), allDay = ev.filter(function (e) { return e.allDay; });
    var bits = timed.map(function (e) { return e.title + ' at ' + spokenTime(e.start); }).concat(allDay.map(function (e) { return e.title; }));
    var list = bits.length === 1 ? bits[0] : bits.slice(0, -1).join(', ') + ', and ' + bits[bits.length - 1];
    var lines = timed.map(function (e) { return U.time12(e.start) + ' · ' + e.title; }).concat(allDay.map(function (e) { return 'All day · ' + e.title; }));
    return { say: (ev.length === 1 ? 'Just one thing: ' : 'You\'ve got ' + ev.length + ' things: ') + list + '.', lines: lines.slice(0, 6) };
  }

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  async function runMorning(part) {
    G.active = 'morning';
    var g = C.greetings, now = new Date(), name = g.morningName;
    var title = part === 'afternoon' ? 'Good afternoon' : 'Good morning';
    var wantCommute = part !== 'afternoon' && isWorkday(now);
    greetPanel(title + ', ' + name, [], []);
    if (!DEMO) {
      if (wantCommute) { try { S.commute = await Sources.commute(); } catch (e) { /* key or addresses not set */ } }
      await waitFor(function () { return S.weather && S.events; }, 12000);
    }
    if (G.active !== 'morning') return;
    var w = S.weather, lines = [], say = [title + ', ' + name + '!'];
    if (w) { lines.push(w.temp + '° · ' + w.desc); say.push(w.temp + ' degrees and ' + String(w.desc).toLowerCase() + '.'); }
    if (wantCommute && S.commute && S.commute.minutes) { lines.push('🚗 ' + S.commute.minutes + ' min to the office'); say.push(S.commute.minutes + ' minutes to the office.'); }
    var d = daySummary();
    lines = lines.concat(d.lines.slice(0, 3));
    say.push(d.say);
    var ib = S.inbox, todayKey = U.dayKey(now);
    if (ib) {
      var dToday = (ib.deliveries || []).filter(function (x) { return x.status === 'out' || /^\d{4}/.test(x.eta || '') && x.eta.slice(0, 10) === todayKey; });
      if (dToday.length) { say.push((dToday.length === 1 ? 'One delivery' : dToday.length + ' deliveries') + ' expected today.'); lines.push('📦 ' + dToday.length + ' delivery' + (dToday.length === 1 ? '' : 'ies') + ' today'); }
      var soon = (ib.bills || []).filter(function (b) { if (b.paid || !b.due) return false; var n = Math.round((U.parseLocalDate(b.due) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000); b._n = n; return n <= 3; });
      soon.slice(0, 2).forEach(function (b) {
        say.push(b.name + ' bill' + (b.amount != null ? ' of ' + Math.round(b.amount) + (b.currency === 'INR' ? ' rupees' : ' dirhams') : '') + (b._n < 0 ? ' is overdue.' : b._n === 0 ? ' is due today.' : b._n === 1 ? ' is due tomorrow.' : ' is due ' + WEEKDAYS[U.parseLocalDate(b.due).getDay()] + '.'));
      });
    }
    var rem = remindersDue(now);
    if (rem.length) {
      var names = rem.slice(0, 3).map(function (r) { return r.title; });
      say.push((rem.length === 1 ? 'One reminder: ' : rem.length + ' reminders, including ') + names.join(', ') + '.');
      lines.push('✓ ' + rem.length + ' reminder' + (rem.length === 1 ? '' : 's') + ' today');
    }
    greetPanel(title + ', ' + name, lines, []);
    speak(say.join(' ')).then(function () { setTimeout(function () { closeGreet(); playCalm(true); startTour(); }, 2500); });
  }

  function readDay() {
    var d = daySummary();
    view.card = 'calendar'; drawCard(true);
    greetPanel('Today', d.lines, [{ label: 'Done', run: closeGreet }]);
    G.active = 'day';
    speak(d.say);
  }

  function runEvening() {
    G.active = 'evening';
    var late = new Date().getHours() >= 23 || new Date().getHours() < 4;
    var hello = late ? pick(['Hello!', 'Hi there!']) : pick(['Good evening!', 'Hello, good evening!', 'Hi, good evening!']);
    greetPanel(late ? 'Hello' : 'Good evening', ['♪ ' + musicChoice().label], []);
    speak(hello).then(function () { setTimeout(function () { closeGreet(); playCalm(true); startTour(); }, 1500); });
  }

  // Coming home after being out (seen via Find My): short, warm, then music + tour.
  function runWelcome() {
    G.active = 'welcome';
    if (view.idle) exitIdle();
    var n = C.greetings.morningName, wk = isWorkday(new Date()), late = new Date().getHours() >= 22;
    var say = wk ? pick(['Hi ' + n + ', welcome home! Hope you had a good day.', 'Welcome home, ' + n + '! Hope your day went well.'])
                 : pick(['Welcome back, ' + n + '! Hope you enjoyed being out.', 'Hi ' + n + ', welcome home! Hope you had a lovely time.']);
    greetPanel('Welcome home', [wk ? 'Hope you had a good day' : 'Hope you had a lovely time out'], []);
    speak(say).then(function () { setTimeout(function () { closeGreet(); if (!late) playCalm(true); startTour(); }, 1500); });
  }

  // Calm instrumental internet radio, played by the dashboard itself (art stays on screen).
  function musicChoice() {
    var g = C.greetings, n = new Date(), m = n.getHours() * 60 + n.getMinutes();
    var bh = g.bhajanUrls && m >= minsToday(g.bhajanFrom || '05:30') && m < minsToday(g.bhajanUntil || '07:00');
    return bh ? { label: 'Bhajans', urls: g.bhajanUrls } : { label: 'Instrumental jazz', urls: g.jazzUrls || [] };
  }
  function playCalm(auto, kind) {
    var g = C.greetings, pick0 = kind === 'jazz' ? { label: 'Instrumental jazz', urls: g.jazzUrls || [] } :
      kind === 'bhajans' && g.bhajanUrls ? { label: 'Bhajans', urls: g.bhajanUrls } : musicChoice(), urls = pick0.urls;
    stopCalm();
    var i = 0;
    (function tryNext() {
      if (i >= urls.length) { toast('Could not start the music'); stopCalm(); return; }
      var m = new Audio(urls[i++]), started = false;
      G.music = m;
      var fail = function () { if (G.music !== m || started) { if (G.music === m && started) { started = false; tryNext(); } return; } tryNext(); };
      m.onplaying = function () { started = true; };
      m.onerror = fail;
      var p = m.play();
      if (p && p.catch) p.catch(fail);
      setTimeout(function () { if (G.music === m && !started) { try { m.pause(); m.src = ''; } catch (e) { /* ignore */ } tryNext(); } }, 12000);
    })();
    toast('♪ ' + pick0.label + ' · ⏯ or RED stops it');
  }
  function stopCalm() { if (G.music) { try { G.music.pause(); G.music.src = ''; } catch (e) { /* ignore */ } G.music = null; } }

  // Greet every time the TV is switched on. The laptop's TV watcher tells the relay when the TV
  // powers on (GET /poweron); the app compares that moment with the last greeting it gave.
  function greetNow(part) {
    var h = new Date().getHours();
    if (view.idle) exitIdle();
    if (!part) part = h >= 4 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : 'evening';
    if (part === 'evening') runEvening(); else runMorning(part);
  }
  var greetBoot = true;
  // After a greeting: walk through every screen once (4 s each), then normal rotation resumes.
  function startTour() {
    if (view.idle) exitIdle();
    var list = eligibleCards(), i = 0;
    view.tour = true;
    (function step() {
      if (!view.tour || G.active || i >= list.length) { view.tour = false; view.manualAt = 0; return; }
      view.card = list[i++]; view.focusRow = 'apps'; drawCard(true);
      view.lastInput = Date.now();
      setTimeout(step, 4000);
    })();
  }

  async function checkGreet() {
    var g = C.greetings;
    if (!g || !g.enabled || G.active || document.hidden) return;
    var on = null, part = '', arrive = 0;
    try {
      var st = await U.json(RELAY + '/state'); on = st.powerOn || 0; part = st.part || ''; arrive = st.arriveAt || 0;
      if (st.cmd && st.cmd.t > U.store.get('cmd_last', 0)) {          // a command sent from the laptop
        U.store.set('cmd_last', st.cmd.t);
        if (st.cmd.do === 'gallery') { view.manualGallery = true; enterIdle(); }
        else if (st.cmd.do === 'home') exitIdle();
        else if (st.cmd.do === 'music') playCalm();
      }
      askChip(st.askBusy);
      if (st.ask && st.ask.id > U.store.get('ask_last', 0) && Date.now() / 1000 - st.ask.id < 180) { U.store.set('ask_last', st.ask.id); handleAsk(st.ask); }
      if (st.remind && st.remind.t > U.store.get('remind_last', 0)) {   // a meeting is about to start
        U.store.set('remind_last', st.remind.t);
        showMeetingReminder(st.remind);
      }
    } catch (e) { on = null; }
    var nowS = Date.now() / 1000, freshArrive = arrive && nowS - arrive < 10 * 60 && arrive > U.store.get('arrive_last', 0);
    if (on === null) {                       // relay unreachable: greet once when the app starts
      if (greetBoot) { greetBoot = false; greetNow(); }
      return;
    }
    greetBoot = false;
    if (on > U.store.get('greet_last', 0)) {
      U.store.set('greet_last', on);
      if (freshArrive && !part) { U.store.set('arrive_last', arrive); runWelcome(); } else greetNow(part);
    } else if (freshArrive) { U.store.set('arrive_last', arrive); runWelcome(); }   // TV was already on
  }

  // ---------- Remote control ----------
  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27 };
  var MEDIA = {};
  function registerKeys() {
    var names = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaFastForward', 'MediaRewind',
      'MediaTrackNext', 'MediaTrackPrevious', 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'];
    if (ON_TV && tizen.tvinputdevice) {
      names.forEach(function (n) {
        try { tizen.tvinputdevice.registerKey(n); MEDIA[tizen.tvinputdevice.getKey(n).code] = n; } catch (e) { /* key not on this remote */ }
      });
    } else {
      // Laptop testing: P = play/pause, N = next, B = blue (app IDs), Y = next card, G = gallery
      MEDIA[80] = 'MediaPlayPause'; MEDIA[78] = 'MediaTrackNext'; MEDIA[66] = 'ColorF3Blue';
      MEDIA[89] = 'ColorF2Yellow'; MEDIA[71] = 'ColorF1Green'; MEDIA[82] = 'ColorF0Red';
    }
  }

  function onKey(e) {
    var code = e.keyCode;
    view.lastInput = Date.now();
    if (G.active) { e.preventDefault(); greetKey(code); return; }
    if (A.open) { e.preventDefault(); askKey(code); return; }
    if (!$('askcard').classList.contains('hidden') && (code === KEY.BACK || code === KEY.ESC || code === KEY.ENTER)) { e.preventDefault(); closeAskCard(); stopSpeech(); return; }
    view.tour = false;
    if (G.music && (MEDIA[code] === 'ColorF0Red' || /Play|Pause/.test(MEDIA[code] || ''))) { e.preventDefault(); stopCalm(); toast('Music stopped'); return; }
    if (view.idle) {
      e.preventDefault();
      exitIdle();
      if (code === KEY.LEFT || code === KEY.RIGHT) {
        var cards = eligibleCards();
        view.card = code === KEY.LEFT ? cards[cards.length - 1] : cards[0];
        view.focusRow = 'panel'; view.focusIdx = 0; view.manualAt = Date.now();
        drawCard(true);
      }
      return;
    }
    var ov = $('overlay');
    if (!ov.classList.contains('hidden')) {
      if (code === KEY.BACK || code === KEY.ESC || code === KEY.ENTER) {
        e.preventDefault();
        var wasRemind = ov.dataset.kind === 'remind';
        closeOverlay();
        // BACK after a meeting reminder: hand the screen back to whatever was playing (Netflix etc.).
        if (wasRemind && code !== KEY.ENTER && ON_TV) { try { tizen.application.getCurrentApplication().hide(); } catch (err) { /* stay here */ } }
      }
      return;
    }
    var media = MEDIA[code];
    if (media) {
      e.preventDefault();
      if (/Play|Pause/.test(media)) musicAction('toggle');
      else if (/Next|FastForward/.test(media)) musicAction('next');
      else if (/Previous|Rewind/.test(media)) musicAction('prev');
      else if (media === 'ColorF3Blue') showAppIds();
      else if (media === 'ColorF2Yellow') rotateCard(1, true);
      else if (media === 'ColorF1Green') { view.manualGallery = true; enterIdle(); }
      else if (media === 'ColorF0Red') { toast('Refreshing…'); refreshAll(); }
      return;
    }
    var list = focusables(view.focusRow);
    if (view.focusRow === 'panel' && (code === KEY.LEFT || code === KEY.RIGHT)) {
      e.preventDefault();
      rotateCard(code === KEY.LEFT ? -1 : 1, true);
      return;
    }
    switch (code) {
      case KEY.LEFT: view.focusIdx = Math.max(0, view.focusIdx - 1); break;
      case KEY.RIGHT: view.focusIdx = Math.min(list.length - 1, view.focusIdx + 1); break;
      case KEY.UP:
        if (view.focusRow === 'apps') {
          if (view.card === 'music') { view.focusRow = 'music'; view.focusIdx = 1; }
          else { view.focusRow = 'panel'; view.focusIdx = 0; toast('◀ ▶ to switch between cards'); }
        } else if (view.focusRow === 'music') { view.focusRow = 'panel'; view.focusIdx = 0; }
        break;
      case KEY.DOWN:
        if (view.focusRow === 'music' || view.focusRow === 'panel') { view.focusRow = 'apps'; view.focusIdx = 0; }
        break;
      case KEY.ENTER:
        if (view.focusRow === 'panel') { rotateCard(1, true); break; }
        if (view.focusRow === 'apps') launchApp(appTiles()[view.focusIdx]);
        else { var el = list[view.focusIdx]; if (el) musicAction(el.dataset.ctl); }
        break;
      case KEY.BACK:
        e.preventDefault();          // stay on the dashboard; the Home button still opens Smart Hub
        return;
      default: return;
    }
    e.preventDefault();
    drawFocus();
  }

  // ---------- Family photo frame (photos come from the laptop's backup, LAN only) ----------
  var PHOTOS = (C.corsProxy || '').replace(/:8080\/proxy\?url=$/, ':8081');
  var pf = { front: 'pfA' };
  // One family photo at a time: shown as the "Memories" screen and mixed into the gallery.
  function nextPhoto() {
    return U.json(PHOTOS + '/next').then(function (r) {
      if (!r || !r.url) return null;
      return U.loadImage(PHOTOS + r.url).then(function (img) {
        return { src: PHOTOS + r.url, kicker: r.kicker || 'From our photos', caption: r.caption || '', ratio: img.naturalWidth / img.naturalHeight };
      });
    });
  }
  async function loadFramePhoto() {
    if (view.idle || document.hidden || C.photoFrame === false) return;
    var p = await nextPhoto();
    if (!p) return;
    S.memory = p;
    if (view.card === 'memories' && !view.idle) drawCard(false);
  }

  // ---------- Loaders ----------
  async function loadMusic() {
    if (DEMO) return;
    try {
      var m = await Sources.spotifyNow();
      var wasPlaying = S.music && S.music.playing;
      S.music = m;
      S.musicError = false;
      if (m && m.playing && !wasPlaying && !view.idle && view.focusRow !== 'music') { view.card = 'music'; drawCard(true); }
    } catch (e) {
      S.musicError = /HTTP 400|HTTP 401/.test(String(e.message));
      console.warn('[spotify]', e.message);
    }
  }

  var loaders = [];
  function refreshAll() { loaders.forEach(function (fn) { fn(); }); }

  function startLoaders() {
    function reg(name, ms, fn) {
      var wrapped = async function () { try { await fn(); } catch (e) { console.warn('[' + name + ']', e && e.message); } drawAll(); promoteRelevant(); };
      loaders.push(wrapped);
      wrapped();
      setInterval(wrapped, ms);
    }
    var MIN = 60000;
    reg('art-home', C.homeArtMinutes * MIN, loadHomeArt);
    reg('art-idle', C.idleArtMinutes * MIN, function () { return view.idle ? loadIdleArt() : null; });
    reg('photo', 4 * MIN, loadFramePhoto);
    reg('context', 2 * MIN, postContext);

    if (DEMO) {
      var d = Sources.demo();
      Object.keys(d).forEach(function (k) { if (k === 'events') S.events = d.events; else S[k] = d[k]; });
      return;
    }

    reg('weather', 15 * MIN, async function () { S.weather = await Sources.weather(); });
    reg('aqi', 30 * MIN, async function () { S.aqi = await Sources.airQuality(); });
    reg('fx', 3 * 60 * MIN, async function () { S.fx = await Sources.fx(); });
    reg('calendar', 10 * MIN, async function () { S.gEvents = await Sources.calendar(); S.events = Sources.mergeEvents(S.gEvents, S.phone && S.phone.events); });
    reg('papa', 1 * MIN, async function () {
      var was = !!S.papa;
      try { S.papa = await Sources.whereabouts(); } catch (e) { S.papa = null; }
      if (S.papa && !was && !view.idle) { view.card = 'papa'; drawCard(true); }
      if (view.card === 'papa' && !view.idle) drawCard(false);
    });
    reg('inbox', 3 * MIN, async function () {
      var before = {};
      ((S.inbox && S.inbox.deliveries) || []).forEach(function (x) { before[x.key] = x.status; });
      var first = !S.inbox;
      try { S.inbox = await Sources.inbox(); } catch (e) { S.inbox = null; }
      if (!S.inbox || first) return;
      S.inbox.deliveries.forEach(function (x) {
        if (x.status === 'out' && before[x.key] !== 'out' && !document.hidden && !G.active) {
          var what = x.shop + (x.title ? ' delivery, ' + x.title.replace(/ \+ \d+ more$/, '') + ',' : ' order');
          toast('📦 ' + x.shop + ' · out for delivery' + (x.eta && !/^\d{4}/.test(x.eta) ? ' · ' + x.eta : ''));
          if (!view.idle) { view.card = 'orders'; drawCard(true); }
          speak('Heads up, your ' + what + ' is out for delivery.');
        }
      });
    });
    reg('phone', 5 * MIN, async function () {
      try { S.phone = await Sources.pushed(); } catch (e) { S.phone = null; }
      if (S.gEvents || (S.phone && S.phone.events.length)) S.events = Sources.mergeEvents(S.gEvents || [], S.phone && S.phone.events);
    });
    reg('news', 30 * MIN, async function () { S.news = await Sources.news(); });
    reg('kids', 10 * MIN, async function () { S.kids = await Sources.kids(); });
    reg('commute', 15 * MIN, async function () {
      var c = C.commute, now = new Date();
      if (isWorkday(now) && now.getHours() >= c.fromHour && now.getHours() < c.toHour) S.commute = await Sources.commute();
    });

    if (C.spotify.clientId && C.spotify.refreshToken) {
      loadMusic();
      setInterval(loadMusic, 5000);
    }

    if (C.cricket.apiKey) {
      // Light polling to stay inside the free tier: hourly, every 6 minutes while India is playing.
      var cricketTimer = null;
      var pollCricket = async function () {
        try { S.cricket = await Sources.cricket(); } catch (e) { console.warn('[cricket]', e.message); }
        drawAll();
        clearTimeout(cricketTimer);
        cricketTimer = setTimeout(pollCricket, (S.cricket && S.cricket.live ? 6 : 60) * MIN);
      };
      loaders.push(pollCricket);
      pollCricket();
    }

    if (C.flights.list.length) {
      reg('flights', 10 * MIN, async function () {
        var now = new Date();
        var soon = C.flights.list.filter(function (f) {
          var d = U.daysBetween(now, U.parseLocalDate(f.date));
          return d >= -1 && d <= 1;
        });
        S.flights = await Promise.all(soon.map(function (f) {
          return Sources.flight(f).catch(function () { return { label: f.label, number: f.number, date: f.date, unknown: true }; });
        }));
        if (activeFlight(now) && C.googleMapsKey && C.commute.origin) {
          S.airportMinutes = await Sources.driveMinutes(C.commute.origin, C.airportAddress);
        }
      });
    }
  }

  // ---------- Draw everything ----------
  function drawAll() {
    drawClock();
    drawWeather();
    drawPrayers();
    drawTiles();
    drawBackground();
    if (!view.idle) drawCard(false);
  }

  // Gallery takes over by itself only late evening/night; the GREEN button opens it any time.
  function galleryHours() {
    var n = new Date(), m = n.getHours() * 60 + n.getMinutes(), a = minsToday(C.galleryFrom || '22:00'), b = minsToday(C.galleryUntil || '06:00');
    return a > b ? (m >= a || m < b) : (m >= a && m < b);
  }

  function tick() {
    drawClock();
    if (!view.idle && !G.active && Date.now() - view.lastInput > C.idleMinutes * 60000 && galleryHours()) enterIdle();
    if (view.idle && !galleryHours() && !view.manualGallery) exitIdle();             // morning: back to the dashboard
  }

  function keepScreenOn() {
    try {
      if (window.webapis && webapis.appcommon) {
        webapis.appcommon.setScreenSaver(webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF);
      }
    } catch (e) { /* not available */ }
  }

  // Old TV browsers don't support "gap" in flex layouts: detect it and switch to margin-based spacing.
  function flexGapCheck() {
    var f = document.createElement('div');
    f.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
    f.appendChild(document.createElement('div')); f.appendChild(document.createElement('div'));
    document.body.appendChild(f);
    var ok = f.scrollHeight === 1 && !/[?&]nogap=1/.test(location.search);   // ?nogap=1 simulates the TV
    document.body.removeChild(f);
    if (!ok) document.documentElement.className += ' no-flexgap';
  }

  function init() {
    flexGapCheck();
    registerKeys();
    keepScreenOn();
    document.addEventListener('keydown', onKey);
    drawApps();
    startLoaders();
    drawAll();
    setInterval(tick, 1000);
    setInterval(function () { drawTiles(); if (!view.idle && view.card === 'music') drawCard(false); }, 1000);
    setInterval(function () { if (!view.idle) rotateCard(); }, C.cardSeconds * 1000);
    setInterval(promoteRelevant, 30000);
    setInterval(keepScreenOn, 5 * 60000);                // keep Samsung's own screen saver away
    document.addEventListener('visibilitychange', function () { if (!document.hidden) keepScreenOn(); });
    if (/[?&]idle=1/.test(location.search)) enterIdle();
    var forceCard = location.search.match(/[?&]card=(\w+)/);
    if (forceCard) setTimeout(function () { view.card = forceCard[1]; view.manualAt = Date.now() + 3600000; drawCard(true); }, 4000);
    if (DEMO) toast('Demo mode — sample data');
    setTimeout(checkGreet, 4000);
    setInterval(checkGreet, 2500);          // also picks up Ask the TV answers quickly
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { stopSpeech(); stopCalm(); } else setTimeout(checkGreet, 1500);
    });
    var force = location.search.match(/[?&]greet=(morning|evening)/);
    if (force) setTimeout(function () { if (force[1] === 'morning') runMorning('morning'); else runEvening(); }, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
