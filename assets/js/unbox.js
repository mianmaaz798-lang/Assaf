/* ASSAF — unboxing viewer, packing add-to-cart, quick view.
   Depends on main.js (ASSAF.Cart, ASSAF.stage …). The 3D code (stage3d.js + three.js)
   is only downloaded the first time a viewer opens. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return ASSAF.esc(s); };
  var money = function (v) { return ASSAF.money(v); };
  var reduced = function () { return ASSAF.reduced(); };
  var I = ASSAF.ICON;

  /* ------------------------------------------------------------------ ProductStage (3D) loader */
  var modP = null;
  function supportsWebGL() {
    try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
  }
  ASSAF.ProductStage = {
    /* mount3D(host, product, {variant}) -> Promise<stage|null>  (null = no WebGL, keep the photo stage) */
    mount3D: function (host, product, opts) {
      if (!supportsWebGL()) return Promise.resolve(null);
      if (!modP) modP = import(new URL('assets/js/stage3d.js', document.baseURI).href);
      return modP.then(function (m) { return m.createProductStage(host, product, opts || {}); })
        .catch(function (e) { if (window.console) console.warn('3D stage unavailable:', e); return null; });
    },
    html: function (p, opts) { return ASSAF.stage(p, opts); }
  };

  /* ------------------------------------------------------------------ overlay DOM */
  var root, panel, viewer, info, closeBtn, stage3d = null, stageP = null;
  var cur = null, size = 0, source = null, busy = false, lastFocus = null;

  function build() {
    root = document.createElement('div');
    root.className = 'unbox'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'unbox-title');
    root.innerHTML =
      '<div class="unbox-scrim" data-unbox-close></div>' +
      '<div class="unbox-panel">' +
      '<div class="unbox-viewer" tabindex="0" role="img" aria-roledescription="3D viewer">' +
      '<div class="viewer-loader" aria-hidden="true"><i class="skel"></i>Preparing your box…</div>' +
      '<div class="viewer-hint" aria-hidden="true">Drag to turn · Space to spray</div></div>' +
      '<div class="unbox-info"><button class="icon-btn unbox-close" data-unbox-close aria-label="Close">' + I.close + '</button><div data-unbox-body></div></div>' +
      '</div>';
    document.body.appendChild(root);
    panel = $('.unbox-panel', root); viewer = $('.unbox-viewer', root); info = $('[data-unbox-body]', root); closeBtn = $('.unbox-close', root);
    $$('[data-unbox-close]', root).forEach(function (b) { b.addEventListener('click', close); });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') trap(e);
    });
    info.addEventListener('click', onInfoClick);
    viewer.addEventListener('assaf:spray', function () { ASSAF.Sound.play('spray'); ASSAF.haptic(20); });
  }
  function trap(e) {
    var f = $$('button, [href], input, select, [tabindex]:not([tabindex="-1"])', root).filter(function (el) { return !el.disabled && el.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function renderInfo(p) {
    var v = ASSAF.variant(p, size), n = p.notes;
    var specs = [['Collection', p.family], ['For', p.gender], ['Sizes', p.variants.map(function (x) { return x.label.split(' · ')[0]; }).join(', ')], ['Status', p.available ? 'In stock' : 'Sold out']];
    var i = 0;
    var insert = function (html) { return '<div class="insert" style="--i:' + (i++) + '">' + html + '</div>'; };
    info.innerHTML =
      '<span class="eyebrow">' + esc(p.family) + ' · ' + esc(p.gender) + '</span>' +
      '<h2 id="unbox-title">' + esc(p.name) + '</h2><p class="lead">' + esc(p.tagline) + '</p>' +
      insert('<div class="insert-card insert-price"><p class="pdp-price" data-ub-price></p>' + (p.badge ? '<span class="badge static" style="margin:0">' + esc(p.badge) + '</span>' : '') + '</div>') +
      insert('<div class="insert-card"><h3>Choose your size</h3><div class="sizes" role="radiogroup" aria-label="Size">' + p.variants.map(function (x, k) {
        return '<button role="radio" data-ub-size="' + k + '"' + (x.available ? '' : ' class="unavailable"') + ' aria-checked="' + (k === size) + '">' + esc(x.label) + '<small>' + (x.available ? money(x.price) : 'Sold out') + '</small></button>';
      }).join('') + '</div></div>') +
      insert('<div class="unbox-actions"><button class="btn btn-gold" data-ub-add>Add to bag</button>' +
        '<button class="btn btn-ghost" data-ub-spray aria-label="Spray ' + esc(p.name) + '">' + I.spray + ' Spray</button>' +
        '<button class="icon-btn heart" style="width:48px;height:48px;border:1px solid var(--line-2)" data-wish="' + p.id + '" aria-pressed="' + ASSAF.Wish.has(p.id) + '" aria-label="Save to wishlist">' + I.heart + '</button>' +
        '<a class="btn btn-ghost" href="product.html?id=' + p.id + '">Full details</a></div>') +
      (n ? insert('<div class="insert-card"><h3>Fragrance notes</h3><dl>' +
        [['Top', n.top], ['Heart', n.heart], ['Base', n.base]].filter(function (t) { return t[1].length; }).map(function (t) { return '<dt>' + t[0] + '</dt><dd>' + t[1].map(esc).join(' · ') + '</dd>'; }).join('') + '</dl></div>') : '') +
      insert('<div class="insert-card"><h3>Specifications</h3><dl>' + specs.map(function (s) { return '<dt>' + s[0] + '</dt><dd>' + esc(s[1]) + '</dd>'; }).join('') +
        '<dt>Format</dt><dd>Spray bottle in an Assaf gift box</dd></dl></div>') +
      (p.description ? insert('<div class="insert-card"><h3>The story</h3><p' + (p.rtl ? ' dir="rtl" lang="ar"' : '') + '>' + esc(p.description.length > 260 ? p.description.slice(0, 260).replace(/\s\S*$/, '') + '…' : p.description) + '</p></div>') : '');
    viewer.setAttribute('aria-label', '3D view of ' + p.name + ' in its Assaf box. Drag, or use the arrow keys, to rotate.');
    updVariant();
  }
  function updVariant() {
    var p = cur, v = ASSAF.variant(p, size);
    $('[data-ub-price]', info).innerHTML = ASSAF.priceHTML(v.price, v.compare) + (v.compare ? ' <span class="save">Save ' + Math.round(100 - v.price / v.compare * 100) + '%</span>' : '');
    $$('[data-ub-size]', info).forEach(function (b) { var on = +b.getAttribute('data-ub-size') === size; b.classList.toggle('active', on); b.setAttribute('aria-checked', String(on)); });
    var add = $('[data-ub-add]', info);
    add.disabled = !v.available; add.textContent = v.available ? 'Add to bag · ' + money(v.price) : 'Sold out';
  }
  function onInfoClick(e) {
    var s = e.target.closest('[data-ub-size]');
    if (s) {
      size = +s.getAttribute('data-ub-size'); updVariant();
      if (stage3d) stage3d.setVariant(size);
      var ph = $('.stage', viewer); if (ph) ph.outerHTML = ASSAF.stage(cur, { variant: size, eager: true });
      return;
    }
    if (e.target.closest('[data-ub-add]')) pack();
    if (e.target.closest('[data-ub-spray]') && stage3d && !busy) stage3d.spray();
  }

  /* ------------------------------------------------------------------ shared-element (FLIP) helpers */
  function rectOf(el) { return el && el.getBoundingClientRect ? el.getBoundingClientRect() : el; }
  function flip(fromRect, reverse) {
    var to = panel.getBoundingClientRect();
    if (!fromRect || !fromRect.width || reduced() || !panel.animate) {
      return panel.animate ? panel.animate([{ opacity: reverse ? 1 : 0 }, { opacity: reverse ? 0 : 1 }], { duration: 260, fill: 'both' }).finished : Promise.resolve();
    }
    var sx = fromRect.width / to.width, sy = fromRect.height / to.height;
    var tx = fromRect.left - to.left, ty = fromRect.top - to.top;
    var a = 'translate(' + tx + 'px,' + ty + 'px) scale(' + sx + ',' + sy + ')', b = 'none';
    var kf = [{ transform: a, borderRadius: '26px', opacity: .6 }, { transform: b, borderRadius: getComputedStyle(panel).borderRadius, opacity: 1 }];
    if (reverse) kf.reverse();
    return panel.animate(kf, { duration: reverse ? 480 : 620, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' }).finished;
  }

  /* ------------------------------------------------------------------ open / close / pack */
  function open(id, opts) {
    opts = opts || {};
    var p = ASSAF.getProduct(id); if (!p || busy) return;
    if (!root) build();
    busy = true; cur = p; size = opts.size != null ? opts.size : ASSAF.firstAvail(p);
    source = opts.from || null;
    lastFocus = document.activeElement;
    ASSAF.Recent.push(p.id);
    renderInfo(p);
    viewer.classList.remove('is-ready', 'interacted');
    var old = $('.stage', viewer); if (old) old.remove();
    viewer.insertAdjacentHTML('afterbegin', ASSAF.stage(p, { variant: size, eager: true }));
    root.hidden = false;
    root.classList.remove('is-unboxed', 'is-closing');
    document.body.classList.add('overlay-open');
    if (source && source.classList) source.classList.add('is-source');
    void root.offsetWidth;
    root.classList.add('is-open');
    var srcRect = rectOf(source);
    if (panel.getAnimations) panel.getAnimations().forEach(function (a) { a.cancel(); });
    flip(srcRect, false).then(function () {
      if (panel.getAnimations) panel.getAnimations().forEach(function (a) { a.cancel(); });
      closeBtn.focus({ preventScroll: true });
      return mountStage(p);
    }).then(function (st) {
      if (!st) { root.classList.add('is-unboxed'); busy = false; return; }
      viewer.classList.add('is-ready');
      st.reset();
      return st.open().then(function () { busy = false; });
    }).catch(function (err) { if (window.console) console.warn('unbox:', err); busy = false; root.classList.add('is-unboxed'); });
    // the spec inserts start unfolding as the lid opens
    setTimeout(function () { if (cur === p && !root.classList.contains('is-closing')) root.classList.add('is-unboxed'); }, reduced() ? 0 : 900);
  }

  function mountStage(p) {
    if (stage3d) return stage3d.setProduct(p, size).then(function () { return stage3d; });
    if (!stageP) stageP = ASSAF.ProductStage.mount3D(viewer, p, { variant: size }).then(function (st) { stage3d = st; return st; });
    return stageP.then(function (st) { return st && st.product !== p ? st.setProduct(p, size).then(function () { return st; }) : st; });
  }

  function finishClose() {
    root.hidden = true;
    root.classList.remove('is-open', 'is-closing', 'is-unboxed');
    document.body.classList.remove('overlay-open');
    if (panel.getAnimations) panel.getAnimations().forEach(function (a) { a.cancel(); });
    if (source && source.classList) source.classList.remove('is-source');
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    source = null; busy = false;
  }

  function close() {
    if (!root || root.hidden || root.classList.contains('is-closing')) return;
    busy = true;
    root.classList.add('is-closing'); root.classList.remove('is-unboxed');
    var anim = stage3d && viewer.classList.contains('is-ready') ? stage3d.close() : Promise.resolve();
    anim.then(function () {
      root.classList.remove('is-open');
      var r = source && document.contains(source) ? rectOf(source) : null;
      if (r && (r.bottom < 0 || r.top > innerHeight)) r = null;
      return flip(r, true);
    }).then(finishClose, finishClose);
  }

  function pack() {
    var p = cur, v = ASSAF.variant(p, size);
    if (!v.available || busy) return;
    busy = true;
    var add = $('[data-ub-add]', info); add.disabled = true; add.textContent = 'Packing…';
    root.classList.add('is-closing'); root.classList.remove('is-unboxed');
    ASSAF.Sound.play('tape');
    var packed = stage3d && viewer.classList.contains('is-ready') ? stage3d.pack() : Promise.resolve();
    packed.then(function () {
      var from = stage3d && viewer.classList.contains('is-ready') ? stage3d.boxRect() : rectOf(viewer);
      if (reduced()) {
        ASSAF.Cart.add(p.id, size, 1);
        return fade();
      }
      // the sealed box leaves the viewer and flies to the bag while the panel fades away
      ASSAF.Cart.add(p.id, size, 1, { from: from });
      return fade();
    }).then(finishClose, finishClose);
  }
  function fade() {
    root.classList.remove('is-open');
    return panel.animate ? panel.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.97)' }], { duration: 300, easing: 'ease-out', fill: 'both' }).finished : Promise.resolve();
  }

  ASSAF.Unbox = { open: open, close: close };

  /* ------------------------------------------------------------------ quick view (hover button / long-press) */
  var qv, qvP = null, qvSize = 0;
  function buildQV() {
    qv = document.createElement('div');
    qv.className = 'qv'; qv.setAttribute('role', 'dialog'); qv.setAttribute('aria-modal', 'true'); qv.setAttribute('aria-label', 'Quick view');
    qv.innerHTML = '<div class="qv-scrim" data-qv-close></div><div class="qv-sheet"></div>';
    document.body.appendChild(qv);
    qv.addEventListener('click', function (e) {
      if (e.target.closest('[data-qv-close]')) return closeQV();
      var s = e.target.closest('[data-qv-size]');
      if (s) { qvSize = +s.getAttribute('data-qv-size'); renderQV(); return; }
      if (e.target.closest('[data-qv-add]')) { ASSAF.Cart.add(qvP.id, qvSize, 1, { from: $('.qv-media', qv) }); closeQV(); return; }
      if (e.target.closest('[data-qv-unbox]')) { var id = qvP.id, sz = qvSize; closeQV(); setTimeout(function () { open(id, { size: sz }); }, 120); }
    });
    qv.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeQV(); });
  }
  function renderQV() {
    var p = qvP, v = ASSAF.variant(p, qvSize);
    $('.qv-sheet', qv).innerHTML =
      '<button class="icon-btn qv-close" data-qv-close aria-label="Close quick view">' + I.close + '</button>' +
      '<div class="qv-media">' + ASSAF.stage(p, { variant: qvSize, eager: true }) + '</div>' +
      '<div><span class="eyebrow">' + esc(p.family) + '</span><h3>' + esc(p.name) + '</h3>' +
      '<p class="price">' + ASSAF.priceHTML(v.price, v.compare) + '</p>' +
      '<div class="sizes">' + p.variants.map(function (x, k) { return '<button data-qv-size="' + k + '" class="' + (k === qvSize ? 'active' : '') + (x.available ? '' : ' unavailable') + '">' + esc(x.label) + '</button>'; }).join('') + '</div>' +
      '<div class="qv-actions"><button class="btn btn-gold" data-qv-add' + (v.available ? '' : ' disabled') + '>' + (v.available ? 'Add to bag' : 'Sold out') + '</button>' +
      '<button class="btn btn-ghost" data-qv-unbox>' + I.cube + ' Unbox</button></div></div>';
  }
  function openQV(id) {
    var p = ASSAF.getProduct(id); if (!p) return;
    if (!qv) buildQV();
    qvP = p; qvSize = ASSAF.firstAvail(p); renderQV();
    lastFocus = document.activeElement;
    void qv.offsetWidth; qv.classList.add('is-open');
    setTimeout(function () { var b = $('[data-qv-add]', qv); if (b) b.focus({ preventScroll: true }); }, 50);
  }
  function closeQV() {
    if (!qv) return;
    qv.classList.remove('is-open');
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  ASSAF.QuickView = { open: openQV, close: closeQV };

  /* ------------------------------------------------------------------ wiring */
  // Tapping a product card / hero opens the unboxing view (bubble phase, so the
  // marquee's drag guard can cancel it). Modifier-clicks still open the product page.
  var suppressClick = false;
  document.addEventListener('click', function (e) {
    if (suppressClick) { suppressClick = false; e.preventDefault(); return; }
    var qb = e.target.closest('[data-qv]');
    if (qb) { e.preventDefault(); openQV(qb.getAttribute('data-qv')); return; }
    var a = e.target.closest('[data-unbox]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    open(a.getAttribute('data-unbox'), { from: a });
  });

  // long-press (touch) opens quick view
  var lpTimer = 0, lpStart = null;
  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'touch') return;
    var a = e.target.closest('[data-unbox]'); if (!a) return;
    lpStart = { x: e.clientX, y: e.clientY };
    lpTimer = setTimeout(function () { suppressClick = true; ASSAF.haptic(10); openQV(a.getAttribute('data-unbox')); }, 520);
  }, { passive: true });
  var cancelLP = function (e) {
    if (!lpTimer) return;
    if (e.type === 'pointermove' && lpStart && Math.hypot(e.clientX - lpStart.x, e.clientY - lpStart.y) < 10) return;
    clearTimeout(lpTimer); lpTimer = 0;
  };
  ['pointerup', 'pointercancel', 'pointermove'].forEach(function (t) { document.addEventListener(t, cancelLP, { passive: true }); });
  document.addEventListener('contextmenu', function (e) { if (e.target.closest && e.target.closest('[data-unbox]') && lpTimer === 0 && suppressClick) e.preventDefault(); });

  // warm the 3D code when the browser is idle, after first paint
  var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 2500); };
  window.addEventListener('load', function () {
    idle(function () {
      if (!supportsWebGL() || navigator.connection && navigator.connection.saveData) return;
      var l = document.createElement('link'); l.rel = 'modulepreload'; l.href = 'assets/js/stage3d.js'; document.head.appendChild(l);
    });
  });
})();
