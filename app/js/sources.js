/*
 * Data sources. Each function returns plain data for app.js to draw.
 * Services that need no key: Open-Meteo (weather, air quality, UV, sunset),
 * Aladhan (prayer times), open.er-api.com (exchange rate), Art Institute of
 * Chicago and Cleveland Museum of Art (artwork), Google News RSS (headlines).
 */
window.Sources = (function () {
  'use strict';
  var C = window.CONFIG;

  // ---------------- Weather, air quality, UV, sunset ----------------
  var WMO = {
    0: ['Clear', 'sun'], 1: ['Mostly clear', 'sun'], 2: ['Partly cloudy', 'cloud-sun'], 3: ['Cloudy', 'cloud'],
    45: ['Fog', 'fog'], 48: ['Fog', 'fog'], 51: ['Drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Drizzle', 'rain'],
    61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'], 80: ['Showers', 'rain'],
    81: ['Showers', 'rain'], 82: ['Heavy showers', 'rain'], 95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm', 'storm'],
    99: ['Thunderstorm', 'storm']
  };

  async function weather() {
    var L = C.location;
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + L.lat + '&longitude=' + L.lon +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day' +
      '&hourly=temperature_2m,weather_code,precipitation_probability,is_day' +
      '&daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset,uv_index_max' +
      '&timezone=auto&forecast_days=6';
    var d = await U.json(url);
    var code = d.current.weather_code;
    var w = WMO[code] || ['—', 'cloud'];
    var desc = w[0];
    if (!d.current.is_day && (code === 0 || code === 1)) desc = 'Clear';
    function iconFor(c, day) { var x = WMO[c] || ['—', 'cloud']; return (!day && x[1] === 'sun') ? 'moon' : x[1]; }
    // Next 8 hours, every hour, starting from the current hour.
    var nowKey = d.current.time ? d.current.time.slice(0, 13) : '';
    var start = Math.max(0, d.hourly.time.findIndex(function (t) { return t.slice(0, 13) === nowKey; }));
    var hours = [];
    for (var i = start + 1; i < Math.min(d.hourly.time.length, start + 9); i++) {
      hours.push({ time: d.hourly.time[i].slice(11, 16), temp: Math.round(d.hourly.temperature_2m[i]),
        icon: iconFor(d.hourly.weather_code[i], d.hourly.is_day[i]), rain: d.hourly.precipitation_probability[i] });
    }
    var days = [];
    for (var j = 1; j < d.daily.time.length; j++) {
      days.push({ date: d.daily.time[j], high: Math.round(d.daily.temperature_2m_max[j]), low: Math.round(d.daily.temperature_2m_min[j]),
        icon: iconFor(d.daily.weather_code[j], 1), desc: (WMO[d.daily.weather_code[j]] || ['—'])[0] });
    }
    return {
      temp: Math.round(d.current.temperature_2m),
      feels: Math.round(d.current.apparent_temperature),
      humidity: Math.round(d.current.relative_humidity_2m),
      wind: Math.round(d.current.wind_speed_10m),
      desc: desc,
      icon: (!d.current.is_day && w[1] === 'sun') ? 'moon' : w[1],
      high: Math.round(d.daily.temperature_2m_max[0]),
      low: Math.round(d.daily.temperature_2m_min[0]),
      uv: Math.round(d.daily.uv_index_max[0]),
      sunrise: d.daily.sunrise[0].slice(11, 16),
      sunset: d.daily.sunset[0].slice(11, 16),
      hours: hours,
      days: days
    };
  }

  async function airQuality() {
    var L = C.location;
    var d = await U.json('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + L.lat +
      '&longitude=' + L.lon + '&current=us_aqi');
    var v = Math.round(d.current.us_aqi);
    var label = v <= 50 ? 'Good' : v <= 100 ? 'Moderate' : v <= 150 ? 'Unhealthy for some' : v <= 200 ? 'Unhealthy' : 'Very unhealthy';
    return { value: v, label: label };
  }

  // ---------------- Prayer times ----------------
  async function prayers() {
    var L = C.location;
    var d = new Date();
    var date = U.pad(d.getDate()) + '-' + U.pad(d.getMonth() + 1) + '-' + d.getFullYear();
    var res = await U.json('https://api.aladhan.com/v1/timingsByCity/' + date + '?city=' + encodeURIComponent(L.city) +
      '&country=' + encodeURIComponent(L.country) + '&method=' + L.prayerMethod);
    var t = res.data.timings;
    return ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map(function (n) {
      return { name: n, time: t[n].slice(0, 5) };
    });
  }

  // ---------------- AED → INR ----------------
  // AED→INR, USD→INR and 22K gold (AED per gram), each compared with the previous day's value.
  async function fx() {
    var X = C.fx || {}, base = X.base || 'AED', quote = X.quote || 'INR';
    var d = await U.json('https://open.er-api.com/v6/latest/' + base);
    var aed = d.rates[quote];
    var usd = d.rates.USD ? d.rates[quote] / d.rates.USD : null;
    var gold = null, dubai = null;
    // Gold: the Dubai retail rate jewellers charge (via the laptop), when the base currency is AED.
    if (base === 'AED' && C.corsProxy) {
      try {
        var dg = await U.json(C.corsProxy.replace(/\/proxy\?url=$/, '') + '/gold');
        if (dg && dg.k22) dubai = dg;
      } catch (e) { console.warn('[gold dubai]', e.message); }
    }
    if (dubai) gold = dubai.k22;
    else try {
      var g = await U.json('https://api.gold-api.com/price/XAU');               // USD per troy ounce, spot
      var usdToBase = d.rates.USD ? 1 / d.rates.USD : 1;
      if (g && g.price) gold = g.price / 31.1034768 * (22 / 24) * usdToBase;   // 22 karat, per gram, in the base currency
    } catch (e) { console.warn('[gold]', e.message); }
    var hist = U.store.get('rates_hist', {});
    var today = U.dayKey();
    hist[today] = { aed: aed, usd: usd, gold: gold != null ? gold : (hist[today] && hist[today].gold) };   // latest value of each day
    var days = Object.keys(hist).sort();
    while (days.length > 10) { delete hist[days.shift()]; }
    U.store.set('rates_hist', hist);
    var prevKey = days.filter(function (k) { return k < today; }).pop(), prev = prevKey ? hist[prevKey] : null;
    function ch(k, v) { return prev && prev[k] != null && v != null ? v - prev[k] : null; }
    var out = { rate: aed, usd: usd, gold: gold, change: ch('aed', aed), usdChange: ch('usd', usd), goldChange: ch('gold', gold) };
    // Currencies: compare with the previous business day from the ECB series (Frankfurter), so the arrows
    // work from the first day and survive app reinstalls. The base is converted through USD (fine for pegged AED/SAR).
    try {
      var from = U.dayKey(new Date(Date.now() - 10 * 86400000));
      var ts = await U.json('https://api.frankfurter.dev/v1/' + from + '..?from=USD&to=' + quote);
      var keys = Object.keys(ts.rates || {}).sort(), last = keys[keys.length - 1];
      var prevDay = keys.filter(function (k) { return k < today; }).pop();
      if (last === today && keys.length > 1) prevDay = keys[keys.length - 2];
      var pu = prevDay && ts.rates[prevDay][quote];
      if (pu && usd != null) {
        out.usdChange = usd - pu;
        if (d.rates.USD) out.change = aed - pu * d.rates.USD;
      }
    } catch (e) { console.warn('[fx history]', e.message); }
    // Gold: today's move from the market's own daily change (COMEX gold futures), via the laptop relay.
    if (dubai) out.goldChange = dubai.change;            // change from the previous day's Dubai rate
    else if (gold != null) {
      try {
        var y = await U.json('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=5d&interval=1d', null, true);
        var meta = y && y.chart && y.chart.result && y.chart.result[0] && y.chart.result[0].meta;
        var pct = meta && (meta.regularMarketChangePercent != null ? meta.regularMarketChangePercent :
          (meta.regularMarketPrice && meta.chartPreviousClose ? (meta.regularMarketPrice / meta.chartPreviousClose - 1) * 100 : null));
        if (pct != null) out.goldChange = gold * pct / 100;
      } catch (e) { console.warn('[gold change]', e.message); }
    }
    return out;
  }

  // ---------------- Drive times (Google Routes API) ----------------
  async function driveMinutes(origin, destination) {
    if (!C.googleMapsKey || !origin || !destination) return null;
    var r = await U.json('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': C.googleMapsKey,
        'X-Goog-FieldMask': 'routes.duration'
      },
      body: JSON.stringify({
        origin: { address: origin }, destination: { address: destination },
        travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE_OPTIMAL'
      })
    });
    if (!r || !r.routes || !r.routes.length) return null;
    return Math.round(parseInt(r.routes[0].duration, 10) / 60);
  }

  async function commute() {
    var c = C.commute;
    var mins = await driveMinutes(c.origin, c.destination);
    return mins == null ? null : { minutes: mins };
  }

  // ---------------- Commute detail (route + live traffic map) ----------------
  function decodePoly(str) {
    var pts = [], i = 0, lat = 0, lng = 0;
    while (i < str.length) {
      var b, sh = 0, res = 0;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 31) << sh; sh += 5; } while (b >= 32);
      lat += (res & 1) ? ~(res >> 1) : (res >> 1);
      sh = 0; res = 0;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 31) << sh; sh += 5; } while (b >= 32);
      lng += (res & 1) ? ~(res >> 1) : (res >> 1);
      pts.push([lat, lng]);                      // integers (1e5 units)
    }
    return pts;
  }
  function encodePoly(pts) {
    var out = '', pLat = 0, pLng = 0;
    function enc(v) { v = v < 0 ? ~(v << 1) : (v << 1); var r = ''; while (v >= 32) { r += String.fromCharCode((32 | (v & 31)) + 63); v >>= 5; } return r + String.fromCharCode(v + 63); }
    pts.forEach(function (p) { out += enc(p[0] - pLat) + enc(p[1] - pLng); pLat = p[0]; pLng = p[1]; });
    return out;
  }
  function secs(d) { return d ? parseInt(d, 10) : 0; }

  function wp(x) { return typeof x === 'string' ? { address: x } : { location: { latLng: { latitude: x.lat, longitude: x.lng } } }; }
  async function commuteDetail(origin, destination, single) {
    if (!C.googleMapsKey || !origin || !destination) return null;
    var r = await U.json('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': C.googleMapsKey,
        'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters,routes.description,routes.polyline.encodedPolyline,routes.travelAdvisory.speedReadingIntervals'
      },
      body: JSON.stringify({
        origin: wp(origin), destination: wp(destination),
        travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE_OPTIMAL', computeAlternativeRoutes: !single,
        languageCode: 'en', regionCode: 'AE', units: 'METRIC',
        extraComputations: ['TRAFFIC_ON_POLYLINE']
      })
    });
    if (!r || !r.routes || !r.routes.length) return null;
    var routes = r.routes.map(function (x) {
      return {
        minutes: Math.round(secs(x.duration) / 60), usual: Math.round(secs(x.staticDuration) / 60),
        km: Math.round((x.distanceMeters || 0) / 100) / 10, desc: x.description || '',
        pts: decodePoly(x.polyline.encodedPolyline),
        speed: (x.travelAdvisory && x.travelAdvisory.speedReadingIntervals) || []
      };
    });
    routes.sort(function (a, b) { return a.minutes - b.minutes; });
    var best = routes[0];
    best.at = new Date();
    best.alts = routes.slice(1);
    if (single) { best.startLabel = 'P'; best.endLabel = 'H'; }
    best.mapUrl = trafficMapUrl(best, routes.slice(1));
    return best;
  }

  // Google Static Map: dark style, alternatives in grey, best route coloured by live traffic.
  function trafficMapUrl(best, alts) {
    var COL = { NORMAL: '0x3DDC84ff', SLOW: '0xF5A623ff', TRAFFIC_JAM: '0xE5484Dff' };
    var q = ['size=620x400', 'scale=2', 'maptype=roadmap', 'language=en',
      'style=element:geometry|color:0x1c1f26', 'style=element:labels.text.fill|color:0x8a8f99',
      'style=element:labels.text.stroke|color:0x1c1f26', 'style=feature:road|element:geometry|color:0x2c313b',
      'style=feature:road.highway|element:geometry|color:0x3a404c', 'style=feature:water|color:0x0e1a2b',
      'style=feature:poi|visibility:off', 'style=feature:transit|visibility:off'];
    alts.forEach(function (a) { q.push('path=' + encodeURIComponent('color:0x7f8794aa|weight:5|enc:' + encodePoly(a.pts))); });
    var segs = best.speed.length ? best.speed : [{ startPolylinePointIndex: 0, endPolylinePointIndex: best.pts.length - 1, speed: 'NORMAL' }];
    segs.forEach(function (sg) {
      var a = sg.startPolylinePointIndex || 0, b = sg.endPolylinePointIndex || 0;
      if (b <= a) return;
      q.push('path=' + encodeURIComponent('color:' + (COL[sg.speed] || COL.NORMAL) + '|weight:7|enc:' + encodePoly(best.pts.slice(a, b + 1))));
    });
    var s = best.pts[0], e = best.pts[best.pts.length - 1];
    q.push('markers=' + encodeURIComponent('color:0xF2B36B|label:' + (best.startLabel || 'A') + '|' + s[0] / 1e5 + ',' + s[1] / 1e5));
    q.push('markers=' + encodeURIComponent('color:0xF3F1EC|label:' + (best.endLabel || 'B') + '|' + e[0] / 1e5 + ',' + e[1] / 1e5));
    q.push('key=' + C.googleMapsKey);
    var url = 'https://maps.googleapis.com/maps/api/staticmap?' + q.join('&');
    if (url.length > 15000) {        // too long: one plain line instead of traffic colours
      url = url.replace(/&path=[^&]*/g, '').replace('&markers', '&path=' + encodeURIComponent('color:0x3DDC84ff|weight:7|enc:' + encodePoly(best.pts)) + '&markers');
    }
    return url;
  }

  // ---------------- iPhone push (calendar events + reminders sent by an iOS Shortcut) ----------------
  function isoDate(v) {
    v = String(v || '').trim();
    if (!v) return null;
    v = v.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');            // +0400 → +04:00
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  async function pushed() {
    var base = (C.corsProxy || '').replace(/\/proxy\?url=$/, '');
    var list = await U.json(base + '/pushed');
    var events = [], reminders = [], at = 0;
    (list || []).forEach(function (p) {
      at = Math.max(at, p.at || 0);
      var fresh = Date.now() / 1000 - (p.at || 0) < 36 * 3600;     // ignore a phone that stopped sending
      if (!fresh) return;
      (p.events || []).forEach(function (e) {
        var st = isoDate(e.start), en = isoDate(e.end);
        if (!st) return;
        if (e.allDay) { st = new Date(st.getFullYear(), st.getMonth(), st.getDate()); en = new Date(st.getTime() + 86400000); }
        // Someone else's phone (e.g. a partner's): show their name in front, so it's clear whose event it is.
        var me = (C.greetings && C.greetings.morningName) || '', tag = p.who && p.who !== 'phone' && p.who !== me ? p.who + ' · ' : '';
        events.push({ title: tag + (e.title || '(No title)'), start: st, end: en && en > st ? en : new Date(st.getTime() + 3600000), allDay: !!e.allDay, calendar: e.calendar, phone: true, who: p.who });
      });
      (p.reminders || []).forEach(function (r) { reminders.push({ title: r.title, due: isoDate(r.due), list: r.list, who: p.who }); });
    });
    reminders.sort(function (a, b) { return (a.due ? a.due.getTime() : 9e15) - (b.due ? b.due.getTime() : 9e15); });
    return { events: events, reminders: reminders, at: at ? new Date(at * 1000) : null };
  }
  // Google calendar events + phone events, without duplicates (same title within 5 minutes).
  function mergeEvents(a, b) {
    var out = (a || []).slice();
    function norm(t) { return String(t).toLowerCase().replace(/[^a-z0-9]/g, ''); }
    (b || []).forEach(function (e) {
      var dup = out.some(function (x) { return norm(x.title) === norm(e.title) && Math.abs(x.start - e.start) < 300000; });
      if (!dup) out.push(e);
    });
    out.sort(function (x, y) { return x.start - y.start; });
    return out;
  }

  // ---------------- Where is Piyush (Find My → laptop → here) ----------------
  function metres(a, b, c, d) {
    var R = 6371000, toR = Math.PI / 180, x = (d - b) * toR * Math.cos((a + c) / 2 * toR), y = (c - a) * toR;
    return Math.sqrt(x * x + y * y) * R;
  }
  async function whereabouts() {
    var base = (C.corsProxy || '').replace(/\/proxy\?url=$/, '');
    var loc = await U.json(base + '/location');
    if (!loc || !loc.active) { whereabouts.last = null; return null; }
    // Only ask Google for a new route if the phone moved >250 m or 4 min passed (keeps within the free allowance).
    var L = whereabouts.last, moved = L ? metres(L.lat, L.lng, loc.lat, loc.lng) : 1e9;
    var r = L && moved < 250 && Date.now() - L.t < 4 * 60000 ? L.r : await commuteDetail({ lat: loc.lat, lng: loc.lng }, C.commute.origin, true);
    if (r) whereabouts.last = { lat: loc.lat, lng: loc.lng, t: L && r === L.r ? L.t : Date.now(), r: r };
    if (!r) return { lat: loc.lat, lng: loc.lng, at: new Date(loc.at * 1000) };
    r.lat = loc.lat; r.lng = loc.lng; r.at = new Date(loc.at * 1000); r.fixAt = loc.fixAt ? new Date(loc.fixAt * 1000) : r.at;
    return r;
  }

  // ---------------- Deliveries & bills (Gmail → laptop → here) ----------------
  async function inbox() {
    var base = (C.corsProxy || '').replace(/\/proxy\?url=$/, '');
    var d = await U.json(base + '/inbox');
    if (!d || !d.at || Date.now() / 1000 - d.at > 6 * 3600) return null;     // stale: laptop not reading mail
    return d;
  }

  // ---------------- Calendar ----------------
  async function calendar() {
    if (!C.calendars || !C.calendars.length) return null;
    var texts = await Promise.all(C.calendars.map(function (c) {
      var u = typeof c === 'string' ? c : c.url, work = typeof c === 'object' && !!c.work;
      return U.text(u, null, true).then(function (t) { return { text: t, work: work }; })
        .catch(function (e) { console.warn('Calendar', e); return { text: '', work: work }; });
    }));
    // Hide titles of work meetings on the family TV if asked to.
    var now = new Date();
    var from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var to = new Date(from.getTime() + 2 * 86400000);
    var ev = ICal.eventsBetween(texts, from, to);
    if (C.workTitles === 'hide') ev.forEach(function (e) { if (e.work) e.title = 'Work meeting'; });
    return ev;
  }

  // ---------------- Spotify ----------------
  var sp = { token: null, exp: 0 };

  function spRefreshToken() {
    var saved = U.store.get('sp_rt', null);
    if (saved && saved.orig === C.spotify.refreshToken) return saved.current;
    return C.spotify.refreshToken;
  }

  async function spToken() {
    if (sp.token && Date.now() < sp.exp - 60000) return sp.token;
    var body = 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(spRefreshToken()) +
      '&client_id=' + encodeURIComponent(C.spotify.clientId);
    var d = await U.json('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body
    });
    sp.token = d.access_token;
    sp.exp = Date.now() + d.expires_in * 1000;
    if (d.refresh_token) U.store.set('sp_rt', { orig: C.spotify.refreshToken, current: d.refresh_token });
    return sp.token;
  }

  async function spotifyNow() {
    if (!C.spotify.clientId || !C.spotify.refreshToken) return null;
    var tok = await spToken();
    var d = await U.json('https://api.spotify.com/v1/me/player?additional_types=episode', {
      headers: { Authorization: 'Bearer ' + tok }
    });
    if (!d || !d.item) return { playing: false };
    var it = d.item;
    var art = (it.album && it.album.images) || (it.images) || [];
    return {
      playing: !!d.is_playing,
      title: it.name,
      artist: it.artists ? it.artists.map(function (a) { return a.name; }).join(', ') : (it.show ? it.show.name : ''),
      album: it.album ? it.album.name : '',
      image: art.length ? art[0].url : '',
      progress: d.progress_ms || 0,
      duration: it.duration_ms || 1,
      device: d.device ? d.device.name : '',
      fetchedAt: Date.now()
    };
  }

  async function spotifyControl(action) {
    var tok = await spToken();
    var map = {
      pause: ['PUT', 'pause'], play: ['PUT', 'play'],
      next: ['POST', 'next'], prev: ['POST', 'previous']
    };
    var m = map[action];
    await U.request('https://api.spotify.com/v1/me/player/' + m[1], {
      method: m[0], headers: { Authorization: 'Bearer ' + tok }
    });
  }

  // ---------------- Cricket (cricketdata.org) ----------------
  async function cricket() {
    var k = C.cricket.apiKey;
    if (!k) return null;
    var team = C.cricket.team.toLowerCase();
    var d = await U.json('https://api.cricapi.com/v1/currentMatches?apikey=' + encodeURIComponent(k) + '&offset=0');
    var list = (d && d.data) || [];
    var mine = list.filter(function (m) {
      return (m.teams || []).some(function (t) { return t.toLowerCase().indexOf(team) === 0; });
    });
    var live = mine.filter(function (m) { return m.matchStarted && !m.matchEnded; })[0] || null;
    var next = mine.filter(function (m) { return !m.matchStarted; })
      .sort(function (a, b) { return new Date(a.dateTimeGMT) - new Date(b.dateTimeGMT); })[0] || null;
    var recent = mine.filter(function (m) { return m.matchEnded; })[0] || null;
    function shape(m) {
      if (!m) return null;
      return {
        name: m.name, status: m.status, teams: m.teams || [],
        venue: m.venue || '', start: m.dateTimeGMT ? new Date(m.dateTimeGMT + 'Z') : null,
        scores: (m.score || []).map(function (s) { return { inning: s.inning, r: s.r, w: s.w, o: s.o }; })
      };
    }
    return { live: shape(live), next: shape(next), recent: shape(recent) };
  }

  // ---------------- Headlines (RSS) ----------------
  async function news() {
    var out = [];
    await Promise.all(C.news.map(async function (feed) {
      try {
        var xml = await U.text(feed.url, null, true);
        var doc = new DOMParser().parseFromString(xml, 'text/xml');
        var items = Array.prototype.slice.call(doc.querySelectorAll('item'), 0, 3).map(function (it) {
          var title = (it.querySelector('title') || {}).textContent || '';
          var src = (it.querySelector('source') || {}).textContent || '';
          if (src && title.slice(-src.length - 3) === ' - ' + src) title = title.slice(0, -src.length - 3);
          var pub = (it.querySelector('pubDate') || {}).textContent;
          return { title: title, source: src, date: pub ? new Date(pub) : null };
        });
        out.push({ label: feed.label, items: items });
      } catch (e) { console.warn('News', feed.label, e); }
    }));
    out.sort(function (a, b) {
      return C.news.findIndex(function (f) { return f.label === a.label; }) - C.news.findIndex(function (f) { return f.label === b.label; });
    });
    return out;
  }

  // ---------------- Kids' board ----------------
  function parseCsv(text) {
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  async function kids() {
    if (!C.kidsSheetCsv) {
      return C.kids.map(function (k) {
        return { name: k.name, tasks: k.tasks.map(function (t) { return { text: t, done: false }; }) };
      });
    }
    var rows = parseCsv(await U.text(C.kidsSheetCsv, null, true));
    var byKid = {}, order = [];
    rows.slice(1).forEach(function (r) {
      var name = (r[0] || '').trim(), task = (r[1] || '').trim();
      if (!name || !task) return;
      if (!byKid[name]) { byKid[name] = []; order.push(name); }
      byKid[name].push({ text: task, done: /^(y|yes|true|1|done|x|✓)$/i.test((r[2] || '').trim()) });
    });
    return order.map(function (n) { return { name: n, tasks: byKid[n] }; });
  }

  // ---------------- Flights (AeroDataBox via RapidAPI) ----------------
  async function flight(f) {
    var k = C.flights.rapidApiKey;
    if (!k) return { label: f.label, number: f.number, date: f.date, unknown: true };
    var d = await U.json('https://aerodatabox.p.rapidapi.com/flights/number/' + encodeURIComponent(f.number.replace(/\s/g, '')) +
      '/' + f.date + '?withAircraftImage=false&withLocation=false', {
      headers: { 'X-RapidAPI-Key': k, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com' }
    });
    var leg = (d || []).filter(function (x) { return x.arrival && x.arrival.airport && x.arrival.airport.iata === (C.flights.airport || 'DXB'); })[0] || (d || [])[0];
    if (!leg) return { label: f.label, number: f.number, date: f.date, unknown: true };
    function t(o) {
      var s = o && ((o.revisedTime && o.revisedTime.local) || (o.predictedTime && o.predictedTime.local) || (o.scheduledTime && o.scheduledTime.local));
      return s ? s.slice(11, 16) : '';
    }
    function utc(o) {
      var s = o && ((o.revisedTime && o.revisedTime.utc) || (o.predictedTime && o.predictedTime.utc) || (o.scheduledTime && o.scheduledTime.utc));
      return s ? new Date(s.replace(' ', 'T').replace('Z', '') + 'Z') : null;
    }
    return {
      label: f.label, number: leg.number || f.number, airline: leg.airline ? leg.airline.name : '',
      from: leg.departure && leg.departure.airport ? (leg.departure.airport.iata || leg.departure.airport.name) : '',
      to: leg.arrival.airport.iata || C.flights.airport || 'DXB',
      depart: t(leg.departure), arrive: t(leg.arrival),
      departUtc: utc(leg.departure), arriveUtc: utc(leg.arrival),
      terminal: leg.arrival.terminal || '', status: leg.status || ''
    };
  }

  // ---------------- Museum art ----------------
  function artCacheKey(theme) { return 'art_' + theme.source + '_' + theme.name; }

  async function artPool(theme) {
    var cached = U.store.get(artCacheKey(theme), null);
    if (cached && cached.day === U.dayKey() && cached.items.length) return cached.items;
    var items = [];
    if (theme.source === 'aic') {
      var d = await U.json('https://api.artic.edu/api/v1/artworks/search?q=' + encodeURIComponent(theme.query) +
        '&limit=80&fields=id,title,artist_title,artist_display,date_display,medium_display,image_id,thumbnail,is_public_domain,short_description');
      items = (d.data || []).filter(function (a) { return a.is_public_domain && a.image_id && a.thumbnail && a.thumbnail.width; })
        .map(function (a) {
          return {
            id: 'aic' + a.id, title: a.title, artist: a.artist_title || (a.artist_display || '').split('\n')[0] || 'Unknown artist',
            date: a.date_display || '', medium: a.medium_display || '', note: U.truncate(U.stripHtml(a.short_description), 220),
            museum: 'Art Institute of Chicago', ratio: a.thumbnail.width / a.thumbnail.height,
            land: 'https://www.artic.edu/iiif/2/' + a.image_id + '/full/1686,/0/default.jpg',
            port: 'https://www.artic.edu/iiif/2/' + a.image_id + '/full/,1200/0/default.jpg'
          };
        });
    } else if (theme.source === 'cma') {
      var url = 'https://openaccess-api.clevelandart.org/api/artworks/?cc0=1&has_image=1&limit=80&q=' + encodeURIComponent(theme.query || '');
      if (theme.department) url += '&department=' + encodeURIComponent(theme.department);
      if (theme.type) url += '&type=' + encodeURIComponent(theme.type);
      var c = await U.json(url);
      items = (c.data || []).filter(function (a) { return a.images && a.images.web && a.images.web.width; })
        .map(function (a) {
          var web = a.images.web, print = a.images.print;
          var big = (print && print.url) ? print.url : web.url;
          return {
            id: 'cma' + a.id, title: a.title, artist: (a.creators && a.creators[0] && a.creators[0].description || 'Unknown artist').replace(/\s*\(.*$/, ''),
            date: a.creation_date || '', medium: a.technique || '', note: U.truncate(U.stripHtml(a.wall_description || a.description), 220),
            museum: 'Cleveland Museum of Art', ratio: web.width / web.height,
            land: web.width >= 1600 ? web.url : big, port: web.height >= 1100 ? web.url : big
          };
        });
    }
    U.store.set(artCacheKey(theme), { day: U.dayKey(), items: items });
    return items;
  }

  // ---------------- Film posters (TMDB, optional) ----------------
  // Well-loved films only (highly rated, widely voted), with some Hindi cinema mixed in.
  async function filmPool() {
    var cached = U.store.get('film_pool', null);
    if (cached && cached.day === U.dayKey() && cached.items.length) return cached.items;
    var base = 'https://api.themoviedb.org/3/discover/movie?api_key=' + C.tmdbKey + '&include_adult=false&sort_by=vote_count.desc';
    var pg = function (n) { return 1 + Math.floor(Math.random() * n); };
    var lists = await Promise.all([
      U.json(base + '&vote_average.gte=7.8&vote_count.gte=5000&page=' + pg(5)).catch(function () { return {}; }),
      U.json(base + '&with_original_language=hi&vote_average.gte=7.2&vote_count.gte=150&page=' + pg(3)).catch(function () { return {}; })
    ]);
    var items = [];
    lists.forEach(function (d) {
      (d.results || []).forEach(function (m) {
        if (!m.poster_path) return;
        var img = 'https://image.tmdb.org/t/p/w780' + m.poster_path;
        items.push({ id: 'tmdb' + m.id, film: m.id, title: (m.original_language === 'hi' && /^[ -~]+$/.test(m.original_title || '')) ? m.original_title : m.title, artist: '', date: (m.release_date || '').slice(0, 4),
          medium: 'Film poster', note: U.truncate(m.overview || '', 220), museum: 'Poster courtesy of TMDB',
          ratio: 2 / 3, land: img, port: img });
      });
    });
    if (items.length) U.store.set('film_pool', { day: U.dayKey(), items: items });
    return items;
  }

  async function pickFilm() {
    var pool = await filmPool();
    var seen = U.store.get('art_seen', []);
    var fresh = pool.filter(function (a) { return seen.indexOf(a.id) < 0; });
    var list = U.shuffle(fresh.length ? fresh : pool).slice(0, 3);
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      try {
        var img = await U.loadImage(a.port);
        var who = 'Film';
        try {
          var cr = await U.json('https://api.themoviedb.org/3/movie/' + a.film + '/credits?api_key=' + C.tmdbKey);
          var dir = (cr.crew || []).filter(function (c) { return c.job === 'Director'; })[0];
          if (dir) who = 'Directed by ' + dir.name;
        } catch (e) { /* the director is a nice-to-have */ }
        seen.push(a.id);
        U.store.set('art_seen', seen.slice(-300));
        return Object.assign({}, a, { src: a.port, theme: 'Cinema', artist: who, ratio: img.naturalWidth / img.naturalHeight });
      } catch (e) { console.warn('Poster image', e); }
    }
    return null;
  }

  // shape: 'landscape' (background) or 'any' (gallery frame)
  async function pickArt(shape, themeIndex, noFilm) {
    // Gallery only: every Nth picture is a film poster, when a TMDB key is set.
    if (shape === 'any' && C.tmdbKey && !noFilm) {
      var n = U.store.get('gallery_n', 0) + 1;
      U.store.set('gallery_n', n);
      if (n % (C.posterEvery || 5) === 0) {
        try { var f = await pickFilm(); if (f) return f; } catch (e) { console.warn('Film poster', e); }
      }
    }
    var themes = C.artThemes;
    var start = (themeIndex == null ? Math.floor(Math.random() * themes.length) : themeIndex) % themes.length;
    var theme = themes[start], pool = [];
    // If a museum is down or blocks us, fall back to the next theme rather than leaving the wall blank.
    for (var t = 0; t < themes.length; t++) {
      theme = themes[(start + t) % themes.length];
      try { pool = await artPool(theme); } catch (e) { console.warn('Art pool', theme.name, e.message); pool = []; }
      if (pool.length) break;
    }
    var seen = U.store.get('art_seen', []);
    var candidates = pool.filter(function (a) {
      return shape === 'landscape' ? a.ratio >= 1.25 : a.ratio >= 0.55 && a.ratio <= 1.9;
    });
    if (!candidates.length) candidates = pool;
    var fresh = candidates.filter(function (a) { return seen.indexOf(a.id) < 0; });
    var tryList = U.shuffle(fresh.length ? fresh : candidates).slice(0, 4);
    for (var i = 0; i < tryList.length; i++) {
      var a = tryList[i];
      var src = (shape === 'landscape' || a.ratio >= 1.2) ? a.land : a.port;
      try {
        var img = await U.loadImage(src);
        seen.push(a.id);
        U.store.set('art_seen', seen.slice(-300));
        return Object.assign({}, a, { src: src, theme: theme.name, ratio: img.naturalWidth / img.naturalHeight });
      } catch (e) { console.warn('Art image', e); }
    }
    return null;
  }

  // ---------------- Sample data for ?demo=1 ----------------
  function demo() {
    var now = new Date();
    function at(h, m, dayOffset) { return new Date(now.getFullYear(), now.getMonth(), now.getDate() + (dayOffset || 0), h, m); }
    return {
      weather: { temp: 31, feels: 34, humidity: 48, wind: 14, desc: 'Sunny', icon: 'sun', high: 34, low: 26, uv: 7, sunrise: '06:14', sunset: '17:46',
        hours: [['21:00', 29, 'moon', 0], ['22:00', 28, 'moon', 0], ['23:00', 28, 'cloud', 10], ['00:00', 27, 'moon', 0], ['01:00', 27, 'moon', 0], ['02:00', 26, 'moon', 0], ['03:00', 26, 'moon', 0], ['04:00', 26, 'cloud', 20]]
          .map(function (h) { return { time: h[0], temp: h[1], icon: h[2], rain: h[3] }; }),
        days: [['2026-10-29', 34, 26, 'sun'], ['2026-10-30', 33, 26, 'sun'], ['2026-10-31', 33, 25, 'cloud'], ['2026-11-01', 32, 25, 'rain'], ['2026-11-02', 33, 25, 'sun']]
          .map(function (d) { return { date: d[0], high: d[1], low: d[2], icon: d[3] }; }) },
      aqi: { value: 62, label: 'Moderate' },
      prayers: [
        { name: 'Fajr', time: '05:07' }, { name: 'Dhuhr', time: '12:01' }, { name: 'Asr', time: '15:20' },
        { name: 'Maghrib', time: '17:46' }, { name: 'Isha', time: '19:00' }
      ],
      fx: { rate: 22.9, usd: 84.1, gold: 439.5, change: 0.1, usdChange: -0.2, goldChange: 3.2 },
      commute: { minutes: 24 },
      events: [
        { title: 'School drop-off', start: at(7, 30), end: at(8, 0) },
        { title: 'Swimming class', start: at(16, 30), end: at(17, 30) },
        { title: 'Family dinner', start: at(19, 30), end: at(21, 0) },
        { title: 'Parent-teacher meeting', start: at(10, 0, 1), end: at(10, 30, 1) }
      ],
      music: {
        playing: true, title: 'Sample Song', artist: 'Sample Artist', album: 'Sample Album', image: '',
        progress: 84000, duration: 211000, device: "Piyush's iPhone", fetchedAt: Date.now()
      },
      cricket: {
        live: {
          name: 'India vs Australia, 2nd ODI', status: 'India opted to bat', teams: ['India', 'Australia'],
          scores: [{ inning: 'India Inning 1', r: 248, w: 4, o: 41.2 }]
        },
        next: { name: 'India vs Australia, 3rd ODI', teams: ['India', 'Australia'], start: at(10, 0, 3), scores: [] }
      },
      news: [
        { label: 'UAE', items: [{ title: 'Sample UAE headline about the city', source: 'Sample News', date: at(now.getHours() - 1, 0) }, { title: 'Second sample UAE headline', source: 'Sample Daily', date: at(now.getHours() - 3, 0) }] },
        { label: 'India', items: [{ title: 'Sample India headline', source: 'Sample Times', date: at(now.getHours() - 2, 0) }, { title: 'Second sample India headline', source: 'Sample Express', date: at(now.getHours() - 4, 0) }] }
      ],
      kids: [
        { name: 'Child 1', tasks: [{ text: 'Tidy room', done: true }, { text: 'Maths homework', done: false }] },
        { name: 'Child 2', tasks: [{ text: 'Set the table', done: false }, { text: 'Reading: 20 min', done: false }] }
      ],
      flights: [{
        label: 'Mum & Dad', number: 'XX 123', airline: 'Sample Airline', from: 'BOM', to: 'DXB',
        depart: '17:10', arrive: '19:05', departUtc: new Date(now.getTime() - 2 * 3600000), arriveUtc: new Date(now.getTime() + 1.2 * 3600000),
        terminal: '3', status: 'EnRoute'
      }],
      airportMinutes: 22
    };
  }

  return {
    weather: weather, airQuality: airQuality, prayers: prayers, fx: fx, commute: commute, commuteDetail: commuteDetail, pushed: pushed, mergeEvents: mergeEvents, whereabouts: whereabouts, inbox: inbox,
    driveMinutes: driveMinutes, calendar: calendar, spotifyNow: spotifyNow, spotifyControl: spotifyControl,
    cricket: cricket, news: news, kids: kids, flight: flight, pickArt: pickArt, pickFilm: pickFilm, demo: demo
  };
})();
