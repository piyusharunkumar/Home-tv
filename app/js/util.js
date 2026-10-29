/* Small helpers shared by the other scripts. */
window.U = (function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function proxied(url) {
    var p = (window.CONFIG && window.CONFIG.corsProxy) || '';
    return p ? p + encodeURIComponent(url) : url;
  }

  async function request(url, opts, useProxy, ms) {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, ms || 15000);
    try {
      var r = await fetch(useProxy ? proxied(url) : url, Object.assign({}, opts || {}, { signal: ctl.signal }));
      if (!r.ok && r.status !== 204) throw new Error('HTTP ' + r.status + ' for ' + url.split('?')[0]);
      return r;
    } finally {
      clearTimeout(timer);
    }
  }

  async function json(url, opts, useProxy) {
    var r = await request(url, opts, useProxy);
    if (r.status === 204) return null;
    return r.json();
  }

  async function text(url, opts, useProxy) {
    var r = await request(url, opts, useProxy);
    return r.text();
  }

  var store = {
    get: function (k, fallback) {
      try { var v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
    }
  };

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  // 24h "HH:MM" or a Date → "5:46 PM"
  function time12(x) {
    var h, m;
    if (x instanceof Date) { h = x.getHours(); m = x.getMinutes(); }
    else { var p = String(x).split(':'); h = parseInt(p[0], 10); m = parseInt(p[1], 10); }
    var ap = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + pad(m) + ' ' + ap;
  }

  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function parseLocalDate(s) {           // "2026-11-08" → local midnight
    var p = s.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function daysBetween(a, b) {           // whole calendar days from a to b
    var A = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    var B = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((B - A) / 86400000);
  }

  function stripHtml(s) {
    var d = document.createElement('div');
    d.innerHTML = s || '';
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function truncate(s, n) {
    s = s || '';
    if (s.length <= n) return s;
    var cut = s.slice(0, n);
    var dot = cut.lastIndexOf('. ');
    return (dot > n * 0.5 ? cut.slice(0, dot + 1) : cut.replace(/\s+\S*$/, '') + '…');
  }

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Image failed: ' + url)); };
      img.src = url;
    });
  }

  return {
    esc: esc, request: request, json: json, text: text, store: store,
    pad: pad, time12: time12, dayKey: dayKey, parseLocalDate: parseLocalDate,
    daysBetween: daysBetween, stripHtml: stripHtml, truncate: truncate,
    shuffle: shuffle, loadImage: loadImage
  };
})();
