/* Digerati Experts · preview B2 · one rAF loop, native scroll, no hijack */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  function easeIO(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  var TAU = Math.PI * 2, NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }

  /* scene progress: 0 when the section top meets the viewport top, 1 when its bottom meets the viewport bottom */
  function prog(sec) { var r = sec.getBoundingClientRect(), t = r.height - innerHeight; return t > 0 ? clamp(-r.top / t, 0, 1) : 0; }

  /* ---------- bookends: the same four rings, open at the top of the page, closed at the end ---------- */
  var HALO_R = [34, 52, 70, 88];
  function halo(svg, open) {
    var arcs = [];
    HALO_R.forEach(function (r, i) {
      el('circle', { r: r, class: 'h-track' }, svg);
      var C = TAU * r, a = el('circle', { r: r, class: 'h-arc', transform: 'rotate(' + (-90 + i * 24) + ')', 'stroke-dasharray': C.toFixed(2), 'stroke-dashoffset': C.toFixed(2), 'stroke-opacity': (1 - i * .18).toFixed(2) }, svg);
      arcs.push({ el: a, C: C, target: open ? (.62 - i * .12) : 1 });
    });
    return arcs;
  }
  var heroArcs = halo($('.halo--open'), true), closeArcs = halo($('.halo--closed'), false);
  function setArcs(arcs, f) { arcs.forEach(function (a, i) { var k = clamp(f * 1.25 - i * .08, 0, 1); a.el.setAttribute('stroke-dashoffset', (a.C * (1 - a.target * ease(k))).toFixed(2)); }); }
  // hero arcs draw once on load (time-based, like the underline)
  if (reduce) setArcs(heroArcs, 1); else { var t0 = performance.now(); requestAnimationFrame(function tick(t) { var f = clamp((t - t0 - 300) / 1600, 0, 1); setArcs(heroArcs, f); if (f < 1) requestAnimationFrame(tick); }); }

  /* ---------- nav ---------- */
  var nav = $('#nav');

  /* ---------- 2 · the usual way ---------- */
  var usual = $('#usual'), callcard = $('.callcard', usual), rows = $$('.callcard__list li', usual), calls = $('#calls'), meter = $('#usualMeter');
  var lastCalls = -1;

  /* ---------- 3 · coverage rings ---------- */
  var rings = $('#levels'), orbit = $('#orbit'), osvg = $('.orbit__svg', orbit), coreLvl = $('#coreLvl'), core = $('.core', orbit);
  var LEVELS = [
    { name: 'ProActive IT', items: ['Service Desk', 'Endpoint foundation', 'Identity guidance', 'Documented baseline'] },
    { name: 'ProActive Office', items: ['Managed network', 'Stronger identity', 'Email anti-phishing', 'Endpoint backup', 'Annual review'] },
    { name: 'ProActive Business', items: ['Threat detection', 'Awareness training', 'BCDR posture', 'Compliance reporting'] },
    { name: 'ProActive Enterprise', items: ['Unified posture', 'Advanced compliance', 'Custom BCDR', 'Quarterly reviews'] }
  ];
  var R = [34, 52, 70, 88];            // ring radii (viewBox units, -100..100)
  var CHIP_R = [64, 70, 80, 92];       // chips orbit just outside the newest ring
  var START = [.1, .3, .5, .7];        // where each level begins in the scene
  // designed angles (degrees, 0 = 3 o'clock): diagonals for 4, a bottom-weighted fan for 5. Nothing at 12 or 6 o'clock where the copy sits on phones.
  var ANG = { 4: [-40, 40, 140, 220], 5: [-28, 28, 90, 152, 208] };
  var tracks = R.map(function (r) { return el('circle', { r: r, class: 'o-track' }, osvg); });
  var ringEls = R.map(function (r) {
    var C = TAU * r, g = el('g', { transform: 'rotate(-90)' }, osvg);
    var glow = el('circle', { r: r, class: 'o-glow', 'stroke-dasharray': C.toFixed(2), 'stroke-dashoffset': C.toFixed(2) }, g);
    var ring = el('circle', { r: r, class: 'o-ring', 'stroke-dasharray': C.toFixed(2), 'stroke-dashoffset': C.toFixed(2) }, g);
    return { glow: glow, ring: ring, C: C, r: r };
  });
  var tickLayer = el('g', {}, osvg), dotLayer = el('g', {}, osvg);
  var heads = R.map(function () { return el('circle', { r: 1.6, class: 'o-head', opacity: 0 }, osvg); });
  var chips = [];
  LEVELS.forEach(function (lv, li) {
    var angs = ANG[lv.items.length];
    lv.items.forEach(function (label, j) {
      var c = document.createElement('span'); c.className = 'chip'; c.textContent = label; orbit.appendChild(c);
      chips.push({ el: c, li: li, j: j, a0: (angs[j] + (li % 2 ? 6 : -6)) * Math.PI / 180, w: 0, h: 0,
        dot: el('circle', { r: 1.25, class: 'o-dot', opacity: 0 }, dotLayer),
        tick: el('line', { class: 'o-tick', opacity: 0 }, tickLayer) });
    });
  });
  function measure() { chips.forEach(function (c) { c.w = c.el.offsetWidth; c.h = c.el.offsetHeight; }); }
  var lvlArts = $$('.lvl article', rings), railBtns = $$('#rail button');
  function goLevel(i) {
    var r = rings.getBoundingClientRect(), t = r.height - innerHeight;
    scrollTo({ top: scrollY + r.top + t * (START[i] + .14), behavior: reduce ? 'auto' : 'smooth' });
  }
  railBtns.forEach(function (b, i) {
    b.addEventListener('click', function () { goLevel(i); });
    b.addEventListener('keydown', function (e) {
      var k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!k) return; e.preventDefault(); var n = clamp(i + k, 0, 3); railBtns[n].focus(); goLevel(n);
    });
  });
  var lastCur = -1;

  /* ---------- 3b · whose business: words light up as they cross the middle ---------- */
  var whoLis = $$('#whoList li');

  /* ---------- 4 · price track fills as it passes ---------- */
  var track = $('#track'), trackLis = $$('#track li'), trackLine = $('.track__line', track);

  /* ---------- 5 · service desk / help desk: tabs, arrow keys, and a scroll flip ---------- */
  var ticket = $('#ticket'), seg = $('.seg', ticket), tabs = $$('[role=tab]', ticket), panes = $$('[role=tabpanel]', ticket);
  var deskManual = null, side = 0;
  function setSide(i, focus) {
    side = i; seg.style.setProperty('--side', i);
    tabs.forEach(function (b, k) { var on = k === i; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    panes.forEach(function (p, k) { var on = k === i; p.hidden = !on; p.classList.toggle('is-on', on); });
  }
  tabs.forEach(function (b, k) {
    b.addEventListener('click', function () { deskManual = k; setSide(k); });
    b.addEventListener('keydown', function (e) {
      var n = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'Home' ? -9 : e.key === 'End' ? 9 : 0;
      if (!n) return; e.preventDefault(); var t = clamp(k + n, 0, 1); deskManual = t; setSide(t, true);
    });
  });

  /* ---------- close: the sticky note comes back ---------- */
  var closeArt = $('#closeArt'), closeNote = $('.note--close'), closeSec = $('#fit-call');

  /* ---------- reveal once ---------- */
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -10% 0px' });
    $$('.rv').forEach(function (n) { io.observe(n); });
  } else $$('.rv').forEach(function (n) { n.classList.add('is-in'); });

  /* ---------- the loop ---------- */
  var sm = { usual: 0, rings: 0 }, K = reduce ? 1 : .14, lastRingsDrawn = -1, lastW = 0;
  function frame() {
    var vh = innerHeight, vw = innerWidth;
    nav.classList.toggle('is-pill', scrollY > 40);

    sm.usual += (prog(usual) - sm.usual) * K;
    sm.rings += (prog(rings) - sm.rings) * K;

    /* usual: each vendor gets a "?", then they all grey out, then one team */
    var pu = sm.usual, asked = 0;
    rows.forEach(function (li, i) { var on = pu > .1 + i * .085; li.classList.toggle('is-asked', on); if (on) asked++; });
    if (asked !== lastCalls) { calls.textContent = asked; lastCalls = asked; }
    callcard.classList.toggle('is-grey', pu > .6);
    var tail = clamp((pu - .68) / .12, 0, 1);
    usual.style.setProperty('--tail', tail.toFixed(3));
    callcard.style.setProperty('--one', clamp((pu - .74) / .12, 0, 1).toFixed(3));
    meter.style.setProperty('--m', clamp(pu / .86, 0, 1).toFixed(3));

    /* rings */
    var p = sm.rings;
    if (Math.abs(p - lastRingsDrawn) > .0004 || vw !== lastW) {
      lastRingsDrawn = p; lastW = vw;
      var cur = 0; for (var i = 0; i < 4; i++) if (p >= START[i] - .02) cur = i;
      ringEls.forEach(function (o, i) {
        var f = reduce ? (p >= START[i] - .02 ? 1 : 0) : easeIO(clamp((p - START[i]) / .085, 0, 1));
        var off = (o.C * (1 - f)).toFixed(2);
        o.ring.setAttribute('stroke-dashoffset', off); o.glow.setAttribute('stroke-dashoffset', off);
        o.ring.classList.toggle('is-past', i < cur);
        o.glow.style.opacity = i === cur ? '' : '0';
        var a = -Math.PI / 2 + f * TAU, h = heads[i];
        h.setAttribute('cx', (Math.cos(a) * o.r).toFixed(2)); h.setAttribute('cy', (Math.sin(a) * o.r).toFixed(2));
        h.setAttribute('opacity', f > 0 && f < 1 ? 1 : 0);
      });
      core.style.setProperty('--cs', (reduce ? 1 : .82 + .18 * ease(clamp(p / .1, 0, 1))).toFixed(3));
      if (cur !== lastCur) {
        lastCur = cur; coreLvl.textContent = LEVELS[cur].name;
        lvlArts.forEach(function (a, k) { a.classList.toggle('is-on', k === cur); });
        railBtns.forEach(function (b, k) { b.classList.toggle('is-on', k === cur); if (k === cur) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
      }
      railBtns.forEach(function (b, k) { b.style.setProperty('--f', clamp((p - START[k]) / .18, 0, 1).toFixed(3)); });

      var box = orbit.getBoundingClientRect(), W = box.width, S = W / 200;
      chips.forEach(function (c) {
        var s0 = START[c.li], next = START[c.li + 1];
        var show = reduce ? (p >= s0 ? 1 : 0) : ease(clamp((p - s0 - .035 - c.j * .016) / .055, 0, 1));
        var gone = next === undefined ? 0 : (reduce ? (p >= next - .02 ? 1 : 0) : ease(clamp((p - next + .01) / .045, 0, 1)));
        var vis = show * (1 - gone);
        var spin = reduce ? 0 : (p - s0) * .35 * (c.li % 2 ? -1 : 1);
        var a = c.a0 + spin, ca = Math.cos(a), sa = Math.sin(a);
        // ring anchor + chip position
        var rr = R[c.li], cr = CHIP_R[c.li] + (1 - show) * 14 - gone * (CHIP_R[c.li] - rr);
        var ax = ca * rr, ay = sa * rr;
        c.dot.setAttribute('cx', ax.toFixed(2)); c.dot.setAttribute('cy', ay.toFixed(2));
        c.dot.setAttribute('opacity', show.toFixed(3));
        var t1 = rr + 2.2, t2 = Math.max(t1, CHIP_R[c.li] - 4);
        c.tick.setAttribute('x1', (ca * t1).toFixed(2)); c.tick.setAttribute('y1', (sa * t1).toFixed(2));
        c.tick.setAttribute('x2', (ca * t2).toFixed(2)); c.tick.setAttribute('y2', (sa * t2).toFixed(2));
        c.tick.setAttribute('opacity', (vis * .9).toFixed(3));
        var x = W / 2 + ca * cr * S - c.w / 2, y = W / 2 + sa * cr * S - c.h / 2;
        x = clamp(x, -box.left + 8, vw - box.left - c.w - 8);
        var sc = .86 + .14 * vis;
        c.el.style.opacity = vis.toFixed(3);
        c.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) scale(' + sc.toFixed(3) + ')';
        c.el.style.visibility = vis < .01 ? 'hidden' : 'visible';
      });
    }

    /* whose business */
    whoLis.forEach(function (li) { var r = li.getBoundingClientRect(); li.classList.toggle('is-lit', r.top + r.height / 2 < vh * .72); });

    /* price track */
    var tr = track.getBoundingClientRect(), tp = clamp((vh * .85 - tr.top) / (tr.height + vh * .25), 0, 1);
    trackLis.forEach(function (li, i) { li.classList.toggle('is-done', tp > .15 + i * .25); });
    trackLine.style.setProperty('--fl', clamp((tp - .15) / .5, 0, 1).toFixed(3));

    /* desk: flips to Help Desk as the card rises past the middle, unless the visitor chose */
    var dr = ticket.getBoundingClientRect(), mid = dr.top + dr.height / 2;
    if (dr.bottom < 0 || dr.top > vh) deskManual = null;
    var want = deskManual !== null ? deskManual : (mid < vh * .42 ? 1 : 0);
    if (want !== side) setSide(want);

    /* close: the note lands */
    var cr2 = closeArt.getBoundingClientRect(), cp = clamp((vh - cr2.top) / (vh * .6), 0, 1);
    if (!reduce) { closeNote.style.setProperty('--no', clamp((cp - .35) / .4, 0, 1).toFixed(3)); closeNote.style.setProperty('--ny', ((1 - ease(clamp((cp - .35) / .5, 0, 1))) * -26).toFixed(1) + 'px'); }
    setArcs(closeArcs, reduce ? 1 : clamp(cp * 1.1 - .1, 0, 1));

    requestAnimationFrame(frame);
  }
  function start() { measure(); requestAnimationFrame(frame); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start); else start();
  addEventListener('resize', function () { measure(); lastRingsDrawn = -1; });
})();
