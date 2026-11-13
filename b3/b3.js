/* Digerati Experts · preview B3 · one rAF loop, native scroll, no hijack.
   B3: visuals follow a smoothed, rate-limited, velocity-aware copy of scroll progress,
   skip in-between states on a fling, and settle to a composed state when scrolling stops. */
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
  /* B3: no longer scroll-driven. Three cards (problem, fix, plan) rotate on their own as a stacked deck.
     ~6.5s per card, 700ms crossfade with a small slide/scale. Pauses on hover, focus, hidden tab, off-screen,
     or the pause button. Tabs + arrow keys + swipe. Reduced motion: manual only, no animation. */
  var usual = $('#usual');
  (function deck() {
    var deckEl = $('#deck'), live = $('#deckLive'), cards = $$('.callcard', deckEl), tabs = $$('.dots [role=tab]', usual), says = $$('.usual__say', usual), pp = $('#deckPP');
    var N = cards.length, DWELL = 6500, LEAVE = 700, cur = 0, timer = 0, startedAt = 0, remaining = DWELL;
    var hover = false, focus = false, offscreen = true, userPaused = !!reduce, leaveT = [];
    usual.style.setProperty('--dwell', DWELL + 'ms');
    function layout(prev) {
      cards.forEach(function (c, k) {
        var pos = (k - cur + N) % N; c.setAttribute('data-pos', pos);
        var on = pos === 0; c.setAttribute('aria-hidden', String(!on)); c.inert = !on;
        if (prev !== undefined && k === prev && k !== cur && !reduce) {
          c.classList.add('is-leaving'); clearTimeout(leaveT[k]);
          leaveT[k] = setTimeout(function () { c.classList.remove('is-leaving'); }, LEAVE);
        } else if (k === cur) { c.classList.remove('is-leaving'); }
      });
      tabs.forEach(function (t, k) { var on = k === cur; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; t.classList.toggle('is-seen', k < cur); });
      says.forEach(function (p, k) { p.classList.toggle('is-on', k === cur); });
    }
    function paused() { return userPaused || hover || focus || offscreen || document.hidden; }
    function schedule() {
      clearTimeout(timer); timer = 0;
      usual.classList.toggle('deck-auto', !reduce && !userPaused);
      usual.classList.toggle('deck-paused', paused());
      if (paused()) return;
      startedAt = performance.now();
      timer = setTimeout(function () { go(cur + 1, false); }, remaining);
    }
    function hold() { if (timer) { remaining = Math.max(400, remaining - (performance.now() - startedAt)); } schedule(); }
    function restartDash() { // restart the dwell fill on the active dash
      var i = tabs[cur] && $('.dots__bar i', tabs[cur]); if (!i) return; i.style.animation = 'none'; void i.offsetWidth; i.style.animation = '';
    }
    function go(n, byUser) {
      var prev = cur; cur = (n + N) % N; remaining = DWELL;
      live.setAttribute('aria-live', byUser ? 'polite' : 'off');
      layout(prev); restartDash(); schedule();
    }
    tabs.forEach(function (t, k) {
      t.addEventListener('click', function () { if (k !== cur) go(k, true); });
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'Home' ? -cur : e.key === 'End' ? N - 1 - cur : 0;
        if (!d) return; e.preventDefault(); go(cur + d, true); tabs[cur].focus();
      });
    });
    pp.addEventListener('click', function () {
      userPaused = !userPaused; pp.setAttribute('aria-pressed', String(userPaused));
      pp.setAttribute('aria-label', userPaused ? 'Play the cards' : 'Pause the cards');
      if (!userPaused) remaining = DWELL, restartDash(); schedule();
    });
    if (reduce) { pp.hidden = true; }
    pp.setAttribute('aria-pressed', String(userPaused));
    [deckEl, $('.deckctl', usual)].forEach(function (z) {
      z.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { hover = true; hold(); } });
      z.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { hover = false; schedule(); } });
    });
    usual.addEventListener('focusin', function () { focus = true; hold(); });
    usual.addEventListener('focusout', function (e) { if (!usual.contains(e.relatedTarget)) { focus = false; schedule(); } });
    document.addEventListener('visibilitychange', function () { if (document.hidden) hold(); else schedule(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { es.forEach(function (e) { var off = !e.isIntersecting; if (off !== offscreen) { offscreen = off; if (off) hold(); else schedule(); } }); }, { threshold: .35 }).observe(deckEl);
    } else offscreen = false;
    // swipe (horizontal only; vertical stays native scroll thanks to touch-action: pan-y)
    var sx = 0, sy = 0, st = 0;
    deckEl.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; st = 1; });
    deckEl.addEventListener('pointerup', function (e) {
      if (!st) return; st = 0; var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) go(cur + (dx < 0 ? 1 : -1), true);
    });
    deckEl.addEventListener('pointercancel', function () { st = 0; });
    layout(); schedule();
    window.__deckGo = function (i) { go(i, true); };
    window.__deck = function () { return { cur: cur, paused: paused(), hover: hover, focus: focus, offscreen: offscreen, userPaused: userPaused }; };
  })();

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
  var RING_REST = [.26, .47, .665, .86]; // fully composed moment of each level (ring drawn, every chip landed, none leaving)
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
    scrollTo({ top: scrollY + r.top + t * RING_REST[i], behavior: reduce ? 'auto' : 'smooth' });
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

  /* ---------- the loop ----------
     raw  = where the scroll bar says the scene is
     sm   = what we draw. It chases raw with a time-based ease (frame-rate independent), can move
            at most MAX_RATE scene-lengths per second, and if it falls more than JUMP behind (a fling,
            End key, anchor jump) it skips the in-between states and eases only the last LAND of the way.
     When scrolling stops, each scene eases its drawing (not the page) to the nearest composed state,
     so a fast fling never leaves a half-drawn ring or two lines of copy on top of each other. */
  var TAU_MS = 110, MAX_RATE = 1.9, JUMP = .22, JUMP_FAST = .12, LAND = .05, VFAST = 2.4, IDLE_MS = 170;
  function sgn(v) { return v < 0 ? -1 : 1; }
  function follow(cur, target, dt, fast) {
    var gap = target - cur, ag = Math.abs(gap);
    if (ag < 2e-4) return target;
    if (ag > (fast ? JUMP_FAST : JUMP)) return target - sgn(gap) * LAND;
    var step = gap * (1 - Math.exp(-dt / TAU_MS)), max = MAX_RATE * dt / 1000;
    return cur + (Math.abs(step) > max ? sgn(step) * max : step);
  }
  // composed resting states
  function restRings(p) {
    if (p < START[0] - .03) return p;                       // empty tracks + "Your business": already composed
    var best = .06, d = Math.abs(p - .06);
    RING_REST.forEach(function (r, i) { var v = i === 3 ? Math.max(p, r) : r, dd = Math.abs(p - v); if (dd < d) { d = dd; best = v; } });
    return best;
  }
  function vis(r, vh) { return r.bottom > 0 && r.top < vh; }

  var sm = { rings: 0, track: 0, close: 0 }, gate = 1, lastRingsDrawn = -1, lastW = 0, lastH = 0;
  var lastY = scrollY, lastT = performance.now(), vel = 0, lastMove = 0, dirty = true, wasFast = false;
  function frame(now) {
    var dt = Math.min(64, Math.max(1, now - lastT)); lastT = now;
    var vh = innerHeight, vw = innerWidth, y = scrollY;

    /* velocity (viewport-heights per second), lightly smoothed */
    var inst = (y - lastY) / dt * 1000 / vh; lastY = y;
    vel += (inst - vel) * (1 - Math.exp(-dt / 70));
    if (Math.abs(vel) > .12) lastMove = now;
    var idle = now - lastMove > IDLE_MS, fast = !reduce && Math.abs(vel) > VFAST;
    if (inst !== 0 || vw !== lastW || vh !== lastH) dirty = true;

    /* ---- read phase: every rect up front, no layout thrash ---- */
    var rR = rings.getBoundingClientRect(), box = orbit.getBoundingClientRect();
    var whoR = whoLis.map(function (li) { return li.getBoundingClientRect(); });
    var tr = track.getBoundingClientRect(), dr = ticket.getBoundingClientRect(), cr2 = closeArt.getBoundingClientRect();

    var pR = rR.height - vh > 0 ? clamp(-rR.top / (rR.height - vh), 0, 1) : 0;
    var pT = clamp((vh * .85 - tr.top) / (tr.height + vh * .25), 0, 1);
    var pC = clamp((vh - cr2.top) / (vh * .6), 0, 1);
    if (reduce || idle) { pR = restRings(pR); }
    if ((reduce || idle) && vis(cr2, vh)) pC = cr2.top < vh * .85 ? 1 : pC;

    /* ---- what to draw ---- */
    var prev = sm.rings + sm.track + sm.close + gate;
    if (reduce) { sm.rings = pR; sm.track = pT; sm.close = pC; }
    else {
      // off-screen scenes jump straight to their true state so they're right when they come back
      sm.rings = vis(rR, vh) ? follow(sm.rings, pR, dt, fast) : pR;
      sm.track = vis(tr, vh) ? follow(sm.track, pT, dt, fast) : pT;
      sm.close = vis(cr2, vh) ? follow(sm.close, pC, dt, fast) : pC;
      // chips fade out during a fling and come back once it slows, so labels never smear across the orbit
      gate += ((fast ? 0 : 1) - gate) * (1 - Math.exp(-dt / (fast ? 90 : 200)));
      if (gate > .995) gate = 1; else if (gate < .005) gate = 0;
    }
    if (Math.abs(sm.rings + sm.track + sm.close + gate - prev) > 1e-5) dirty = true;
    if (fast !== wasFast) { wasFast = fast; rings.classList.toggle('is-fast', fast); }
    if (!dirty) { requestAnimationFrame(frame); return; }
    dirty = false;

    /* ---- write phase ---- */
    nav.classList.toggle('is-pill', y > 40);

    /* rings */
    var p = sm.rings;
    if (Math.abs(p - lastRingsDrawn) > .0004 || vw !== lastW || gate < 1 || gate !== frame.g) {
      lastRingsDrawn = p; frame.g = gate;
      var cur = 0; for (var i = 0; i < 4; i++) if (p >= START[i] - .02) cur = i;
      ringEls.forEach(function (o, i) {
        var f = reduce ? (p >= START[i] - .02 ? 1 : 0) : easeIO(clamp((p - START[i]) / .085, 0, 1));
        var off = (o.C * (1 - f)).toFixed(2);
        o.ring.setAttribute('stroke-dashoffset', off); o.glow.setAttribute('stroke-dashoffset', off);
        o.ring.classList.toggle('is-past', i < cur);
        o.glow.style.opacity = i === cur ? '' : '0';
        var a = -Math.PI / 2 + f * TAU, h = heads[i];
        h.setAttribute('cx', (Math.cos(a) * o.r).toFixed(2)); h.setAttribute('cy', (Math.sin(a) * o.r).toFixed(2));
        h.setAttribute('opacity', f > 0 && f < 1 ? gate.toFixed(3) : 0);
      });
      core.style.setProperty('--cs', (reduce ? 1 : .82 + .18 * ease(clamp(p / .1, 0, 1))).toFixed(3));
      if (cur !== lastCur) {
        lastCur = cur; coreLvl.textContent = LEVELS[cur].name;
        lvlArts.forEach(function (a, k) { a.classList.toggle('is-on', k === cur); });
        railBtns.forEach(function (b, k) { b.classList.toggle('is-on', k === cur); if (k === cur) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
      }
      railBtns.forEach(function (b, k) { b.style.setProperty('--f', clamp((p - START[k]) / .18, 0, 1).toFixed(3)); });

      var W = box.width, S = W / 200;
      chips.forEach(function (c) {
        var s0 = START[c.li], next = START[c.li + 1];
        var show = reduce ? (p >= s0 ? 1 : 0) : ease(clamp((p - s0 - .035 - c.j * .016) / .055, 0, 1));
        var gone = next === undefined ? 0 : (reduce ? (p >= next - .02 ? 1 : 0) : ease(clamp((p - next + .01) / .045, 0, 1)));
        var v = show * (1 - gone) * gate;
        var spin = reduce ? 0 : (p - s0) * .35 * (c.li % 2 ? -1 : 1);
        var a = c.a0 + spin, ca = Math.cos(a), sa = Math.sin(a);
        var rr = R[c.li], cr = CHIP_R[c.li] + (1 - show) * 14 - gone * (CHIP_R[c.li] - rr);
        var ax = ca * rr, ay = sa * rr;
        c.dot.setAttribute('cx', ax.toFixed(2)); c.dot.setAttribute('cy', ay.toFixed(2));
        c.dot.setAttribute('opacity', show.toFixed(3));
        var t1 = rr + 2.2, t2 = Math.max(t1, CHIP_R[c.li] - 4);
        c.tick.setAttribute('x1', (ca * t1).toFixed(2)); c.tick.setAttribute('y1', (sa * t1).toFixed(2));
        c.tick.setAttribute('x2', (ca * t2).toFixed(2)); c.tick.setAttribute('y2', (sa * t2).toFixed(2));
        c.tick.setAttribute('opacity', (v * .9).toFixed(3));
        var x = W / 2 + ca * cr * S - c.w / 2, yy = W / 2 + sa * cr * S - c.h / 2;
        x = clamp(x, -box.left + 8, vw - box.left - c.w - 8);
        var sc = .86 + .14 * v;
        c.el.style.opacity = v.toFixed(3);
        c.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + yy.toFixed(1) + 'px,0) scale(' + sc.toFixed(3) + ')';
        c.el.style.visibility = v < .01 ? 'hidden' : 'visible';
      });
    }
    lastW = vw; lastH = vh;

    /* whose business */
    whoLis.forEach(function (li, k) { var r = whoR[k]; li.classList.toggle('is-lit', r.top + r.height / 2 < vh * .72); });

    /* price track */
    trackLis.forEach(function (li, i) { li.classList.toggle('is-done', sm.track > .15 + i * .25); });
    trackLine.style.setProperty('--fl', clamp((sm.track - .15) / .5, 0, 1).toFixed(3));

    /* desk: flips to Help Desk as the card rises past the middle, unless the visitor chose */
    var mid = dr.top + dr.height / 2;
    if (dr.bottom < 0 || dr.top > vh) deskManual = null;
    var want = deskManual !== null ? deskManual : (mid < vh * .42 ? 1 : 0);
    if (want !== side) setSide(want);

    /* close: the note lands, the four rings close */
    var cp = sm.close;
    if (!reduce) { closeNote.style.setProperty('--no', clamp((cp - .35) / .4, 0, 1).toFixed(3)); closeNote.style.setProperty('--ny', ((1 - ease(clamp((cp - .35) / .5, 0, 1))) * -26).toFixed(1) + 'px'); }
    setArcs(closeArcs, reduce ? 1 : clamp(cp * 1.1 - .1, 0, 1));

    requestAnimationFrame(frame);
  }
  function start() { measure(); lastT = performance.now(); requestAnimationFrame(frame); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start); else start();
  addEventListener('resize', function () { measure(); lastRingsDrawn = -1; dirty = true; });
  // expose state for the QA harness only (read-only snapshot)
  window.__b3 = function () { return { sm: { rings: sm.rings, track: sm.track, close: sm.close }, gate: gate, vel: vel, fast: wasFast }; };
})();
