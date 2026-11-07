/* Games mode: three small games played with the TV remote (arrows + OK, BACK to leave).
   - Desert Dash: endless runner (OK / ▲ jump, ▼ duck)
   - Turbo Lanes: top-down racer (◀ ▶ change lane)
   - Four in a Row: pass-the-remote board game, or play against Sam
   Two-player modes take turns with one remote. Everything is drawn on one 1920x1080 canvas. */
var Games = (function () {
  'use strict';
  var W = 1920, H = 1080;
  var K = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27 };
  var ACC = '#F2B36B', INK = '#F4F1EA', DIM = 'rgba(244,241,234,0.62)', BG = '#0F1217';
  var P_COL = ['#F2B36B', '#5CC8E8'];
  var FONT = 'Manrope, sans-serif';

  var root, cv, ctx, raf = 0, last = 0, onExit = null;
  var api = { active: false };
  var st = { screen: 'menu', sel: 0, modeSel: 0 };

  var LIST = [
    { id: 'dash', name: 'Desert Dash', blurb: 'Jump the cactus, duck the birds', modes: ['1 player', '2 players · take turns'] },
    { id: 'race', name: 'Turbo Lanes', blurb: 'Dodge the traffic, grab the stars', modes: ['1 player', '2 players · take turns'] },
    { id: 'four', name: 'Four in a Row', blurb: 'Line up four to win', modes: ['Play against Sam', '2 players · pass the remote'] }
  ];

  // ---------- small helpers ----------
  function best(id, v) {
    var k = 'game-best-' + id;
    try {
      var b = +(localStorage.getItem(k) || 0);
      if (v != null && v > b) { localStorage.setItem(k, String(v)); return v; }
      return b;
    } catch (e) { return 0; }
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function text(s, x, y, size, color, align, weight) {
    ctx.font = (weight || 700) + ' ' + size + 'px ' + FONT;
    ctx.fillStyle = color || INK; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }
  function circle(x, y, r, color) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }
  function hit(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pName(i) { return 'Player ' + (i + 1); }

  // ---------- open / close ----------
  function open(exitCb) {
    onExit = exitCb || null;
    if (!root) {
      root = document.createElement('div');
      root.id = 'games';
      root.style.cssText = 'position:absolute;left:0;top:0;width:1920px;height:1080px;z-index:50;background:' + BG;
      cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      cv.style.cssText = 'display:block;width:1920px;height:1080px';
      root.appendChild(cv);
      (document.getElementById('screen') || document.body).appendChild(root);
      ctx = cv.getContext('2d');
    }
    root.style.display = 'block';
    api.active = true;
    st = { screen: 'menu', sel: st.sel || 0, modeSel: 0 };
    last = 0; loop(0);
  }
  function close() {
    api.active = false;
    if (raf) cancelAnimationFrame(raf); raf = 0;
    if (root) root.style.display = 'none';
    if (onExit) onExit();
  }
  function loop(t) {
    raf = requestAnimationFrame(loop);
    var dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016; last = t;
    update(dt); draw();
  }

  // ---------- flow ----------
  var game = null;           // the running game object
  var match = null;          // { players, turn, scores[] } for take-turns modes
  function startGame(id, modeIdx) {
    if (id === 'four') { game = Four(modeIdx === 0); st.screen = 'play'; return; }
    match = { two: modeIdx === 1, turn: 0, scores: [] };
    game = id === 'dash' ? Dash() : Race();
    game.id = id;
    st.screen = match.two ? 'turn' : 'play';
  }
  function finishRun(score) {
    var id = game.id;
    var rec = score > best(id); best(id, score);
    match.scores[match.turn] = score; match.newBest = rec;
    if (match.two && match.turn === 0) { match.turn = 1; game = id === 'dash' ? Dash() : Race(); game.id = id; st.screen = 'turn'; return; }
    st.screen = 'over';
  }

  function key(code) {
    if (code === K.ESC) code = K.BACK;
    var s = st.screen;
    if (s === 'menu') {
      if (code === K.LEFT) st.sel = (st.sel + LIST.length - 1) % LIST.length;
      else if (code === K.RIGHT) st.sel = (st.sel + 1) % LIST.length;
      else if (code === K.ENTER) { st.screen = 'mode'; st.modeSel = 0; }
      else if (code === K.BACK) close();
      return true;
    }
    if (s === 'mode') {
      if (code === K.UP || code === K.DOWN || code === K.LEFT || code === K.RIGHT) st.modeSel = 1 - st.modeSel;
      else if (code === K.ENTER) startGame(LIST[st.sel].id, st.modeSel);
      else if (code === K.BACK) st.screen = 'menu';
      return true;
    }
    if (s === 'turn') {
      if (code === K.ENTER) st.screen = 'play';
      else if (code === K.BACK) st.screen = 'menu';
      return true;
    }
    if (s === 'paused') {
      if (code === K.ENTER) st.screen = 'play';
      else if (code === K.BACK) st.screen = 'menu';
      return true;
    }
    if (s === 'over') {
      if (code === K.ENTER) startGame(LIST[st.sel].id, match && match.two ? 1 : 0);
      else if (code === K.BACK) st.screen = 'menu';
      return true;
    }
    if (s === 'play') {
      if (code === K.BACK) { if (game.id === 'four' && game.done) st.screen = 'menu'; else st.screen = 'paused'; return true; }
      game.key(code);
      return true;
    }
    return true;
  }
  function keyUp(code) { if (st.screen === 'play' && game && game.keyUp) game.keyUp(code); }

  function update(dt) {
    if (st.screen === 'play' && game) {
      game.update(dt);
      if (game.over && game.id !== 'four') finishRun(game.score);
    }
  }

  // ---------- drawing: menus ----------
  function draw() {
    if (st.screen === 'menu') return drawMenu();
    if (st.screen === 'mode') return drawMode();
    if (game) game.draw();
    if (st.screen === 'turn') drawPanel(pName(match.turn) + (match.turn ? ', your turn' : ' goes first'),
      match.turn ? 'Pass the remote to Player 2.  Score to beat: ' + match.scores[0] : 'Then pass the remote to Player 2', 'Press OK to start', P_COL[match.turn]);
    if (st.screen === 'paused') drawPanel('Paused', '', 'OK to carry on  ·  BACK for the games menu');
    if (st.screen === 'over') drawOver();
  }
  function drawBackdrop() {
    var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#151A22'); g.addColorStop(1, '#0B0E13');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function drawMenu() {
    drawBackdrop();
    text('GAMES', 120, 130, 26, ACC, 'left', 800);
    text('Pick a game', 120, 190, 56, INK, 'left', 700);
    var cw = 520, ch = 560, gap = 60, x0 = (W - (cw * 3 + gap * 2)) / 2, y0 = 270;
    LIST.forEach(function (g, i) {
      var x = x0 + i * (cw + gap), f = i === st.sel;
      ctx.save();
      if (f) { ctx.shadowColor = 'rgba(242,179,107,0.45)'; ctx.shadowBlur = 40; }
      rr(x, y0, cw, ch, 28); ctx.fillStyle = f ? '#232A35' : '#1A2029'; ctx.fill();
      ctx.restore();
      if (f) { rr(x, y0, cw, ch, 28); ctx.lineWidth = 5; ctx.strokeStyle = ACC; ctx.stroke(); }
      ctx.save(); rr(x + 24, y0 + 24, cw - 48, 330, 18); ctx.clip();
      preview(g.id, x + 24, y0 + 24, cw - 48, 330);
      ctx.restore();
      text(g.name, x + 36, y0 + 410, 40, INK, 'left', 800);
      text(g.blurb, x + 36, y0 + 462, 24, DIM, 'left', 600);
      var b = best(g.id);
      text(g.id === 'four' ? '1–2 players' : (b ? 'Best ' + b : '1–2 players'), x + 36, y0 + 512, 24, ACC, 'left', 700);
    });
    text('◀ ▶ choose   ·   OK play   ·   BACK home', W / 2, 960, 26, DIM, 'center', 600);
  }
  function preview(id, x, y, w, h) {
    if (id === 'dash') {
      var g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#F6B26B'); g.addColorStop(1, '#F7D9A8');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      circle(x + w - 90, y + 80, 40, '#FFF1D6');
      ctx.fillStyle = '#E6A867'; ctx.beginPath(); ctx.moveTo(x, y + 230); ctx.quadraticCurveTo(x + 150, y + 170, x + 300, y + 230); ctx.quadraticCurveTo(x + 400, y + 200, x + w, y + 220); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.fill();
      ctx.fillStyle = '#C98A4E'; ctx.fillRect(x, y + 270, w, h - 270);
      drawRunner(x + 90, y + 270, 0.9, 0.3, false);
      drawCactus(x + 300, y + 270, 1, 0.9);
      drawBird(x + 380, y + 140, 0.9, 0);
    } else if (id === 'race') {
      ctx.fillStyle = '#2F7A4B'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#3B414C'; ctx.fillRect(x + 80, y, w - 160, h);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (var i = 0; i < 6; i++) { ctx.fillRect(x + 80 + (w - 160) / 3 - 4, y + i * 70, 8, 40); ctx.fillRect(x + 80 + 2 * (w - 160) / 3 - 4, y + i * 70, 8, 40); }
      drawCar(x + w / 2, y + 250, 0.75, P_COL[0]);
      drawCar(x + 80 + (w - 160) / 6, y + 90, 0.75, '#E4574C', true);
      drawStar(x + w - 80 - (w - 160) / 6, y + 150, 20);
    } else {
      ctx.fillStyle = '#1D3F8F'; ctx.fillRect(x, y, w, h);
      var cs = 52, bx = x + (w - cs * 7) / 2, by = y + (h - cs * 6) / 2;
      var demo = ['.......', '.......', '...b...', '..ab...', '.aba...', 'abbab..'];
      for (var r = 0; r < 6; r++) for (var c = 0; c < 7; c++) {
        var ch = demo[r][c];
        circle(bx + c * cs + cs / 2, by + r * cs + cs / 2, 20, ch === 'a' ? P_COL[0] : ch === 'b' ? P_COL[1] : '#0F1217');
      }
    }
  }
  function drawMode() {
    drawBackdrop();
    var g = LIST[st.sel];
    text(g.name.toUpperCase(), W / 2, 250, 26, ACC, 'center', 800);
    text('Who is playing?', W / 2, 320, 56, INK, 'center', 700);
    g.modes.forEach(function (m, i) {
      var bw = 760, bh = 130, x = (W - bw) / 2, y = 430 + i * 170, f = i === st.modeSel;
      rr(x, y, bw, bh, 26); ctx.fillStyle = f ? '#2A3240' : '#1A2029'; ctx.fill();
      if (f) { ctx.lineWidth = 5; ctx.strokeStyle = ACC; ctx.stroke(); }
      // little player dots
      circle(x + 80, y + bh / 2, 22, P_COL[0]);
      if (i === 1) circle(x + 120, y + bh / 2, 22, P_COL[1]);
      else if (g.id === 'four') { circle(x + 120, y + bh / 2, 22, '#E4574C'); }
      text(m, x + 175, y + bh / 2, 38, f ? INK : DIM, 'left', 700);
    });
    text('▲ ▼ choose   ·   OK start   ·   BACK games', W / 2, 960, 26, DIM, 'center', 600);
  }
  function drawPanel(title, sub, hint, color) {
    ctx.fillStyle = 'rgba(8,10,14,0.72)'; ctx.fillRect(0, 0, W, H);
    rr(W / 2 - 520, 330, 1040, 400, 32); ctx.fillStyle = '#1A2029'; ctx.fill();
    if (color) { ctx.fillStyle = color; rr(W / 2 - 520, 330, 1040, 14, 7); ctx.fill(); }
    text(title, W / 2, 450, 64, color || INK, 'center', 800);
    if (sub) text(sub, W / 2, 540, 30, DIM, 'center', 600);
    text(hint, W / 2, 640, 30, INK, 'center', 700);
  }
  function drawOver() {
    ctx.fillStyle = 'rgba(8,10,14,0.78)'; ctx.fillRect(0, 0, W, H);
    rr(W / 2 - 560, 250, 1120, 560, 32); ctx.fillStyle = '#1A2029'; ctx.fill();
    var id = LIST[st.sel].id, b = best(id);
    if (match.two) {
      var a = match.scores[0], c = match.scores[1];
      var title = a === c ? 'It’s a tie!' : pName(a > c ? 0 : 1) + ' wins!';
      text(title, W / 2, 360, 64, a === c ? INK : P_COL[a > c ? 0 : 1], 'center', 800);
      [0, 1].forEach(function (i) {
        var x = W / 2 + (i ? 260 : -260);
        circle(x, 480, 26, P_COL[i]);
        text(pName(i), x, 540, 30, DIM, 'center', 700);
        text(String(match.scores[i]), x, 610, 72, INK, 'center', 800);
      });
    } else {
      text(match.newBest ? 'New best score!' : 'Game over', W / 2, 360, 64, match.newBest ? ACC : INK, 'center', 800);
      text(String(match.scores[0]), W / 2, 500, 120, INK, 'center', 800);
      text('Best ' + b, W / 2, 600, 32, DIM, 'center', 700);
    }
    text('OK play again   ·   BACK games menu', W / 2, 730, 30, INK, 'center', 700);
  }
  function hud(score, extra) {
    rr(60, 50, 360, 90, 22); ctx.fillStyle = 'rgba(15,18,23,0.55)'; ctx.fill();
    var who = match && match.two ? match.turn : -1;
    if (who >= 0) circle(110, 95, 18, P_COL[who]);
    text(String(score), who >= 0 ? 145 : 95, 95, 48, '#FFFFFF', 'left', 800);
    text(extra, W - 80, 95, 28, 'rgba(255,255,255,0.85)', 'right', 700);
  }

  // ---------- sprites ----------
  function drawRunner(x, groundY, s, phase, duck) {
    // a round little fennec fox: body, ears, tail, legs
    ctx.save(); ctx.translate(x, groundY); ctx.scale(s, s);
    var body = '#E9792E', belly = '#FFE3C2';
    if (duck) {
      rr(-10, -60, 130, 56, 28); ctx.fillStyle = body; ctx.fill();
      circle(100, -40, 24, body); circle(106, -44, 6, '#1B1B1B');
      ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(84, -58); ctx.lineTo(70, -86); ctx.lineTo(96, -62); ctx.fill();
    } else {
      // tail
      ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-6, -70); ctx.quadraticCurveTo(-60, -90, -48, -40); ctx.quadraticCurveTo(-30, -56, -4, -52); ctx.fill();
      circle(-50, -46, 9, '#FFF4E6');
      rr(-10, -110, 90, 80, 36); ctx.fillStyle = body; ctx.fill();
      rr(18, -88, 50, 52, 24); ctx.fillStyle = belly; ctx.fill();
      // head + ears
      circle(64, -122, 34, body);
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.moveTo(42, -146); ctx.lineTo(34, -196); ctx.lineTo(66, -152); ctx.fill();
      ctx.beginPath(); ctx.moveTo(70, -150); ctx.lineTo(84, -198); ctx.lineTo(92, -140); ctx.fill();
      ctx.fillStyle = '#FFB6A0';
      ctx.beginPath(); ctx.moveTo(46, -152); ctx.lineTo(41, -184); ctx.lineTo(60, -154); ctx.fill();
      circle(96, -116, 7, '#1B1B1B');
      circle(76, -124, 6, '#1B1B1B'); circle(78, -126, 2, '#FFFFFF');
    }
    // legs
    var a = Math.sin(phase * Math.PI * 2) * 14;
    ctx.fillStyle = '#B85A1E';
    if (!duck) { rr(8 + a, -36, 16, 36, 8); ctx.fill(); rr(46 - a, -36, 16, 36, 8); ctx.fill(); }
    else { rr(10 + a, -10, 16, 12, 6); ctx.fill(); rr(70 - a, -10, 16, 12, 6); ctx.fill(); }
    ctx.restore();
  }
  function drawCactus(x, groundY, n, s) {
    ctx.save(); ctx.translate(x, groundY); ctx.scale(s, s); ctx.fillStyle = '#3E8E57';
    for (var i = 0; i < n; i++) {
      var ox = i * 56;
      rr(ox + 16, -120, 30, 120, 15); ctx.fill();
      rr(ox - 4, -86, 16, 44, 8); ctx.fill(); rr(ox - 4, -52, 28, 14, 7); ctx.fill();
      rr(ox + 50, -100, 16, 46, 8); ctx.fill(); rr(ox + 38, -66, 28, 14, 7); ctx.fill();
    }
    ctx.restore();
  }
  function drawBird(x, y, s, phase) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = '#4B4F63';
    rr(-40, -16, 80, 32, 16); ctx.fill();
    circle(40, -8, 16, '#4B4F63');
    ctx.fillStyle = '#F2B36B'; ctx.beginPath(); ctx.moveTo(54, -10); ctx.lineTo(76, -4); ctx.lineTo(54, 2); ctx.fill();
    circle(44, -12, 4, '#FFFFFF');
    var f = Math.sin(phase * Math.PI * 2) > 0;
    ctx.fillStyle = '#5D6279'; ctx.beginPath();
    if (f) { ctx.moveTo(-14, -10); ctx.lineTo(10, -60); ctx.lineTo(20, -10); } else { ctx.moveTo(-14, 6); ctx.lineTo(10, 50); ctx.lineTo(20, 6); }
    ctx.fill();
    ctx.restore();
  }
  function drawCar(cx, cy, s, color, down) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(s, down ? -s : s);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; rr(-62, -100, 124, 210, 30); ctx.fill();
    ctx.fillStyle = '#15171C'; rr(-66, -70, 18, 44, 6); ctx.fill(); rr(48, -70, 18, 44, 6); ctx.fill(); rr(-66, 36, 18, 44, 6); ctx.fill(); rr(48, 36, 18, 44, 6); ctx.fill();
    ctx.fillStyle = color; rr(-54, -104, 108, 208, 34); ctx.fill();
    ctx.fillStyle = 'rgba(20,26,36,0.85)'; rr(-40, -56, 80, 46, 14); ctx.fill(); rr(-38, 30, 76, 34, 12); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; rr(-8, -100, 16, 200, 8); ctx.fill();
    ctx.fillStyle = '#FFF6C8'; circle(-34, -96, 8, '#FFF6C8'); circle(34, -96, 8, '#FFF6C8');
    ctx.restore();
  }
  function drawStar(x, y, r) {
    ctx.save(); ctx.translate(x, y); ctx.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
    ctx.closePath(); ctx.fillStyle = '#FFD45E'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#E09A1F'; ctx.stroke();
    ctx.restore();
  }

  // ---------- Desert Dash ----------
  function Dash() {
    var GY = 860, X = 300;
    var o = { score: 0, over: false, dist: 0, speed: 720, y: 0, vy: 0, duckUntil: 0, t: 0, obs: [], next: 1.2, dunes: 0, deadT: 0 };
    o.key = function (c) {
      if (o.dead) return;
      if ((c === K.ENTER || c === K.UP) && o.y === 0) { o.vy = -1650; }
      if (c === K.DOWN) { o.duckUntil = o.t + 0.5; if (o.y < 0) o.vy = Math.max(o.vy, 1400); }
    };
    o.keyUp = function (c) { if (c === K.DOWN) o.duckUntil = 0; };
    o.update = function (dt) {
      o.t += dt;
      if (o.dead) { o.deadT += dt; if (o.deadT > 1.1) o.over = true; return; }
      o.speed = Math.min(1600, 720 + o.t * 14);
      o.dist += o.speed * dt; o.score = Math.floor(o.dist / 40); o.dunes += o.speed * dt;
      o.vy += 4600 * dt; o.y = Math.min(0, o.y + o.vy * dt); if (o.y === 0) o.vy = 0;
      o.next -= dt;
      if (o.next <= 0) {
        var bird = o.t > 12 && Math.random() < 0.3;
        if (bird) {
          var high = Math.random() < 0.5;   // high: duck under (or run past ducking); low: jump
          o.obs.push({ type: 'bird', x: W + 60, y: high ? GY - 150 : GY - 60, ph: 0 });
        } else {
          var n = Math.random() < (o.t > 20 ? 0.45 : 0.25) ? 2 : 1, s = rand(0.85, 1.1);
          o.obs.push({ type: 'cactus', x: W + 60, n: n, s: s });
        }
        o.next = rand(0.85, 1.6) * (900 / o.speed) + 0.35;
      }
      var duck = o.y === 0 && o.t < o.duckUntil;
      var me = duck ? { x: X - 6, y: GY - 58, w: 110, h: 54 } : { x: X, y: GY + o.y - 150, w: 80, h: 146 };
      o.obs.forEach(function (b) {
        b.x -= o.speed * dt * (b.type === 'bird' ? 1.12 : 1);
        if (b.type === 'bird') b.ph += dt * 3;
        var box = b.type === 'bird' ? { x: b.x - 36, y: b.y - 14, w: 100, h: 28 } : { x: b.x + 2 * b.s, y: GY - 112 * b.s, w: (56 * (b.n - 1) + 60) * b.s, h: 112 * b.s };
        if (hit(me, box)) o.dead = true;
      });
      o.obs = o.obs.filter(function (b) { return b.x > -300; });
    };
    o.draw = function () {
      var night = (Math.floor(o.score / 700) % 2) === 1;
      var g = ctx.createLinearGradient(0, 0, 0, GY);
      if (night) { g.addColorStop(0, '#141A33'); g.addColorStop(1, '#3B3A63'); } else { g.addColorStop(0, '#F3A65A'); g.addColorStop(1, '#F9DDB0'); }
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, GY);
      circle(1500, 230, 90, night ? '#ECEBF5' : '#FFF4DC');
      if (night) for (var i = 0; i < 40; i++) circle((i * 397) % W, (i * 131) % 520, 2.5, 'rgba(255,255,255,0.7)');
      // dunes (two parallax layers)
      [[0.15, night ? '#2C2B4D' : '#EBB277', 640, 120], [0.4, night ? '#3A3660' : '#DDA066', 740, 90]].forEach(function (L) {
        var off = (o.dunes * L[0]) % 800;
        ctx.fillStyle = L[1]; ctx.beginPath(); ctx.moveTo(-off, GY);
        for (var x = -off; x < W + 800; x += 800) { ctx.quadraticCurveTo(x + 200, L[2] - L[3], x + 400, L[2]); ctx.quadraticCurveTo(x + 600, L[2] + L[3] * 0.4, x + 800, L[2]); }
        ctx.lineTo(W, GY); ctx.fill();
      });
      ctx.fillStyle = night ? '#2A2846' : '#C98A4E'; ctx.fillRect(0, GY, W, H - GY);
      ctx.fillStyle = night ? '#3B3863' : '#B97A40';
      var go = o.dunes % 140;
      for (var k = 0; k < 16; k++) ctx.fillRect(k * 140 - go, GY + 40 + (k % 3) * 40, 46, 8);
      o.obs.forEach(function (b) { if (b.type === 'bird') drawBird(b.x, b.y, 1, b.ph); else drawCactus(b.x, GY, b.n, b.s); });
      var duck = o.y === 0 && o.t < o.duckUntil && !o.dead;
      ctx.save(); if (o.dead) { ctx.globalAlpha = (Math.floor(o.deadT * 8) % 2) ? 0.35 : 1; }
      drawRunner(X, GY + o.y, 1, o.y === 0 && !o.dead ? (o.dist / 160) % 1 : 0.25, duck);
      ctx.restore();
      hud(o.score, 'OK jump  ·  ▼ duck');
      if (o.t < 3) text('Press OK to jump over the cactus', W / 2, 420, 40, 'rgba(30,20,10,0.75)', 'center', 800);
    };
    return o;
  }

  // ---------- Turbo Lanes ----------
  function Race() {
    var RX = 560, RW = 800, LW = RW / 3, PY = 880;
    function laneX(l) { return RX + LW * l + LW / 2; }
    var o = { score: 0, over: false, lane: 1, px: laneX(1), t: 0, speed: 700, road: 0, cars: [], stars: [], bonus: 0, next: 0.8, nextStar: 2, dead: false, deadT: 0, dist: 0, pop: [] };
    var COLS = ['#E4574C', '#8E7CF0', '#3FB47C', '#F0F0F0', '#4F8EF7', '#F28AB2'];
    o.key = function (c) {
      if (o.dead) return;
      if (c === K.LEFT) o.lane = Math.max(0, o.lane - 1);
      if (c === K.RIGHT) o.lane = Math.min(2, o.lane + 1);
    };
    o.update = function (dt) {
      o.t += dt;
      if (o.dead) { o.deadT += dt; if (o.deadT > 1.1) o.over = true; return; }
      o.speed = Math.min(1700, 700 + o.t * 18);
      o.road += o.speed * dt; o.dist += o.speed * dt;
      o.score = Math.floor(o.dist / 50) + o.bonus;
      o.px += (laneX(o.lane) - o.px) * Math.min(1, dt * 14);
      o.next -= dt;
      if (o.next <= 0) {
        // never block all three lanes: pick one or two lanes, leaving a gap
        var lanes = [0, 1, 2].sort(function () { return Math.random() - 0.5; });
        var cnt = o.t > 15 && Math.random() < 0.35 ? 2 : 1;
        for (var i = 0; i < cnt; i++) o.cars.push({ lane: lanes[i], y: -160, v: rand(0.35, 0.55), c: COLS[Math.floor(Math.random() * COLS.length)] });
        o.next = rand(0.7, 1.2) * (900 / o.speed) + 0.25;
      }
      o.nextStar -= dt;
      if (o.nextStar <= 0) { o.stars.push({ lane: Math.floor(Math.random() * 3), y: -60 }); o.nextStar = rand(1.5, 3); }
      var me = { x: o.px - 46, y: PY - 92, w: 92, h: 184 };
      o.cars.forEach(function (c) {
        c.y += o.speed * (1 - c.v) * dt;
        if (hit(me, { x: laneX(c.lane) - 46, y: c.y - 92, w: 92, h: 184 })) o.dead = true;
      });
      o.stars.forEach(function (s) {
        s.y += o.speed * dt;
        if (!s.got && hit(me, { x: laneX(s.lane) - 26, y: s.y - 26, w: 52, h: 52 })) { s.got = true; o.bonus += 50; o.pop.push({ x: laneX(s.lane), y: s.y, t: 0 }); }
      });
      o.pop.forEach(function (p) { p.t += dt; });
      o.cars = o.cars.filter(function (c) { return c.y < H + 200; });
      o.stars = o.stars.filter(function (s) { return s.y < H + 100 && !s.got; });
      o.pop = o.pop.filter(function (p) { return p.t < 0.8; });
    };
    o.draw = function () {
      ctx.fillStyle = '#2F7A4B'; ctx.fillRect(0, 0, W, H);
      // roadside trees scrolling
      var to = o.road % 270;
      for (var i = -1; i < 6; i++) {
        var y = i * 270 + to;
        circle(RX - 170, y, 54, '#286B41'); circle(RX - 150, y - 20, 40, '#3A9258');
        circle(RX + RW + 160, y + 130, 54, '#286B41'); circle(RX + RW + 140, y + 110, 40, '#3A9258');
      }
      ctx.fillStyle = '#E8E3D6'; ctx.fillRect(RX - 24, 0, 24, H); ctx.fillRect(RX + RW, 0, 24, H);
      ctx.fillStyle = '#E4574C';
      var ko = o.road % 80;
      for (var j = -1; j < 15; j++) { ctx.fillRect(RX - 24, j * 80 + ko, 24, 40); ctx.fillRect(RX + RW, j * 80 + ko, 24, 40); }
      ctx.fillStyle = '#3B414C'; ctx.fillRect(RX, 0, RW, H);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      var dofs = o.road % 140;
      for (var d = -1; d < 9; d++) { ctx.fillRect(RX + LW - 5, d * 140 + dofs, 10, 70); ctx.fillRect(RX + 2 * LW - 5, d * 140 + dofs, 10, 70); }
      o.stars.forEach(function (s) { drawStar(laneX(s.lane), s.y, 30); });
      o.cars.forEach(function (c) { drawCar(laneX(c.lane), c.y, 0.85, c.c, true); });
      ctx.save(); if (o.dead) ctx.globalAlpha = (Math.floor(o.deadT * 8) % 2) ? 0.35 : 1;
      drawCar(o.px, PY, 0.85, match && match.two ? P_COL[match.turn] : P_COL[0]);
      ctx.restore();
      o.pop.forEach(function (p) { text('+50', p.x, p.y - p.t * 120, 44, '#FFD45E', 'center', 800); });
      hud(o.score, '◀ ▶ change lane  ·  ★ +50');
      if (o.t < 3) text('Use ◀ ▶ to dodge the traffic', W / 2, 420, 40, '#FFFFFF', 'center', 800);
    };
    return o;
  }

  // ---------- Four in a Row ----------
  function Four(vsSam) {
    var COLS = 7, ROWS = 6, CS = 118, BX = (W - COLS * CS) / 2, BY = 250;
    var o = { id: 'four', board: [], col: 3, turn: 0, drop: null, done: false, win: null, vs: vsSam, think: 0, wins: [0, 0] };
    for (var r = 0; r < ROWS; r++) { o.board.push([]); for (var c = 0; c < COLS; c++) o.board[r].push(-1); }
    function openRow(b, c) { for (var r = ROWS - 1; r >= 0; r--) if (b[r][c] < 0) return r; return -1; }
    function lineAt(b, r, c) {
      var p = b[r][c]; if (p < 0) return null;
      var dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
      for (var i = 0; i < 4; i++) {
        var cells = [[r, c]], dr = dirs[i][0], dc = dirs[i][1], k;
        for (k = 1; k < 4; k++) { var rr2 = r + dr * k, cc = c + dc * k; if (rr2 < 0 || rr2 >= ROWS || cc < 0 || cc >= COLS || b[rr2][cc] !== p) break; cells.push([rr2, cc]); }
        for (k = 1; k < 4; k++) { var r3 = r - dr * k, c3 = c - dc * k; if (r3 < 0 || r3 >= ROWS || c3 < 0 || c3 >= COLS || b[r3][c3] !== p) break; cells.push([r3, c3]); }
        if (cells.length >= 4) return cells;
      }
      return null;
    }
    function wouldWin(b, c, p) { var r = openRow(b, c); if (r < 0) return false; b[r][c] = p; var w = !!lineAt(b, r, c); b[r][c] = -1; return w; }
    function samMove() {
      var b = o.board, ok = [], c;
      for (c = 0; c < COLS; c++) if (openRow(b, c) >= 0) ok.push(c);
      for (c = 0; c < ok.length; c++) if (wouldWin(b, ok[c], 1)) return ok[c];
      for (c = 0; c < ok.length; c++) if (wouldWin(b, ok[c], 0)) return ok[c];
      // avoid moves that hand the player a win directly above
      var safe = ok.filter(function (col) {
        var r = openRow(b, col); b[r][col] = 1; var bad = r > 0 && wouldWin(b, col, 0); b[r][col] = -1; return !bad;
      });
      var pool = safe.length ? safe : ok;
      pool.sort(function (a, z) { return Math.abs(a - 3) - Math.abs(z - 3) + (Math.random() - 0.5) * 1.6; });
      return pool[0];
    }
    function play(c) {
      var r = openRow(o.board, c); if (r < 0 || o.drop || o.done) return;
      o.drop = { c: c, r: r, y: BY - CS, p: o.turn, v: 0 };
    }
    function land() {
      var d = o.drop; o.board[d.r][d.c] = d.p; o.drop = null;
      var w = lineAt(o.board, d.r, d.c);
      if (w) { o.done = true; o.win = { p: d.p, cells: w }; return; }
      var full = o.board[0].every(function (x) { return x >= 0; });
      if (full) { o.done = true; o.win = { p: -1, cells: [] }; return; }
      o.turn = 1 - o.turn;
      if (o.vs && o.turn === 1) o.think = 0.7;
    }
    o.key = function (c) {
      if (o.done) { if (c === K.ENTER) { var n = Four(o.vs); n.wins = o.wins; game = n; } return; }
      if (o.drop || (o.vs && o.turn === 1)) return;
      if (c === K.LEFT) o.col = (o.col + COLS - 1) % COLS;
      if (c === K.RIGHT) o.col = (o.col + 1) % COLS;
      if (c === K.ENTER || c === K.DOWN) play(o.col);
    };
    o.update = function (dt) {
      if (o.think > 0) { o.think -= dt; if (o.think <= 0) { var m = samMove(); o.col = m; play(m); } }
      if (o.drop) {
        var d = o.drop, target = BY + d.r * CS + CS / 2;
        d.v += 5200 * dt; d.y += d.v * dt;
        if (d.y >= target) { d.y = target; land(); if (o.done && o.win.p >= 0) o.wins[o.win.p]++; }
      }
    };
    function who(p) { return o.vs ? (p === 0 ? 'You' : 'Sam') : pName(p); }
    function col(p) { return o.vs && p === 1 ? '#E4574C' : P_COL[p]; }
    o.draw = function () {
      drawBackdrop();
      // header: whose turn + running wins
      var title = o.done ? (o.win.p < 0 ? 'Board full: it’s a draw' : (o.vs && o.win.p === 0 ? 'You win!' : who(o.win.p) + (o.vs ? ' wins this one' : ' wins!'))) : (o.vs && o.turn === 1 ? 'Sam is thinking…' : who(o.turn) + (o.vs ? 'r turn' : '’s turn'));
      if (!o.done && o.vs && o.turn === 0) title = 'Your turn';
      text(title, W / 2, 110, 54, o.done ? (o.win.p < 0 ? INK : col(o.win.p)) : col(o.turn), 'center', 800);
      [0, 1].forEach(function (p) {
        var x = p ? W - 260 : 260;
        circle(x, 520, 40, col(p));
        text(who(p), x, 600, 32, DIM, 'center', 700);
        text(String(o.wins[p]), x, 680, 64, INK, 'center', 800);
      });
      // hover disc
      if (!o.done && !o.drop && !(o.vs && o.turn === 1)) circle(BX + o.col * CS + CS / 2, BY - CS / 2 - 10, 46, col(o.turn));
      if (o.drop) circle(BX + o.drop.c * CS + CS / 2, o.drop.y, 46, col(o.drop.p));
      // board with holes
      ctx.save();
      rr(BX - 24, BY - 14, COLS * CS + 48, ROWS * CS + 38, 30); ctx.fillStyle = '#1D3F8F'; ctx.fill();
      for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
        var v = o.board[r][c], x = BX + c * CS + CS / 2, y = BY + r * CS + CS / 2;
        circle(x, y, 47, v < 0 ? '#0D1118' : col(v));
        if (v >= 0) { ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.arc(x, y, 34, 0, Math.PI * 2); ctx.stroke(); }
      }
      if (o.done && o.win.cells.length) o.win.cells.forEach(function (rc) {
        ctx.lineWidth = 8; ctx.strokeStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(BX + rc[1] * CS + CS / 2, BY + rc[0] * CS + CS / 2, 50, 0, Math.PI * 2); ctx.stroke();
      });
      ctx.restore();
      text(o.done ? 'OK play again   ·   BACK games menu' : '◀ ▶ choose a column   ·   OK drop   ·   BACK pause', W / 2, 1035, 26, DIM, 'center', 600);
    };
    return o;
  }

  api.open = open;
  api.close = close;
  api.key = key;
  api.keyUp = keyUp;
  return api;
})();
