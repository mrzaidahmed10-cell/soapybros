/* Soapy Bros — page behavior: header state, water-bead artwork, before/after gallery */
(function () {
  'use strict';

  /* ---------- Header: solid background after scrolling ---------- */
  var header = document.querySelector('header');
  function onScroll() { if (header) header.classList.toggle('scrolled', window.scrollY > 24); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Water beads on paint (canvas artwork) ---------- */
  function rng(seed) { // small deterministic PRNG so the artwork is identical on every load
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function drawBeads(canvas) {
    var parent = canvas.parentElement;
    var w = parent.clientWidth, h = parent.clientHeight;
    if (!w || !h) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var rand = rng(parseInt(canvas.dataset.seed || '7', 10));
    var density = parseFloat(canvas.dataset.density || '1');
    var bias = canvas.dataset.bias || 'right';
    var area = w * h;
    var target = Math.round(Math.min(420, area / 3400) * density);
    var beads = [];

    function xPos() {
      var u = rand();
      if (bias === 'right') u = 0.42 + u * 0.58; // keep the left of the hero calm for the headline
      return u * w;
    }

    // large -> small so big drops claim space first
    var attempts = 0;
    while (beads.length < target && attempts < target * 40) {
      attempts++;
      var k = rand();
      var r = 2.2 + Math.pow(k, 3.1) * Math.min(34, h * 0.075);
      var x = xPos(), y = rand() * h;
      var ok = true;
      for (var i = 0; i < beads.length; i++) {
        var b = beads[i], dx = b.x - x, dy = b.y - y, d = dx * dx + dy * dy, m = (b.r + r) * 0.82;
        if (d < m * m) { ok = false; break; }
      }
      if (ok) beads.push({ x: x, y: y, r: r });
    }
    beads.sort(function (a, b) { return a.y - b.y; });

    beads.forEach(function (b) {
      var x = b.x, y = b.y, r = b.r, g;

      // contact shadow
      g = ctx.createRadialGradient(x + r * .25, y + r * .45, r * .2, x + r * .25, y + r * .45, r * 1.25);
      g.addColorStop(0, 'rgba(0,6,12,.55)'); g.addColorStop(1, 'rgba(0,6,12,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + r * .25, y + r * .45, r * 1.25, 0, 6.2832); ctx.fill();

      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.clip();

      // body: dark refracted centre, bright rim
      g = ctx.createRadialGradient(x - r * .1, y - r * .15, r * .1, x, y, r);
      g.addColorStop(0, 'rgba(14,52,86,.55)');
      g.addColorStop(.62, 'rgba(8,34,60,.45)');
      g.addColorStop(.9, 'rgba(120,190,232,.34)');
      g.addColorStop(1, 'rgba(190,232,255,.55)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);

      // caustic: light focused through the drop onto the lower side
      g = ctx.createRadialGradient(x + r * .28, y + r * .38, 0, x + r * .28, y + r * .38, r * .72);
      g.addColorStop(0, 'rgba(160,226,255,.55)'); g.addColorStop(1, 'rgba(160,226,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.restore();

      // rim
      ctx.lineWidth = Math.max(.6, r * .035);
      ctx.strokeStyle = 'rgba(200,236,255,.4)';
      ctx.beginPath(); ctx.arc(x, y, r - ctx.lineWidth / 2, 0, 6.2832); ctx.stroke();

      // specular highlights
      if (r > 3) {
        ctx.save();
        ctx.translate(x - r * .36, y - r * .42); ctx.rotate(-.62);
        ctx.fillStyle = 'rgba(255,255,255,.88)';
        ctx.beginPath(); ctx.ellipse(0, 0, r * .24, r * .12, 0, 0, 6.2832); ctx.fill();
        ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.beginPath(); ctx.arc(x + r * .42, y + r * .46, Math.max(.8, r * .07), 0, 6.2832); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        ctx.beginPath(); ctx.arc(x - r * .3, y - r * .3, Math.max(.6, r * .22), 0, 6.2832); ctx.fill();
      }
    });
  }

  var canvases = Array.prototype.slice.call(document.querySelectorAll('canvas.beads'));
  function renderAll() { canvases.forEach(drawBeads); }
  var rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(renderAll, 160); });
  renderAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(renderAll);

  /* ---------- Before / after gallery ----------
     Each <figure class="ba"> points at two image files. A pair only appears when both
     files exist, and the whole gallery section stays hidden until at least one pair does. */
  var gallery = document.querySelector('[data-gallery]');
  if (gallery) {
    var figs = Array.prototype.slice.call(gallery.querySelectorAll('figure.ba'));
    var shown = 0, pending = figs.length;

    function load(src) {
      return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(src); }; im.onerror = rej; im.src = src; });
    }
    function build(fig) {
      var before = fig.dataset.before, after = fig.dataset.after, cap = fig.dataset.caption || '';
      fig.innerHTML =
        '<div class="ba-stage">' +
          '<img class="ba-after" src="' + after + '" alt="' + (cap ? cap + ' — after' : 'After detail') + '" loading="lazy" draggable="false">' +
          '<img class="ba-before" src="' + before + '" alt="' + (cap ? cap + ' — before' : 'Before detail') + '" loading="lazy" draggable="false">' +
          '<span class="ba-line"></span>' +
          '<span class="ba-knob"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/></svg></span>' +
          '<span class="ba-tag b">Before</span><span class="ba-tag a">After</span>' +
          '<input class="ba-range" type="range" min="0" max="100" value="50" aria-label="Drag to compare before and after">' +
        '</div>' + (cap ? '<figcaption>' + cap + '</figcaption>' : '');
      var stage = fig.querySelector('.ba-stage'), range = fig.querySelector('.ba-range');
      range.addEventListener('input', function () { stage.style.setProperty('--pos', range.value + '%'); });
    }
    figs.forEach(function (fig) {
      Promise.all([load(fig.dataset.before), load(fig.dataset.after)])
        .then(function () { build(fig); fig.hidden = false; shown++; })
        .catch(function () { /* missing pair: stays hidden */ })
        .then(function () { if (--pending === 0 && shown > 0) gallery.hidden = false; });
    });
  }
})();

/* =====================================================================
   Round 2: soap-suds artwork, cursor light, estimator, tick + counter motion
   ===================================================================== */
(function () {
  'use strict';
  document.documentElement.classList.add('js');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Soap suds (generated artwork, replaces the old stock photo) ---------- */
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function drawSuds(canvas) {
    var p = canvas.parentElement, w = p.clientWidth, h = p.clientHeight;
    if (!w || !h) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    var rand = rng(parseInt(canvas.dataset.seed || '5', 10));
    var n = Math.round(Math.min(260, (w * h) / 520)), bubbles = [];
    for (var i = 0; i < n; i++) {
      var v = 1 - Math.pow(rand(), 2.1);                 // foam gathers toward the bottom
      var y = h * (0.12 + v * 0.95), x = rand() * w;
      var r = 3 + Math.pow(rand(), 2.4) * (10 + v * 30);
      bubbles.push({ x: x, y: y, r: r });
    }
    bubbles.sort(function (a, b) { return b.r - a.r; });  // big first, small on top
    bubbles.forEach(function (b) {
      var x = b.x, y = b.y, r = b.r, g;
      g = ctx.createRadialGradient(x - r * .2, y - r * .25, r * .05, x, y, r);
      g.addColorStop(0, 'rgba(180,225,255,.03)'); g.addColorStop(.7, 'rgba(120,190,235,.08)'); g.addColorStop(1, 'rgba(190,232,255,.3)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
      // thin-film iridescence on the rim
      var ig = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      ig.addColorStop(0, 'rgba(120,225,255,.55)'); ig.addColorStop(.5, 'rgba(170,150,255,.28)'); ig.addColorStop(1, 'rgba(255,170,215,.4)');
      ctx.lineWidth = Math.max(.7, r * .05); ctx.strokeStyle = ig;
      ctx.beginPath(); ctx.arc(x, y, r - ctx.lineWidth / 2, 0, 6.2832); ctx.stroke();
      if (r > 4) {
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.save(); ctx.translate(x - r * .38, y - r * .4); ctx.rotate(-.7);
        ctx.beginPath(); ctx.ellipse(0, 0, r * .2, r * .09, 0, 0, 6.2832); ctx.fill(); ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = Math.max(.6, r * .04);
        ctx.beginPath(); ctx.arc(x, y, r * .72, 1.1, 1.9); ctx.stroke();
      }
    });
  }
  var suds = Array.prototype.slice.call(document.querySelectorAll('canvas.suds'));
  function renderSuds() { suds.forEach(drawSuds); }
  var st; window.addEventListener('resize', function () { clearTimeout(st); st = setTimeout(renderSuds, 160); });
  renderSuds();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(renderSuds);

  /* ---------- Cursor light on the hero ---------- */
  var hero = document.querySelector('.hero');
  if (hero && !reduce && window.matchMedia('(pointer: fine)').matches) {
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      hero.style.setProperty('--lx', (e.clientX - r.left) + 'px');
      hero.style.setProperty('--ly', (e.clientY - r.top) + 'px');
      hero.classList.add('lit');
    });
    hero.addEventListener('pointerleave', function () { hero.classList.remove('lit'); });
  }

  /* ---------- Starting-price estimator in the hero ---------- */
  var prices = {
    Sedan: { 'Exterior only': 55, 'Interior only': 75, 'Interior & exterior': 100 },
    SUV: { 'Exterior only': 70, 'Interior only': 90, 'Interior & exterior': 125 },
    Minivan: { 'Exterior only': 70, 'Interior only': 120, 'Interior & exterior': 155 },
    Motorcycle: { 'Exterior only': 75, 'Interior only': 75 },
    Truck: { 'Exterior only': 95, 'Interior only': 115, 'Interior & exterior': 150 }
  };
  var vSel = document.getElementById('hqVehicle'), sSel = document.getElementById('hqService'),
      out = document.getElementById('hqPrice'), book = document.getElementById('hqBook');
  if (vSel && sSel && out && book) {
    var update = function () {
      var v = vSel.value;
      Array.prototype.forEach.call(sSel.options, function (o) {
        var ok = prices[v][o.value] !== undefined; o.disabled = !ok; o.hidden = !ok;
      });
      if (prices[v][sSel.value] === undefined) sSel.value = 'Exterior only';
      out.textContent = '$' + prices[v][sSel.value];
      book.href = 'book.html?vehicle=' + encodeURIComponent(v) + '&service=' + encodeURIComponent(sSel.value);
    };
    vSel.addEventListener('change', update); sSel.addEventListener('change', update); update();
  }

  /* ---------- Checklist ticks, one after another ---------- */
  var lists = document.querySelectorAll('.inc-list');
  if (lists.length) {
    if (reduce || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(document.querySelectorAll('.inc-list li'), function (li) { li.classList.add('ticked'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          Array.prototype.forEach.call(en.target.children, function (li, i) { setTimeout(function () { li.classList.add('ticked'); }, 140 + i * 170); });
          io.unobserve(en.target);
        });
      }, { threshold: 0.35 });
      Array.prototype.forEach.call(lists, function (l) { io.observe(l); });
    }
  }

  /* ---------- Count-up numbers ---------- */
  var counters = document.querySelectorAll('[data-count]');
  if (counters.length && !reduce && 'IntersectionObserver' in window) {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target, end = parseInt(el.dataset.count, 10), t0 = performance.now(), dur = 1100;
        (function step(now) {
          var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
          el.textContent = Math.round(end * e);
          if (k < 1) requestAnimationFrame(step);
        })(t0);
        co.unobserve(el);
      });
    }, { threshold: 0.6 });
    Array.prototype.forEach.call(counters, function (c) { c.textContent = '0'; co.observe(c); });
  }
})();
