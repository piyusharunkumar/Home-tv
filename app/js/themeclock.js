/* Themed gallery clock: dresses the gallery's word clock in the visual language of whatever is on
 * display. Each art theme gets its own typeface and panel treatment (Impressionist brushwork,
 * a Japanese print's paper and seal, a miniature's gilded border, a film poster's bold type), and
 * the colours are taken from the picture itself, so every painting or poster gets a matching clock.
 * Colours are sampled from a small copy of the image; if that isn't possible, the theme's own
 * palette is used. Called with the panel element and the art object each time the art changes. */
var ThemeClock = (function () {
  var STYLES = ['impressionism', 'landscape', 'japanese', 'indian', 'poster', 'family', 'classic'];
  var FALLBACK = {                       // dark, light, accent (RGB) when the picture can't be sampled
    impressionism: [[38, 52, 70], [214, 200, 170], [120, 160, 200]],
    landscape: [[40, 48, 40], [220, 205, 170], [150, 130, 80]],
    japanese: [[30, 42, 70], [236, 226, 204], [40, 70, 120]],
    indian: [[90, 24, 30], [230, 200, 140], [170, 40, 40]],
    poster: [[14, 14, 18], [230, 230, 230], [230, 70, 50]],
    family: [[30, 30, 34], [220, 220, 220], [200, 160, 110]],
    classic: [[30, 30, 34], [220, 220, 220], [200, 160, 110]]
  };

  function styleFor(a) {
    if (!a) return 'classic';
    if (a.film) return 'poster';
    if (a.family) return 'family';
    var t = String(a.theme || '');
    if (/impression/i.test(t)) return 'impressionism';
    if (/japan|ukiyo|woodblock/i.test(t)) return 'japanese';
    if (/india|mughal|miniature|rajput/i.test(t)) return 'indian';
    if (/landscape/i.test(t)) return 'landscape';
    return 'classic';
  }

  // ---- colour helpers ----
  function toHsl(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function toRgb(h, s, l) {
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
    if (!s) return [l * 255, l * 255, l * 255].map(Math.round);
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map(function (v) { return Math.round(v * 255); });
  }
  function adj(c, sMin, sMax, l) {        // same hue, saturation clamped, lightness set
    var x = toHsl(c);
    return toRgb(x[0], Math.max(sMin, Math.min(sMax, x[1])), l);
  }
  function mix(a, b, t) { return [0, 1, 2].map(function (i) { return Math.round(a[i] * (1 - t) + b[i] * t); }); }
  function css(c, alpha) { return alpha == null ? 'rgb(' + c.join(',') + ')' : 'rgba(' + c.join(',') + ',' + alpha + ')'; }

  // Dark, light and accent colours of the picture, from a 48 px copy.
  function sample(img) {
    var n = 48, cv = document.createElement('canvas');
    cv.width = n; cv.height = Math.max(8, Math.round(n * img.naturalHeight / img.naturalWidth));
    var cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0, cv.width, cv.height);
    var d = cx.getImageData(0, 0, cv.width, cv.height).data, px = [];
    for (var i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
    var withL = px.map(function (p) { return { p: p, hsl: toHsl(p) }; }).sort(function (a, b) { return a.hsl[2] - b.hsl[2]; });
    function avg(list) {
      var s = [0, 0, 0]; list.forEach(function (x) { s[0] += x.p[0]; s[1] += x.p[1]; s[2] += x.p[2]; });
      return s.map(function (v) { return Math.round(v / (list.length || 1)); });
    }
    var k = Math.max(1, Math.round(withL.length * 0.2));
    var dark = avg(withL.slice(0, k)), light = avg(withL.slice(-k));
    var bins = [], i2;
    for (i2 = 0; i2 < 12; i2++) bins.push({ w: 0, list: [] });
    withL.forEach(function (x) {
      if (x.hsl[1] < 0.22 || x.hsl[2] < 0.18 || x.hsl[2] > 0.85) return;
      var b = bins[Math.floor(x.hsl[0] * 12) % 12]; b.w += x.hsl[1]; b.list.push(x);
    });
    bins.sort(function (a, b) { return b.w - a.w; });
    var accent = bins[0].list.length >= 4 ? avg(bins[0].list) : light;
    var accent2 = bins[1] && bins[1].list.length >= 4 ? avg(bins[1].list) : accent;
    return [dark, light, accent, accent2];
  }

  // Panel colours for a style from the picture's colours.
  function vars(style, pal) {
    var dark = pal[0], light = pal[1], acc = pal[2], acc2 = pal[3] || pal[2], v = {};
    if (style === 'japanese') {
      var ink = adj(mix(dark, acc, 0.35), 0.25, 0.6, 0.2);
      v = { bg: css(adj(mix(light, [241, 232, 214], 0.55), 0.15, 0.4, 0.88)), bg2: css(adj(mix(light, [241, 232, 214], 0.55), 0.15, 0.4, 0.84)),
        on: css(ink), off: css(ink, 0.11), glow: 'transparent', line: css(ink, 0.28), seal: 'rgb(178,52,40)' };
    } else if (style === 'indian') {
      var gold = mix([222, 182, 92], light, 0.2);
      v = { bg: css(adj(acc, 0.35, 0.7, 0.17)), bg2: css(adj(acc2, 0.3, 0.6, 0.22)), on: css(gold), off: css(gold, 0.13),
        glow: css(gold, 0.45), line: css(gold), seal: css(gold) };
    } else if (style === 'poster') {
      var hot = adj(acc, 0.6, 0.95, 0.6);
      v = { bg: css(adj(dark, 0, 0.35, 0.07)), bg2: css(adj(dark, 0, 0.35, 0.11)), on: css(hot), off: 'rgba(255,255,255,0.07)',
        glow: css(hot, 0.5), line: css(hot), seal: css(hot) };
    } else if (style === 'impressionism') {
      var soft = adj(mix(light, acc, 0.25), 0.2, 0.55, 0.86);
      v = { bg: css(adj(dark, 0.15, 0.45, 0.17)), bg2: css(adj(acc, 0.25, 0.55, 0.3)), bg3: css(adj(acc2, 0.2, 0.5, 0.27)),
        on: css(soft), off: css(soft, 0.12), glow: css(soft, 0.5), line: css(soft, 0.25), seal: css(soft) };
    } else if (style === 'landscape') {
      var warm = adj(mix(light, [240, 220, 170], 0.3), 0.15, 0.5, 0.85);
      v = { bg: css(adj(dark, 0.1, 0.4, 0.13)), bg2: css(adj(mix(acc, light, 0.3), 0.15, 0.45, 0.32)), on: css(warm), off: css(warm, 0.12),
        glow: css(warm, 0.45), line: css(warm, 0.25), seal: css(warm) };
    } else {
      var lit = adj(mix(light, acc, 0.15), 0, 0.35, 0.92);
      v = { bg: css(adj(dark, 0, 0.25, 0.16)), bg2: css(adj(dark, 0, 0.25, 0.2)), on: css(lit), off: css(lit, 0.1),
        glow: css(lit, 0.45), line: css(lit, 0.2), seal: css(lit) };
    }
    return v;
  }

  function paint(el, style, pal) {
    var v = vars(style, pal);
    STYLES.forEach(function (s) { el.classList.remove('wct-' + s); });
    el.classList.add('wct', 'wct-' + style);
    ['bg', 'bg2', 'bg3', 'on', 'off', 'glow', 'line', 'seal'].forEach(function (k) {
      if (v[k]) el.style.setProperty('--wc-' + k, v[k]); else el.style.removeProperty('--wc-' + k);
    });
  }

  // srcForSampling: a URL the TV may read pixels from (same image, CORS-enabled).
  function apply(el, art, srcForSampling) {
    if (!el) return;
    var my = el._wcTok = (el._wcTok || 0) + 1, style = styleFor(art);
    function done(pal) {
      if (my !== el._wcTok) return;
      el.style.opacity = 0;                                        // fade out, restyle, fade in
      setTimeout(function () { if (my !== el._wcTok) return; paint(el, style, pal); el.style.opacity = 1; }, 450);
    }
    if (!srcForSampling) return done(FALLBACK[style]);
    var img = new Image(), t = setTimeout(function () { done(FALLBACK[style]); img.onload = img.onerror = null; }, 8000);
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      clearTimeout(t);
      try { done(sample(img)); } catch (e) { done(FALLBACK[style]); }
    };
    img.onerror = function () { clearTimeout(t); done(FALLBACK[style]); };
    img.src = srcForSampling;
  }

  return { apply: apply, styleFor: styleFor };
})();
