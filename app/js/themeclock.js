/* Gallery clock in the spirit of the picture on display.
 * Each kind of art gets its own clock, drawn as if by the same hand, in the picture's own colours:
 *   Impressionism     – an analogue dial made of dappled brush dabs, painterly hands
 *   Japanese prints   – a woodblock-style dial on paper with seigaiha waves, ink hands, a red seal
 *                       and a vertical title cartouche with the time
 *   Indian miniatures – a gilded arch framing a lotus dial, jewel ground, spade-tipped gold hands
 *   Landscapes        – a painted horizon whose sun (or moon) travels the sky with the hour
 *   Film posters      – the time set as a poster title with a credit block
 *   Family photos     – a simple dial tinted by the photo
 * Colours come from a small sample of the image; if it can't be read, the theme's own palette is used.
 * apply(el, art, sampleSrc) when the picture changes; render(el, now) on the clock tick. */
var ThemeClock = (function () {
  var W = 520, H = 300;
  var FALLBACK = {
    impressionism: [[38, 52, 70], [214, 200, 170], [120, 160, 200], [190, 150, 110]],
    landscape: [[40, 48, 40], [220, 205, 170], [150, 130, 80], [110, 140, 170]],
    japanese: [[30, 42, 70], [236, 226, 204], [40, 70, 120], [180, 60, 50]],
    indian: [[90, 24, 30], [230, 200, 140], [170, 40, 40], [40, 110, 90]],
    poster: [[14, 14, 18], [230, 230, 230], [230, 70, 50], [240, 200, 90]],
    family: [[30, 30, 34], [220, 220, 220], [200, 160, 110], [120, 150, 180]],
    classic: [[30, 30, 34], [220, 220, 220], [200, 160, 110], [120, 150, 180]]
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

  // ---------- colour ----------
  function hsl(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0;
    if (mx !== mn) {
      var d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
    }
    return [h, s, l];
  }
  function rgb(h, s, l) {
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
    if (!s) return [l, l, l].map(function (v) { return Math.round(v * 255); });
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map(function (v) { return Math.round(v * 255); });
  }
  function tone(x, sMin, sMax, l) { var y = hsl(x); return rgb(y[0], Math.max(sMin, Math.min(sMax, y[1])), l); }
  function mix(a, b, t) { return [0, 1, 2].map(function (i) { return Math.round(a[i] * (1 - t) + b[i] * t); }); }
  function c(x, a) { return a == null ? 'rgb(' + x.join(',') + ')' : 'rgba(' + x.join(',') + ',' + a + ')'; }

  function sample(img) {
    var cv = document.createElement('canvas');
    cv.width = 48; cv.height = Math.max(8, Math.round(48 * img.naturalHeight / img.naturalWidth));
    var cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0, cv.width, cv.height);
    var d = cx.getImageData(0, 0, cv.width, cv.height).data, px = [];
    for (var i = 0; i < d.length; i += 4) { var p = [d[i], d[i + 1], d[i + 2]]; px.push({ p: p, h: hsl(p) }); }
    px.sort(function (a, b) { return a.h[2] - b.h[2]; });
    function avg(list) {
      var s = [0, 0, 0]; list.forEach(function (x) { s[0] += x.p[0]; s[1] += x.p[1]; s[2] += x.p[2]; });
      return s.map(function (v) { return Math.round(v / (list.length || 1)); });
    }
    var k = Math.max(1, Math.round(px.length * 0.2)), bins = [], j;
    for (j = 0; j < 12; j++) bins.push({ w: 0, list: [] });
    px.forEach(function (x) {
      if (x.h[1] < 0.2 || x.h[2] < 0.15 || x.h[2] > 0.88) return;
      var b = bins[Math.floor(x.h[0] * 12) % 12]; b.w += x.h[1]; b.list.push(x);
    });
    bins.sort(function (a, b) { return b.w - a.w; });
    var light = avg(px.slice(-k)), acc = bins[0].list.length >= 4 ? avg(bins[0].list) : light;
    return [avg(px.slice(0, k)), light, acc, bins[1].list.length >= 4 ? avg(bins[1].list) : acc];
  }

  // ---------- drawing helpers ----------
  function rnd(seed) { var s = seed % 2147483647 || 7; return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; }; }
  function hashStr(t) { var h = 0; for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return Math.abs(h) || 1; }
  function angles(now) { var m = now.getMinutes(), h = now.getHours() % 12; return { h: (h + m / 60) * 30, m: m * 6 }; }
  function hm(now) { var h = now.getHours() % 12 || 12, m = now.getMinutes(); return h + ':' + (m < 10 ? '0' : '') + m; }
  function ap(now) { return now.getHours() < 12 ? 'am' : 'pm'; }
  var UID = 0;
  function svg(inner, defs) { return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' + (defs ? '<defs>' + defs + '</defs>' : '') + inner + '</svg>'; }
  // A tapered hand pointing up from the centre, rotated by `deg`.
  function hand(cx, cy, deg, len, wide, fill) {
    return '<path transform="translate(' + cx + ' ' + cy + ') rotate(' + deg.toFixed(1) + ')" d="M ' + (-wide) + ' 10 Q ' + (-wide * 0.8) + ' ' + (-len * 0.5) + ' 0 ' + (-len) +
      ' Q ' + (wide * 0.8) + ' ' + (-len * 0.5) + ' ' + wide + ' 10 Z" fill="' + fill + '"/>';
  }
  function ticks(cx, cy, r1, r2, color, width) {
    var s = '';
    for (var i = 0; i < 12; i++) {
      var a = i * Math.PI / 6, w = i % 3 ? width : width * 1.6;
      s += '<line x1="' + (cx + Math.sin(a) * r1).toFixed(1) + '" y1="' + (cy - Math.cos(a) * r1).toFixed(1) + '" x2="' + (cx + Math.sin(a) * r2).toFixed(1) +
        '" y2="' + (cy - Math.cos(a) * r2).toFixed(1) + '" stroke="' + color + '" stroke-width="' + w + '" stroke-linecap="round"/>';
    }
    return s;
  }

  // ---------- the clocks ----------
  var DRAW = {
    // Dappled brush dabs form the dial; painterly hands. Monet, Renoir, Pissarro…
    impressionism: function (P, now, seed) {
      var R = rnd(seed), cx = 260, cy = 150, r = 136, id = 'tcb' + (++UID), dabs = '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r - 4) + '" fill="' + P.base + '"/>';
      for (var i = 0; i < 420; i++) {
        var a = R() * Math.PI * 2, d = Math.sqrt(R()) * r, x = (cx + Math.cos(a) * d).toFixed(1), y = (cy + Math.sin(a) * d).toFixed(1);
        dabs += '<ellipse cx="' + x + '" cy="' + y + '" rx="' + (7 + R() * 9).toFixed(1) + '" ry="' + (3.5 + R() * 4).toFixed(1) +
          '" transform="rotate(' + Math.round(R() * 180) + ' ' + x + ' ' + y + ')" fill="' + P.dabs[Math.floor(R() * P.dabs.length)] + '" opacity="' + (0.55 + R() * 0.4).toFixed(2) + '"/>';
      }
      var A = angles(now);
      return svg('<g filter="url(#' + id + ')">' + dabs + ticks(cx, cy, r - 24, r - 8, P.mark, 5) +
        hand(cx, cy, A.h, 72, 9, P.ink) + hand(cx, cy, A.m, 112, 6, P.ink) + '<circle cx="' + cx + '" cy="' + cy + '" r="9" fill="' + P.mark + '"/></g>',
        '<filter id="' + id + '" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="4"/></filter>');
    },
    // Woodblock print: paper dial, indigo seigaiha waves, ink hands, red seal, title cartouche.
    japanese: function (P, now) {
      var cx = 190, cy = 150, r = 128, waves = '', A = angles(now), id = 'tcj' + (++UID);
      for (var row = 0; row < 6; row++) {
        for (var col = -1; col < 12; col++) {
          var x = cx - r + col * 26 + (row % 2 ? 13 : 0), y = cy + 34 + row * 13;
          for (var k = 0; k < 3; k++) {
            var rr = 13 - k * 4;
            waves += '<path d="M ' + (x - rr) + ' ' + y + ' A ' + rr + ' ' + rr + ' 0 0 1 ' + (x + rr) + ' ' + y + '" fill="' + (k === 0 ? P.paper : 'none') + '" stroke="' + P.wave + '" stroke-width="2"/>';
          }
        }
      }
      var t = hm(now).split(':');
      return svg('<circle cx="' + cx + '" cy="' + cy + '" r="' + (r + 8) + '" fill="' + P.paper + '" stroke="' + P.ink + '" stroke-width="2"/>' +
        '<g clip-path="url(#' + id + ')">' + waves + '</g>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + P.ink + '" stroke-width="1.2"/>' +
        ticks(cx, cy, r - 18, r - 6, P.ink, 3.5) +
        hand(cx, cy, A.h, 66, 7, P.ink) + hand(cx, cy, A.m, 104, 4.5, P.ink) + '<circle cx="' + cx + '" cy="' + cy + '" r="7" fill="' + P.seal + '"/>' +
        '<rect x="384" y="30" width="70" height="240" fill="' + P.paper + '" stroke="' + P.ink + '" stroke-width="2"/>' +
        '<rect x="390" y="36" width="58" height="228" fill="none" stroke="' + P.ink + '" stroke-width="1"/>' +
        '<text x="419" y="112" text-anchor="middle" font-family="Shippori Mincho, serif" font-weight="600" font-size="50" fill="' + P.ink + '">' + t[0] + '</text>' +
        '<text x="419" y="186" text-anchor="middle" font-family="Shippori Mincho, serif" font-weight="600" font-size="50" fill="' + P.ink + '">' + t[1] + '</text>' +
        '<rect x="403" y="212" width="32" height="32" fill="' + P.seal + '"/>' +
        '<text x="419" y="234" text-anchor="middle" font-family="Shippori Mincho, serif" font-weight="600" font-size="16" fill="' + P.paper + '">' + ap(now) + '</text>',
        '<clipPath id="' + id + '"><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"/></clipPath>');
    },
    // Mughal / Rajput miniature: gilded arch, jewel ground, lotus dial, spade-tipped hands.
    indian: function (P, now) {
      var cx = 260, cy = 168, A = angles(now), petals = '';
      for (var i = 0; i < 12; i++) {
        petals += '<path transform="translate(' + cx + ' ' + cy + ') rotate(' + (i * 30) + ')" d="M 0 -76 Q 16 -96 0 -116 Q -16 -96 0 -76 Z" fill="' + P.petal + '" stroke="' + P.gold + '" stroke-width="2"/>';
      }
      var arch = 'M 118 296 L 118 124 Q 118 74 168 56 Q 228 36 260 6 Q 292 36 352 56 Q 402 74 402 124 L 402 296 Z';
      function spade(deg, len, w) {
        return '<g transform="translate(' + cx + ' ' + cy + ') rotate(' + deg.toFixed(1) + ')"><line x1="0" y1="8" x2="0" y2="' + (-len + 14) + '" stroke="' + P.gold + '" stroke-width="' + w + '" stroke-linecap="round"/>' +
          '<path d="M 0 ' + (-len) + ' L 8 ' + (-len + 12) + ' L 0 ' + (-len + 20) + ' L -8 ' + (-len + 12) + ' Z" fill="' + P.gold + '"/></g>';
      }
      return svg('<path d="' + arch + '" fill="' + P.ground + '" stroke="' + P.gold + '" stroke-width="4"/>' +
        '<path d="' + arch + '" fill="none" stroke="' + P.gold + '" stroke-width="1.5" transform="translate(260 296) scale(0.93) translate(-260 -296)"/>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="124" fill="none" stroke="' + P.gold + '" stroke-width="2" stroke-dasharray="0.1 9" stroke-linecap="round"/>' +
        petals + '<circle cx="' + cx + '" cy="' + cy + '" r="68" fill="' + P.ground2 + '" stroke="' + P.gold + '" stroke-width="2"/>' +
        spade(A.h, 54, 5) + spade(A.m, 92, 3.5) +
        '<circle cx="' + cx + '" cy="' + cy + '" r="10" fill="' + P.gold + '"/><circle cx="' + cx + '" cy="' + cy + '" r="4" fill="' + P.ground + '"/>');
    },
    // A painted horizon: the sun (or moon) crosses the sky with the hour; the time in a classical serif.
    landscape: function (P, now) {
      var mins = now.getHours() * 60 + now.getMinutes(), day = mins >= 360 && mins < 1080;
      var f = day ? (mins - 360) / 720 : ((mins + 1440 - 1080) % 1440) / 720;
      var sx = (40 + f * 440).toFixed(1), sy = (210 - Math.sin(f * Math.PI) * 150).toFixed(1);
      var sky = day ? [P.skyTop, P.skyLow] : [P.nightTop, P.nightLow], text = day ? P.text : P.textNight, id = 'tcs' + (++UID);
      return svg('<rect width="520" height="300" rx="6" fill="url(#' + id + ')"/>' +
        '<path d="M 40 210 Q 260 -90 480 210" fill="none" stroke="' + P.arc + '" stroke-width="1.2" stroke-dasharray="3 7"/>' +
        (day ? '<circle cx="' + sx + '" cy="' + sy + '" r="28" fill="' + P.sun + '" opacity=".25"/><circle cx="' + sx + '" cy="' + sy + '" r="16" fill="' + P.sun + '"/>'
             : '<circle cx="' + sx + '" cy="' + sy + '" r="13" fill="' + P.moon + '"/><circle cx="' + (+sx + 6) + '" cy="' + (+sy - 4) + '" r="11" fill="' + sky[0] + '"/>') +
        '<path d="M 0 214 Q 70 176 150 200 T 300 192 T 430 186 T 520 198 L 520 300 L 0 300 Z" fill="' + P.hillFar + '"/>' +
        '<path d="M 0 246 Q 110 214 210 238 T 400 230 T 520 240 L 520 300 L 0 300 Z" fill="' + P.hillNear + '"/>' +
        '<text x="260" y="156" text-anchor="middle" font-family="Cormorant Garamond, serif" font-weight="600" font-size="84" fill="' + text + '">' + hm(now) +
        '<tspan font-size="30" dx="8">' + ap(now) + '</tspan></text>',
        '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + sky[0] + '"/><stop offset="0.72" stop-color="' + sky[1] + '"/></linearGradient>');
    },
    // The time as a film-poster title, with a credit block.
    poster: function (P, now) {
      var days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
      var mon = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
      return svg('<rect width="520" height="300" fill="' + P.bg + '"/>' +
        '<text x="260" y="56" text-anchor="middle" font-family="Bebas Neue, sans-serif" font-size="24" letter-spacing="8" fill="' + P.dim + '">NOW SHOWING</text>' +
        '<text x="260" y="198" text-anchor="middle" font-family="Bebas Neue, sans-serif" font-size="156" letter-spacing="4" fill="' + P.hot + '">' + hm(now) + '</text>' +
        '<line x1="70" y1="222" x2="450" y2="222" stroke="' + P.hot + '" stroke-width="2"/>' +
        '<text x="260" y="258" text-anchor="middle" font-family="Bebas Neue, sans-serif" font-size="26" letter-spacing="5" fill="' + P.text + '">' +
          days[now.getDay()] + ' · ' + now.getDate() + ' ' + mon[now.getMonth()] + ' · ' + ap(now).toUpperCase() + '</text>');
    },
    // Family photos and anything else: a quiet dial tinted by the picture.
    family: function (P, now) {
      var cx = 260, cy = 150, r = 128, A = angles(now), dots = '';
      for (var i = 0; i < 12; i++) {
        var a = i * Math.PI / 6;
        dots += '<circle cx="' + (cx + Math.sin(a) * (r - 16)).toFixed(1) + '" cy="' + (cy - Math.cos(a) * (r - 16)).toFixed(1) + '" r="' + (i % 3 ? 3 : 6) + '" fill="' + P.text + '"/>';
      }
      return svg('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + P.bg + '" stroke="' + P.ring + '" stroke-width="3"/>' + dots +
        '<line x1="' + cx + '" y1="' + cy + '" x2="' + cx + '" y2="' + (cy - 64) + '" stroke="' + P.text + '" stroke-width="8" stroke-linecap="round" transform="rotate(' + A.h.toFixed(1) + ' ' + cx + ' ' + cy + ')"/>' +
        '<line x1="' + cx + '" y1="' + cy + '" x2="' + cx + '" y2="' + (cy - 100) + '" stroke="' + P.text + '" stroke-width="5" stroke-linecap="round" transform="rotate(' + A.m + ' ' + cx + ' ' + cy + ')"/>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="8" fill="' + P.accent + '"/>');
    }
  };
  DRAW.classic = DRAW.family;

  // The colours each clock needs, from the picture's dark, light and two accent colours.
  function paletteFor(style, pal) {
    var dark = pal[0], light = pal[1], acc = pal[2], acc2 = pal[3] || pal[2];
    if (style === 'impressionism') {
      return { dabs: [c(tone(acc, 0.25, 0.65, 0.62)), c(tone(acc2, 0.25, 0.6, 0.66)), c(tone(light, 0.15, 0.5, 0.78)), c(tone(mix(acc, light, 0.5), 0.2, 0.6, 0.72)), c(tone(acc, 0.25, 0.65, 0.5))],
        base: c(tone(mix(acc, dark, 0.35), 0.2, 0.55, 0.42)), ink: c(tone(dark, 0.2, 0.55, 0.13)), mark: c(tone(mix(light, [255, 250, 235], 0.4), 0.1, 0.4, 0.93)) };
    }
    if (style === 'japanese') {
      return { paper: c(tone(mix(light, [241, 232, 214], 0.6), 0.15, 0.4, 0.89)), ink: c(tone(mix(dark, acc, 0.3), 0.25, 0.6, 0.17)),
        wave: c(tone(acc, 0.3, 0.6, 0.38), 0.75), seal: 'rgb(178,52,40)' };
    }
    if (style === 'indian') {
      return { ground: c(tone(acc, 0.35, 0.7, 0.18)), ground2: c(tone(acc2, 0.3, 0.65, 0.26)), petal: c(tone(acc2, 0.3, 0.65, 0.34)), gold: c(mix([226, 186, 96], light, 0.15)) };
    }
    if (style === 'landscape') {
      return { skyTop: c(tone(mix(acc2, light, 0.4), 0.15, 0.5, 0.62)), skyLow: c(tone(light, 0.15, 0.55, 0.84)),
        nightTop: c(tone(dark, 0.2, 0.5, 0.1)), nightLow: c(tone(mix(dark, acc2, 0.4), 0.2, 0.5, 0.24)),
        sun: c(mix([255, 214, 140], light, 0.2)), moon: 'rgb(236,232,214)', arc: c(tone(light, 0, 0.3, 0.92), 0.5),
        hillFar: c(tone(mix(acc, dark, 0.3), 0.15, 0.5, 0.36)), hillNear: c(tone(dark, 0.15, 0.5, 0.17)),
        text: c(tone(dark, 0.15, 0.5, 0.14)), textNight: c(tone(light, 0.1, 0.4, 0.9)) };
    }
    if (style === 'poster') {
      return { bg: c(tone(dark, 0, 0.35, 0.07)), hot: c(tone(acc, 0.6, 0.95, 0.58)), text: 'rgb(232,232,232)', dim: 'rgba(232,232,232,0.55)' };
    }
    return { bg: c(tone(dark, 0, 0.3, 0.14)), ring: c(tone(acc, 0.1, 0.5, 0.5), 0.6), text: c(tone(light, 0, 0.25, 0.9)), accent: c(tone(acc, 0.4, 0.8, 0.6)) };
  }

  function render(el, now, force) {
    if (!el || !el._tc) return;
    var key = now.getHours() + ':' + now.getMinutes();
    if (!force && el._tcKey === key) return;
    el._tcKey = key;
    el.innerHTML = DRAW[el._tc.style](el._tc.P, now, el._tc.seed);
    el.setAttribute('aria-label', 'It is ' + hm(now) + ' ' + ap(now));
  }

  function apply(el, art, sampleSrc) {
    if (!el) return;
    var my = el._tcTok = (el._tcTok || 0) + 1, style = styleFor(art);
    function done(pal) {
      if (my !== el._tcTok) return;
      el.style.opacity = 0;                                        // fade out, redraw, fade in
      setTimeout(function () {
        if (my !== el._tcTok) return;
        el.className = 'tclk tclk-' + style;
        el._tc = { style: style, P: paletteFor(style, pal), seed: hashStr(String(art && art.src || 'x')) };
        render(el, new Date(), true);
        el.style.opacity = 1;
      }, 450);
    }
    if (!sampleSrc) return done(FALLBACK[style]);
    var img = new Image(), t = setTimeout(function () { img.onload = img.onerror = null; done(FALLBACK[style]); }, 8000);
    img.crossOrigin = 'anonymous';
    img.onload = function () { clearTimeout(t); try { done(sample(img)); } catch (e) { done(FALLBACK[style]); } };
    img.onerror = function () { clearTimeout(t); done(FALLBACK[style]); };
    img.src = sampleSrc;
  }

  return { apply: apply, render: render, styleFor: styleFor };
})();
