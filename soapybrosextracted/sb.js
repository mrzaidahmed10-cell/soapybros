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
