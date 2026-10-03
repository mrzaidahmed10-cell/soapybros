/* Soapy Bros — motion layer: scroll progress, hero squeegee intro, wipe-it-clean panel,
   process timeline, review carousel. Everything degrades to a static, readable page. */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var raf = window.requestAnimationFrame.bind(window);

  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---------- Scroll progress bar ---------- */
  var bar = qs('.progress-bar');
  if (bar) {
    var tick = false;
    var upd = function () {
      var d = document.documentElement, max = d.scrollHeight - d.clientHeight;
      bar.style.setProperty('--sp', max > 0 ? Math.min(1, d.scrollTop / max).toFixed(4) : 0);
      tick = false;
    };
    window.addEventListener('scroll', function () { if (!tick) { tick = true; raf(upd); } }, { passive: true });
    upd();
  }

  /* ---------- Grime: painted onto a canvas, then wiped away with destination-out ---------- */
  function sizeCanvas(canvas, maxDpr) {
    var p = canvas.parentElement, w = p.clientWidth, h = p.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, maxDpr || 1.5);
    canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
    var ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h, dpr: dpr };
  }

  function paintGrime(canvas, strength, seed) {
    var c = sizeCanvas(canvas), ctx = c.ctx, w = c.w, h = c.h, rand = rng(seed), area = w * h, i;
    // road film: a muted, slightly warm grey so it reads as dirt against the navy paint
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, 'rgba(58,55,50,' + strength + ')');
    g.addColorStop(.5, 'rgba(68,63,56,' + strength + ')');
    g.addColorStop(1, 'rgba(50,48,44,' + (strength + .02) + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // mottling
    var blots = Math.min(900, Math.round(area / 1100));
    for (i = 0; i < blots; i++) {
      var x = rand() * w, y = rand() * h, r = 8 + rand() * 62, dark = rand() < .55;
      var a = dark ? .05 + rand() * .1 : .04 + rand() * .07;
      var rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, dark ? 'rgba(16,14,12,' + a + ')' : 'rgba(158,142,120,' + a + ')');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // spray streaks kicked up from the road
    var streaks = Math.round(60 + w / 5);
    ctx.lineCap = 'round';
    for (i = 0; i < streaks; i++) {
      var sx = rand() * w, sy = h * (.35 + rand() * .65), len = 24 + rand() * 150, ang = (rand() - .5) * .35;
      ctx.strokeStyle = 'rgba(14,12,10,' + (.07 + rand() * .12) + ')'; ctx.lineWidth = .6 + rand() * 2.2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.sin(ang) * len, sy - Math.cos(ang) * len); ctx.stroke();
    }
    // dried water-spot rings
    var rings = Math.min(140, Math.round(area / 7000));
    for (i = 0; i < rings; i++) {
      var rx = rand() * w, ry = rand() * h, rr = 3 + rand() * 12;
      ctx.strokeStyle = 'rgba(214,202,180,' + (.1 + rand() * .16) + ')'; ctx.lineWidth = 1 + rand();
      ctx.beginPath(); ctx.arc(rx, ry, rr, 0, 6.2832); ctx.stroke();
      ctx.fillStyle = 'rgba(214,202,180,.05)'; ctx.fill();
    }
    // fine dust
    var specks = Math.min(7000, Math.round(area / 85));
    for (i = 0; i < specks; i++) {
      ctx.fillStyle = rand() < .5 ? 'rgba(206,194,170,' + (.08 + rand() * .22) + ')' : 'rgba(12,10,8,' + (.12 + rand() * .25) + ')';
      var sz = rand() < .85 ? 1 : 2; ctx.fillRect(rand() * w, rand() * h, sz, sz);
    }
    return c;
  }

  function makeBrush(r) {
    var b = document.createElement('canvas'); b.width = b.height = Math.ceil(r * 2);
    var x = b.getContext('2d'), g = x.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.62, 'rgba(0,0,0,.96)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, r * 2, r * 2);
    return b;
  }
  function eraseLine(ctx, brush, r, x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0, dist = Math.sqrt(dx * dx + dy * dy), step = Math.max(2, r * .3), n = Math.max(1, Math.ceil(dist / step));
    ctx.globalCompositeOperation = 'destination-out';
    for (var i = 0; i <= n; i++) {
      var k = i / n; ctx.drawImage(brush, x0 + dx * k - r, y0 + dy * k - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- Foam: short-lived soap bubbles along the wipe ---------- */
  function Foam(canvas) {
    var self = this, bubbles = [], running = false, last = 0, c = sizeCanvas(canvas, 1.5), extra = null;
    self.resize = function () { c = sizeCanvas(canvas, 1.5); };
    self.add = function (x, y, r) { bubbles.push({ x: x, y: y, r: r, life: 1, vy: -(6 + Math.random() * 14), vx: (Math.random() - .5) * 10 }); start(); };
    self.setExtra = function (fn) { extra = fn; start(); };
    function start() { if (!running) { running = true; last = performance.now(); raf(loop); } }
    function loop(now) {
      var dt = Math.min(.05, (now - last) / 1000); last = now;
      var ctx = c.ctx; ctx.clearRect(0, 0, c.w, c.h);
      if (extra) extra(ctx, c, dt);
      for (var i = bubbles.length - 1; i >= 0; i--) {
        var b = bubbles[i]; b.life -= dt / 1.15; if (b.life <= 0) { bubbles.splice(i, 1); continue; }
        b.x += b.vx * dt; b.y += b.vy * dt;
        var a = Math.min(1, b.life * 1.6);
        ctx.fillStyle = 'rgba(210,236,255,' + (.1 * a) + ')'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.2832); ctx.fill();
        ctx.lineWidth = Math.max(.7, b.r * .06); ctx.strokeStyle = 'rgba(225,244,255,' + (.65 * a) + ')'; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,' + (.9 * a) + ')'; ctx.beginPath(); ctx.arc(b.x - b.r * .35, b.y - b.r * .38, Math.max(.7, b.r * .2), 0, 6.2832); ctx.fill();
      }
      if (bubbles.length || extra) raf(loop); else { running = false; ctx.clearRect(0, 0, c.w, c.h); }
    }
  }

  /* ---------- Hero: a squeegee pass reveals the clean, beaded paint ---------- */
  (function hero() {
    var g = qs('.hero-grime'), f = qs('.hero-foam');
    if (!g || !f) return;
    if (reduce) { g.style.display = 'none'; f.style.display = 'none'; return; }
    var c = paintGrime(g, .9, 77), foam = new Foam(f), ctx = c.ctx, w = c.w, h = c.h;
    var tilt = Math.min(h * .22, 220), dur = 2200, delay = 500, t0 = null, prev = -tilt - 6, rand = Math.random;
    function ease(k) { return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
    var bladeX = prev, active = true;
    foam.setExtra(function (cx) {
      if (!active) return;
      var x = bladeX;
      var wet = cx.createLinearGradient(x - 70, 0, x, 0);
      wet.addColorStop(0, 'rgba(170,225,255,0)'); wet.addColorStop(1, 'rgba(170,225,255,.16)');
      cx.fillStyle = wet; cx.beginPath(); cx.moveTo(x - 70, 0); cx.lineTo(x, 0); cx.lineTo(x - tilt, h); cx.lineTo(x - 70 - tilt, h); cx.closePath(); cx.fill();
      cx.save(); cx.shadowColor = 'rgba(150,220,255,.9)'; cx.shadowBlur = 18; cx.strokeStyle = 'rgba(235,248,255,.95)'; cx.lineWidth = 2;
      cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x - tilt, h); cx.stroke(); cx.restore();
    });
    function frame(t) {
      if (t0 === null) t0 = t + delay;
      var k = Math.max(0, Math.min(1, (t - t0) / dur)), x = -tilt - 6 + ease(k) * (w + tilt + 12);
      if (x > prev) {
        ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.moveTo(prev - 2, 0); ctx.lineTo(x, 0); ctx.lineTo(x - tilt, h); ctx.lineTo(prev - tilt - 2, h); ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        if (k > 0 && k < 1) for (var i = 0; i < 2; i++) { var by = rand() * h; foam.add(x - tilt * (by / h) - rand() * 26, by, 2 + rand() * 6); }
        prev = x; bladeX = x;
      }
      if (k < 1) raf(frame); else { active = false; foam.setExtra(null); g.classList.add('done'); setTimeout(function () { g.style.display = 'none'; }, 700); }
    }
    raf(frame);
  })();

  /* ---------- Wipe it clean ---------- */
  qsa('[data-wash]').forEach(function (root) {
    var grime = qs('.wash-grime', root), foamC = qs('.wash-foam', root), pctEl = qs('[data-wash-pct]', root),
        done = qs('.wash-done', root), auto = qs('[data-wash-auto]', root);
    var st = { c: null, r: 44, brush: null, finished: false, pct: 0, last: null, measureAt: 0 };
    var foam, probe = document.createElement('canvas'), pctx = probe.getContext('2d');

    function setup() {
      if (st.finished || st.pct > 3) return;
      st.c = paintGrime(grime, .97, 31);
      st.r = Math.max(32, Math.min(58, st.c.w / 15)); st.brush = makeBrush(st.r);
      if (!foam) foam = new Foam(foamC); else foam.resize();
    }
    function measure() {
      var c = st.c, sw = 64, sh = Math.max(12, Math.round(64 * c.h / c.w));
      probe.width = sw; probe.height = sh; pctx.clearRect(0, 0, sw, sh); pctx.drawImage(grime, 0, 0, sw, sh);
      var d = pctx.getImageData(0, 0, sw, sh).data, clear = 0, n = sw * sh;
      for (var i = 3; i < d.length; i += 4) if (d[i] < 70) clear++;
      var frac = clear / n; st.pct = Math.min(100, Math.round(frac / .88 * 100));
      pctEl.textContent = st.pct;
      if (frac >= .88) finish();
    }
    function finish() {
      if (st.finished) return; st.finished = true; pctEl.textContent = '100';
      grime.classList.add('gone');
      if (!reduce) for (var i = 0; i < 26; i++) foam.add(Math.random() * st.c.w, st.c.h * (.3 + Math.random() * .7), 3 + Math.random() * 9);
      setTimeout(function () { done.hidden = false; }, reduce ? 0 : 450);
    }
    function wipeTo(x, y) {
      if (st.finished) return;
      var from = st.last || { x: x, y: y };
      eraseLine(st.c.ctx, st.brush, st.r, from.x, from.y, x, y);
      var dx = x - from.x, dy = y - from.y;
      if (!reduce && Math.random() < Math.min(1, Math.sqrt(dx * dx + dy * dy) / 26)) foam.add(x + (Math.random() - .5) * st.r * 1.4, y + (Math.random() - .5) * st.r * 1.4, 2 + Math.random() * 6);
      st.last = { x: x, y: y };
      var now = performance.now(); if (now - st.measureAt > 140) { st.measureAt = now; measure(); }
    }
    function pos(e) { var b = root.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; }

    var down = false;
    root.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button, a')) return;
      down = true; st.last = null; root.classList.add('touched');
      try { root.setPointerCapture(e.pointerId); } catch (_) {}
      var p = pos(e); wipeTo(p.x, p.y);
    });
    root.addEventListener('pointermove', function (e) { if (!down) return; var p = pos(e); wipeTo(p.x, p.y); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      root.addEventListener(ev, function () { down = false; st.last = null; measure(); });
    });

    // "Wash it for me": a serpentine pass across the panel
    auto.addEventListener('click', function () {
      if (st.finished) return;
      root.classList.add('touched');
      if (reduce) { st.c.ctx.clearRect(0, 0, st.c.w, st.c.h); finish(); return; }
      var c = st.c, rows = Math.max(3, Math.ceil(c.h / (st.r * 1.25))), total = 2600, t0 = null, prev = null;
      (function frame(t) {
        if (t0 === null) t0 = t;
        var k = Math.min(1, (t - t0) / total), pathPos = k * rows, row = Math.min(rows - 1, Math.floor(pathPos)), within = pathPos - row;
        var x = (row % 2 === 0 ? within : 1 - within) * c.w, y = (row + .5) * (c.h / rows);
        if (prev) {
          eraseLine(c.ctx, st.brush, st.r, prev.x, prev.y, x, y);
          if (Math.random() < .6) foam.add(x + (Math.random() - .5) * st.r, y + (Math.random() - .5) * st.r, 2 + Math.random() * 6);
        }
        prev = { x: x, y: y };
        var now = performance.now(); if (now - st.measureAt > 140) { st.measureAt = now; measure(); }
        if (k < 1 && !st.finished) raf(frame); else { c.ctx.clearRect(0, 0, c.w, c.h); finish(); }
      })(performance.now());
    });

    setup();
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(setup, 200); });
  });

  /* ---------- Process timeline ---------- */
  qsa('[data-timeline]').forEach(function (tl) {
    var steps = qsa('.tl-step', tl), times = [150, 1450, 2750];
    function play() {
      tl.classList.add('in');
      steps.forEach(function (s, i) { setTimeout(function () { s.classList.add('on'); }, reduce ? 0 : times[i] || 0); });
    }
    if (reduce || !('IntersectionObserver' in window)) { play(); return; }
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { play(); io.disconnect(); } }, { threshold: .4 });
    io.observe(tl);
  });

  /* ---------- Review carousel ---------- */
  qsa('[data-carousel]').forEach(function (root) {
    var slides = qsa('.rv-slide', root), dots = qsa('.rv-dot', root), i = 0, timer = null;
    function show(n) {
      i = (n + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle('is-active', k === i); s.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
      dots.forEach(function (d, k) { d.classList.toggle('is-active', k === i); });
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function begin() { if (reduce || timer) return; timer = setInterval(function () { show(i + 1); }, 7000); }
    qs('.rv-nav.prev', root).addEventListener('click', function () { stop(); show(i - 1); });
    qs('.rv-nav.next', root).addEventListener('click', function () { stop(); show(i + 1); });
    dots.forEach(function (d, k) { d.addEventListener('click', function () { stop(); show(k); }); });
    root.addEventListener('mouseenter', stop); root.addEventListener('focusin', stop);
    root.addEventListener('mouseleave', begin);
    show(0); begin();
  });
})();
