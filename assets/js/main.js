/* ASSAF — shared site behaviour: layout, cart, search, animations, page controllers. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var PAGE = document.body.getAttribute('data-page');

  /* ---------------------------------------------------------------- helpers */
  function money(v) {
    var n = Math.round(v * 100) / 100;
    return ASSAF.CURRENCY + ' ' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }
  function variant(p, idx) { return p.variants[+idx] || p.variants[0]; }
  function priceFor(p, idx) { return variant(p, idx).price; }
  function priceHTML(price, compare) {
    return '<span class="now">' + money(price) + '</span>' + (compare ? ' <s class="was">' + money(compare) + '</s>' : '');
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }
  ASSAF.money = money;
  ASSAF.esc = esc;
  ASSAF.store = store;
  ASSAF.variant = variant;
  ASSAF.priceHTML = priceHTML;
  var RM = window.matchMedia('(prefers-reduced-motion: reduce)');
  ASSAF.reduced = function () { return RM.matches; };

  /* subtle UI sound (muted by default) + light haptics */
  var Sound = {
    on: store('assaf_sound') === true, ctx: null,
    toggle: function () { this.on = !this.on; store('assaf_sound', this.on); renderSoundBtn(); if (this.on) this.play('pop'); },
    play: function (kind) {
      if (!this.on) return;
      try {
        var C = window.AudioContext || window.webkitAudioContext; if (!C) return;
        var ctx = this.ctx || (this.ctx = new C()), t = ctx.currentTime;
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = kind === 'tape' ? 'triangle' : 'sine';
        var f = { pop: [660, 990], drop: [220, 110], tape: [900, 500] }[kind] || [440, 660];
        o.frequency.setValueAtTime(f[0], t); o.frequency.exponentialRampToValueAtTime(f[1], t + .12);
        g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.06, t + .015); g.gain.exponentialRampToValueAtTime(.0001, t + .2);
        o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + .22);
      } catch (e) { /* audio unavailable */ }
    }
  };
  ASSAF.Sound = Sound;
  function haptic(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch (e) { /* ignore */ } }
  ASSAF.haptic = haptic;
  function renderSoundBtn() {
    $$('[data-sound]').forEach(function (b) { b.setAttribute('aria-pressed', String(Sound.on)); b.setAttribute('aria-label', Sound.on ? 'Mute sounds' : 'Turn sounds on'); });
  }

  /* wishlist */
  var Wish = {
    ids: (store('assaf_wishlist') || []).filter(function (id) { return ASSAF.getProduct(id); }),
    has: function (id) { return this.ids.indexOf(id) > -1; },
    toggle: function (id) {
      var i = this.ids.indexOf(id);
      if (i > -1) this.ids.splice(i, 1); else this.ids.unshift(id);
      store('assaf_wishlist', this.ids); this.render();
      return i < 0;
    },
    render: function () {
      $$('[data-wish]').forEach(function (b) {
        var on = Wish.has(b.getAttribute('data-wish'));
        b.setAttribute('aria-pressed', String(on));
        b.setAttribute('aria-label', (on ? 'Remove from' : 'Save to') + ' wishlist');
      });
      $$('[data-wish-count]').forEach(function (el) { el.textContent = Wish.ids.length; el.classList.toggle('is-empty', !Wish.ids.length); });
    }
  };
  ASSAF.Wish = Wish;

  /* recently viewed */
  var Recent = {
    ids: (store('assaf_recent') || []).filter(function (id) { return ASSAF.getProduct(id); }),
    push: function (id) {
      this.ids = [id].concat(this.ids.filter(function (x) { return x !== id; })).slice(0, 12);
      store('assaf_recent', this.ids);
    }
  };
  ASSAF.Recent = Recent;

  /* ---------------------------------------------------------------- cart */
  var Cart = {
    items: (store('assaf_cart') || []).filter(function (i) { var p = ASSAF.getProduct(i.id); return p && p.variants[+i.size]; }),
    save: function () { store('assaf_cart', this.items); this.justAdded = this.lastKey; this.lastKey = null; this.render(); this.justAdded = null; },
    count: function () { return this.items.reduce(function (n, i) { return n + i.qty; }, 0); },
    subtotal: function () {
      return this.items.reduce(function (t, i) {
        var p = ASSAF.getProduct(i.id); return p ? t + priceFor(p, i.size) * i.qty : t;
      }, 0);
    },
    hold: 0,
    add: function (id, size, qty, opts) {
      opts = opts || {};
      size = String(size || 0); qty = qty || 1;
      var prod = ASSAF.getProduct(id);
      if (!prod) return;
      id = prod.id;
      if (!variant(prod, size).available) { toast('Sorry — this size is sold out'); return; }
      var line = this.items.find(function (i) { return i.id === id && i.size === size; });
      if (line) line.qty = Math.min(line.qty + qty, 20); else this.items.push({ id: id, size: size, qty: qty });
      this.lastKey = id + '|' + size;
      var from = opts.from;
      if (from && !ASSAF.reduced()) {
        // hold the badge until the box lands in the bag
        this.hold += qty;
        this.save();
        ASSAF.flyToBag(from, function () { Cart.hold = Math.max(0, Cart.hold - qty); Cart.render(); landed(); });
      } else {
        this.save(); landed();
      }
      toast(prod.name + ' added to your bag');
    },
    setQty: function (idx, qty) {
      if (qty <= 0) this.items.splice(idx, 1); else this.items[idx].qty = Math.min(qty, 20);
      this.save();
    },
    clear: function () { this.items = []; this.save(); },
    listeners: [],
    render: function () {
      $$('[data-cart-count]').forEach(function (el) {
        var c = Math.max(0, Cart.count() - Cart.hold); el.textContent = c; el.classList.toggle('is-empty', c === 0);
      });
      var shown = Math.max(0, Cart.count() - Cart.hold);
      $$('[data-open-cart]').forEach(function (b) { b.setAttribute('aria-label', 'Bag, ' + shown + (shown === 1 ? ' item' : ' items')); });
      renderDrawer();
      this.listeners.forEach(function (fn) { fn(); });
    }
  };
  ASSAF.Cart = Cart;

  function bump() {
    $$('.cart-btn').forEach(function (b) {
      b.classList.remove('squash'); void b.offsetWidth; b.classList.add('squash');
    });
    $$('.cart-btn [data-cart-count]').forEach(function (c) { c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); });
  }
  function landed() { bump(); Sound.play('drop'); haptic(14); }
  ASSAF.landed = landed;

  /* the sealed box flies along a curved arc into the header bag */
  ASSAF.flyToBag = function (from, done) {
    var bag = $('.site-header .cart-btn');
    var fr = from.getBoundingClientRect ? from.getBoundingClientRect() : from;
    if (!bag || !fr || !Element.prototype.animate) { if (done) done(); return; }
    var br = bag.getBoundingClientRect();
    var el = document.createElement('div');
    el.className = 'fly-box'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span class="fb-body"><img src="assets/img/logo-sm.webp" alt="" /></span><span class="fb-lid"></span><span class="fb-tape"></span>';
    document.body.appendChild(el);
    var size = 56;
    var x0 = fr.left + fr.width / 2 - size / 2, y0 = fr.top + fr.height / 2 - size / 2;
    var x1 = br.left + br.width / 2 - size / 2, y1 = br.top + br.height / 2 - size / 2;
    var s0 = Math.min(2.4, Math.max(1, Math.min(fr.width, fr.height) / size * .55));
    // quadratic bezier with a control point lifted above both ends
    var cx = (x0 + x1) / 2 + (x1 - x0) * .1, cy = Math.min(y0, y1) - Math.max(120, Math.abs(x1 - x0) * .35);
    var frames = [], N = 24;
    for (var i = 0; i <= N; i++) {
      var t = i / N, it = 1 - t;
      var x = it * it * x0 + 2 * it * t * cx + t * t * x1;
      var y = it * it * y0 + 2 * it * t * cy + t * t * y1;
      var sc = s0 + (0.32 - s0) * t;
      frames.push({ transform: 'translate3d(' + x + 'px,' + y + 'px,0) scale(' + sc + ') rotate(' + (Math.sin(t * Math.PI) * -14) + 'deg)', opacity: t > .94 ? 0 : 1, offset: t });
    }
    var a = el.animate(frames, { duration: 820, easing: 'cubic-bezier(.5,0,.4,1)', fill: 'forwards' });
    a.onfinish = function () { el.remove(); if (done) done(); };
  };

  /* ---------------------------------------------------------------- toast */
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }
  ASSAF.toast = toast;

  /* ---------------------------------------------------------------- layout */
  var ICON = {
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 8z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/><path d="M12 13.2l1.6 2.3H10.4z" fill="#C2A36B" stroke="none"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-9-8.6C1.6 8.3 3.6 5 6.8 5c2 0 3.4 1.1 4.2 2.4C11.8 6.1 13.2 5 15.2 5c3.2 0 5.2 3.3 3.8 6.4C19 15.6 12 20 12 20z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    sun: '<svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
    soundOn: '<svg class="on" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    soundOff: '<svg class="off" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
    cube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 12l9-5M12 12v10M12 12L3 7"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    ig: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6"/></svg>',
    tt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3v11a4 4 0 1 1-4-4"/><path d="M14 3c.5 3 2.5 5 6 5"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4l16 16M20 4L4 20"/></svg>',
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7L4 20z"/></svg>'
  };
  ASSAF.ICON = ICON;

  function buildLayout() {
    var nav = [
      ['shop.html', 'Shop all', 'shop'], ['shop.html?gender=Women', 'Women', ''], ['shop.html?gender=Men', 'Men', ''],
      ['shop.html?family=Gift%20Sets', 'Gift Sets', ''], ['about.html', 'Our Story', 'about'], ['contact.html', 'Contact', 'contact']
    ];
    var links = nav.map(function (n) {
      return '<a href="' + n[0] + '"' + (n[2] && n[2] === PAGE ? ' aria-current="page"' : '') + '>' + n[1] + '</a>';
    }).join('');

    var header = document.createElement('header');
    header.className = 'site-header' + (document.body.hasAttribute('data-solid-header') ? ' is-solid' : '');
    header.innerHTML =
      '<div class="announce"><div class="announce-track">' +
      '<span>Free express shipping on orders over ' + money(FREE_SHIP) + '</span><span>✦</span>' +
      '<span>Buy 2 Get 1 Free on selected perfumes</span><span>✦</span><span>Gift sets for every occasion</span><span>✦</span>' +
      '<span>Free express shipping on orders over ' + money(FREE_SHIP) + '</span><span>✦</span>' +
      '<span>Buy 2 Get 1 Free on selected perfumes</span><span>✦</span><span>Gift sets for every occasion</span><span>✦</span>' +
      '</div></div>' +
      '<div class="header-bar">' +
      '<button class="icon-btn burger" aria-label="Open menu" aria-expanded="false"><span></span><span></span></button>' +
      '<nav class="main-nav" aria-label="Main">' + links + '</nav>' +
      '<a href="index.html" class="logo" aria-label="Assaf home"><img src="assets/img/logo-sm.webp" alt="Assaf" width="45" height="42" /></a>' +
      '<div class="header-actions">' +
      '<button class="icon-btn" data-open-search aria-label="Search" aria-keyshortcuts="/">' + ICON.search + '</button>' +
      '<button class="icon-btn theme-btn" data-theme-toggle aria-label="Switch colour theme">' + ICON.sun + ICON.moon + '</button>' +
      '<a class="icon-btn wish-link" href="shop.html?wishlist=1" aria-label="Wishlist">' + ICON.heart + '<span class="wish-count is-empty" data-wish-count>0</span></a>' +
      '<button class="icon-btn cart-btn" data-open-cart aria-label="Open bag" aria-controls="cart-drawer" aria-expanded="false">' + ICON.bag + '<span class="cart-count is-empty" data-cart-count aria-live="polite">0</span></button>' +
      '</div></div>';
    document.body.prepend(header);
    var skip = document.createElement('a'); skip.className = 'skip-link'; skip.href = '#main'; skip.textContent = 'Skip to content';
    document.body.prepend(skip);
    var main = $('main'); if (main && !main.id) main.id = 'main';

    var mobile = document.createElement('div');
    mobile.className = 'mobile-nav'; mobile.id = 'mobile-nav';
    mobile.innerHTML = '<nav aria-label="Mobile">' + links + '</nav>' +
      '<div class="mobile-tools"><a class="btn btn-ghost" href="shop.html?wishlist=1">' + ICON.heart + ' Wishlist</a><button class="btn btn-ghost theme-btn" data-theme-toggle>' + ICON.sun + ICON.moon + ' Theme</button></div>' +
      '<p class="mobile-nav-foot">support@assaf.ae · @assafperfumes</p>';
    document.body.appendChild(mobile);

    var drawer = document.createElement('aside');
    drawer.className = 'drawer'; drawer.id = 'cart-drawer'; drawer.setAttribute('aria-label', 'Shopping bag');
    drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-modal', 'true'); drawer.tabIndex = -1;
    drawer.innerHTML =
      '<div class="drawer-head"><h3>Your Bag <span data-cart-count>0</span></h3><div class="head-tools">' +
      '<button class="icon-btn sound-btn" data-sound aria-pressed="false" aria-label="Turn sounds on">' + ICON.soundOn + ICON.soundOff + '</button>' +
      '<button class="icon-btn" data-close-cart aria-label="Close bag">' + ICON.close + '</button></div></div>' +
      '<div class="ship-meter"><p data-ship-msg></p><div class="meter"><span data-ship-bar></span></div></div>' +
      '<div class="drawer-body" data-drawer-items></div>' +
      '<div class="drawer-foot"><div class="row"><span>Subtotal</span><strong data-drawer-subtotal>AED 0</strong></div>' +
      '<p class="muted small">Shipping calculated at checkout.</p>' +
      '<a href="checkout.html" class="btn btn-gold btn-block" data-checkout-link>Checkout</a>' +
      '<a href="cart.html" class="btn btn-ghost btn-block">View bag</a></div>';
    document.body.appendChild(drawer);

    var search = document.createElement('div');
    search.className = 'search-overlay'; search.id = 'search';
    search.innerHTML =
      '<div class="container"><div class="search-head"><input type="search" placeholder="Search fragrances, notes, families…" aria-label="Search" />' +
      '<button class="icon-btn" data-close-search aria-label="Close search">' + ICON.close + '</button></div>' +
      '<div class="search-results" data-search-results></div></div>';
    document.body.appendChild(search);

    var scrim = document.createElement('div'); scrim.className = 'scrim'; document.body.appendChild(scrim);

    var footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.innerHTML =
      '<div class="container footer-grid">' +
      '<div class="footer-brand"><a href="index.html" class="logo"><img src="assets/img/logo-sm.webp" alt="Assaf" width="68" height="64" loading="lazy" /></a>' +
      '<p>Where Gulf identity meets the genius of the world’s greatest perfumers.</p>' +
      '<p class="small"><a href="mailto:support@assaf.ae">support@assaf.ae</a> · <a href="tel:+966920002040">+966 92 000 2040</a></p>' +
      '<div class="socials"><a href="https://instagram.com/assafperfumes" target="_blank" rel="noopener" aria-label="Instagram">' + ICON.ig + '</a><a href="https://twitter.com/assafperfumes" target="_blank" rel="noopener" aria-label="X">' + ICON.x + '</a></div></div>' +
      '<div><h2 class="foot-h">Shop</h2><a href="shop.html">All fragrances</a><a href="shop.html?gender=Men">For him</a><a href="shop.html?gender=Women">For her</a><a href="shop.html?gender=Unisex">Unisex</a></div>' +
      '<div><h2 class="foot-h">Collections</h2>' + ASSAF.FAMILIES.map(function (f) { return '<a href="shop.html?family=' + encodeURIComponent(f) + '">' + f + '</a>'; }).join('') + '</div>' +
      '<div><h2 class="foot-h">House</h2><a href="about.html">Our story</a><a href="contact.html">Contact</a><a href="contact.html#faq">FAQ</a><a href="https://assaf.ae" target="_blank" rel="noopener">assaf.ae</a></div>' +
      '</div>' +
      '<div class="container footer-bottom"><span>© ' + new Date().getFullYear() + ' Assaf Perfumes. All rights reserved.</span>' +
      '<span class="pay">Visa · Mastercard · Tamara</span></div>';
    document.body.appendChild(footer);

    // events
    var burger = $('.burger');
    burger.addEventListener('click', function () {
      var open = document.body.classList.toggle('nav-open');
      burger.setAttribute('aria-expanded', open);
    });
    $$('[data-open-cart]').forEach(function (b) { b.addEventListener('click', openCart); });
    $$('[data-close-cart]').forEach(function (b) { b.addEventListener('click', closeAll); });
    $$('[data-open-search]').forEach(function (b) { b.addEventListener('click', openSearch); });
    $$('[data-close-search]').forEach(function (b) { b.addEventListener('click', closeAll); });
    $$('[data-sound]').forEach(function (b) { b.addEventListener('click', function () { Sound.toggle(); }); });
    renderSoundBtn();
    $$('[data-theme-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var root = document.documentElement;
        var cur = root.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        var next = cur === 'dark' ? 'light' : 'dark';
        var go = function () { root.setAttribute('data-theme', next); store('assaf_theme', next); };
        if (document.startViewTransition && !ASSAF.reduced()) document.startViewTransition(go); else go();
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && !/input|textarea|select/i.test((e.target.tagName || '')) && !e.target.isContentEditable) { e.preventDefault(); openSearch(); }
    });
    scrim.addEventListener('click', closeAll);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });

    $('#search input').addEventListener('input', function (e) { renderSearch(e.target.value); });

    var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 24); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  var lastFocus = null;
  function openCart() {
    closeAll(); lastFocus = document.activeElement;
    document.body.classList.add('cart-open');
    $$('[data-open-cart]').forEach(function (b) { b.setAttribute('aria-expanded', 'true'); });
    setTimeout(function () { var d = $('#cart-drawer'); if (d) d.focus(); }, 60);
  }
  function openSearch() {
    closeAll(); document.body.classList.add('search-open');
    var si = $('#search input'); if (si && !$('[data-search-results]').childElementCount) renderSearch(si.value || '');
    setTimeout(function () { $('#search input').focus(); }, 200);
  }
  function closeAll() {
    var wasCart = document.body.classList.contains('cart-open');
    document.body.classList.remove('cart-open', 'search-open', 'nav-open');
    $$('[data-open-cart]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    if (wasCart && lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    var b = $('.burger'); if (b) b.setAttribute('aria-expanded', 'false');
  }
  ASSAF.openCart = openCart;

  function haystack(p) {
    var n = p.notes || { top: [], heart: [], base: [] };
    return [p.name, p.family, p.gender, p.tagline].concat(n.top, n.heart, n.base).join(' ').toLowerCase();
  }
  ASSAF.haystack = haystack;

  function renderSearch(q) {
    var box = $('[data-search-results]'); if (!box) return;
    q = q.trim().toLowerCase();
    var list = ASSAF.PRODUCTS.filter(function (p) {
      if (!q) return true;
      return haystack(p).indexOf(q) > -1;
    });
    var hl = function (t) {
      t = esc(t); if (!q) return t;
      var i = t.toLowerCase().indexOf(esc(q)); return i < 0 ? t : t.slice(0, i) + '<mark>' + t.slice(i, i + esc(q).length) + '</mark>' + t.slice(i + esc(q).length);
    };
    box.innerHTML = list.length ? list.slice(0, 12).map(function (p) {
      return '<a class="search-item" href="product.html?id=' + p.id + '"><div class="search-thumb">' + ASSAF.stage(p) + '</div>' +
        '<div><strong>' + hl(p.name) + '</strong><span>' + p.family + ' · ' + money(p.price) + (p.available ? '' : ' · Sold out') + '</span></div></a>';
    }).join('') : '<p class="muted">No fragrance matches “' + esc(q) + '”. Try “Arrogate”, “Frankel” or “vanilla”.</p>';
  }

  var FREE_SHIP = ASSAF.FREE_SHIP || 275;
  function renderDrawer() {
    var box = $('[data-drawer-items]'); if (!box) return;
    var sub = Cart.subtotal();
    if (!Cart.items.length) {
      box.innerHTML = '<div class="empty"><p>Your bag is empty.</p><a href="shop.html" class="btn btn-ghost">Discover fragrances</a></div>';
    } else {
      box.innerHTML = Cart.items.map(function (i, idx) {
        var p = ASSAF.getProduct(i.id); if (!p) return '';
        return '<div class="line' + (Cart.justAdded === i.id + '|' + i.size ? ' entering' : '') + '">' + boxed(p, i) +
          '<div class="line-info"><a href="product.html?id=' + p.id + '"><strong>' + esc(p.name) + '</strong></a><span class="muted small">' + variant(p, i.size).label + '</span>' +
          '<div class="qty" data-idx="' + idx + '"><button data-q="-1" aria-label="Decrease">−</button><span>' + i.qty + '</span><button data-q="1" aria-label="Increase">+</button></div></div>' +
          '<div class="line-price">' + money(priceFor(p, i.size) * i.qty) + '<button class="link-btn" data-remove="' + idx + '">Remove</button></div></div>';
      }).join('');
    }
    $('[data-drawer-subtotal]').textContent = money(sub);
    var left = FREE_SHIP - sub;
    $('[data-ship-msg]').innerHTML = left > 0 ? 'You are <strong>' + money(left) + '</strong> away from free express shipping' : 'You have unlocked <strong>free express shipping</strong> ✦';
    $('[data-ship-bar]').style.width = Math.min(100, (sub / FREE_SHIP) * 100) + '%';
    $('[data-checkout-link]').classList.toggle('is-disabled', !Cart.items.length);
  }
  function boxed(p, i, href) {
    return '<a href="product.html?id=' + p.id + '" class="boxed" aria-label="' + esc(p.name) + '">' +
      '<span class="bx-photo">' + ASSAF.stage(p, { variant: +i.size }) + '</span>' +
      '<span class="bx-front"><img src="assets/img/logo-sm.webp" alt="" width="20" height="19" /></span>' + (href === 'qty' ? '<b>' + i.qty + '</b>' : '') + '</a>';
  }
  ASSAF.boxed = boxed;

  // delegated cart line controls (drawer + cart page)
  document.addEventListener('click', function (e) {
    var q = e.target.closest('.qty button[data-q]');
    if (q) {
      var idx = +q.parentNode.getAttribute('data-idx');
      Cart.setQty(idx, Cart.items[idx].qty + (+q.getAttribute('data-q')));
      return;
    }
    var r = e.target.closest('[data-remove]');
    if (r) {
      var ln = r.closest('.line'), ix = +r.getAttribute('data-remove');
      if (ln && !ASSAF.reduced()) {
        var bx = ln.querySelector('.boxed');
        if (bx && bx.animate) bx.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-40px) scale(.6) rotate(-8deg)', opacity: 0 }], { duration: 380, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
        ln.classList.add('leaving');
        setTimeout(function () { Cart.setQty(ix, 0); }, 380);
      } else Cart.setQty(ix, 0);
      return;
    }
    var add = e.target.closest('[data-add]');
    if (add) {
      e.preventDefault();
      var card = add.closest('.card'), src = card && card.querySelector('.card-media');
      Cart.add(add.getAttribute('data-add'), add.getAttribute('data-size'), 1, { from: src || add });
      return;
    }
    var wb = e.target.closest('[data-wish]');
    if (wb) {
      e.preventDefault(); e.stopPropagation();
      var added = Wish.toggle(wb.getAttribute('data-wish'));
      if (added && !ASSAF.reduced()) { wb.classList.remove('burst'); void wb.offsetWidth; wb.classList.add('burst'); haptic(8); }
      toast(added ? 'Saved to your wishlist' : 'Removed from your wishlist');
      if (PAGE === 'shop' && ASSAF.onWishChange) ASSAF.onWishChange();
    }
  });

  /* ---------------------------------------------------------------- product card */
  function firstAvail(p) { var i = p.variants.findIndex(function (v) { return v.available; }); return i < 0 ? 0 : i; }
  ASSAF.card = function (p, opts) {
    opts = opts || {};
    var sizes = p.variants.length > 1 ? p.variants.length + ' sizes' : p.variants[0].label;
    return '<article class="card' + (opts.cls ? ' ' + opts.cls : '') + (p.available ? '' : ' is-soldout') + '">' +
      '<a class="card-media" href="product.html?id=' + p.id + '" data-unbox="' + p.id + '" draggable="false"><span class="sr-only">Unbox ' + esc(p.name) + '</span>' +
      ASSAF.stage(p, { tilt: true }) +
      (p.badge ? '<span class="badge' + (p.available ? '' : ' muted-badge') + '">' + p.badge + '</span>' : '') +
      '<span class="card-view" aria-hidden="true">Tap to unbox ' + ICON.arrow + '</span></a>' +
      '<div class="card-actions">' +
      '<button class="icon-btn heart" data-wish="' + p.id + '" aria-pressed="' + Wish.has(p.id) + '" aria-label="Save to wishlist">' + ICON.heart + '</button>' +
      '<button class="icon-btn qv-btn" data-qv="' + p.id + '" aria-label="Quick view ' + esc(p.name) + '">' + ICON.eye + '</button></div>' +
      '<div class="card-body"><div><span class="eyebrow">' + p.family + ' · ' + p.gender + '</span>' +
      '<h3><a href="product.html?id=' + p.id + '" draggable="false">' + esc(p.name) + '</a></h3>' +
      '<span class="price">' + priceHTML(p.price, p.compare) + '</span><span class="sizes-note">' + esc(sizes) + '</span></div>' +
      (p.available ? '<button class="add-btn" data-add="' + p.id + '" data-size="' + firstAvail(p) + '" aria-label="Add ' + esc(p.name) + ' to bag"><span aria-hidden="true">+</span></button>'
        : '<span class="soldout-tag">Sold out</span>') + '</div></article>';
  };

  ASSAF.firstAvail = firstAvail;

  /* recently viewed row (home + product pages) */
  function renderRecent(exclude) {
    var sec = $('#recent'); if (!sec) return;
    var ids = Recent.ids.filter(function (id) { return id !== exclude; });
    if (!ids.length) { sec.hidden = true; return; }
    sec.hidden = false;
    $('[data-recent]', sec).innerHTML = ids.map(function (id) { return ASSAF.card(ASSAF.getProduct(id)); }).join('');
    ASSAF.carousel(sec);
  }
  ASSAF.renderRecent = renderRecent;

  /* ---------------------------------------------------------------- reveal on scroll */
  function initReveal() {
    var els = $$('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    els.forEach(function (e) { io.observe(e); });
  }
  ASSAF.initReveal = initReveal;

  /* ---------------------------------------------------------------- draggable infinite marquee */
  ASSAF.marquee = function (track, speed) {
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var x = 0, half = 0, dragging = false, startX = 0, startOffset = 0, moved = 0, paused = false, last = performance.now();
    var vel = speed || 0.5, lastPX = 0, fling = 0;
    function measure() { half = track.scrollWidth / 2; }
    measure(); window.addEventListener('resize', measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

    function wrap() { if (half) { while (x <= -half) x += half; while (x > 0) x -= half; } }
    function tick(now) {
      var dt = Math.min(48, now - last) / 16.67; last = now;
      if (!dragging) {
        if (!paused && !reduce) x -= vel * dt;
        x += fling * dt; fling *= 0.94; if (Math.abs(fling) < 0.05) fling = 0;
      }
      wrap();
      track.style.transform = 'translate3d(' + x + 'px,0,0)';
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    var vp = track.parentNode;
    vp.addEventListener('mouseenter', function () { paused = true; });
    vp.addEventListener('mouseleave', function () { paused = false; });
    vp.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      dragging = true; moved = 0; startX = lastPX = e.clientX; startOffset = x; fling = 0;
      vp.classList.add('dragging');
    });
    window.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - startX; moved = Math.max(moved, Math.abs(dx));
      fling = e.clientX - lastPX; lastPX = e.clientX;
      x = startOffset + dx;
      if (moved > 6) vp.setPointerCapture && !vp.hasPointerCapture(e.pointerId) && vp.setPointerCapture(e.pointerId);
    });
    function end() { if (!dragging) return; dragging = false; vp.classList.remove('dragging'); }
    window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    // a drag shouldn't count as a tap on a product
    vp.addEventListener('click', function (e) { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
    vp.addEventListener('dragstart', function (e) { e.preventDefault(); });
  };

  /* ---------------------------------------------------------------- snap carousel arrows */
  ASSAF.carousel = function (root) {
    var rail = $('.rail', root);
    var prev = $('[data-prev]', root), next = $('[data-next]', root);
    function step() { var c = $('.card', rail) || rail.firstElementChild; return c ? c.getBoundingClientRect().width + 24 : 300; }
    if (prev) prev.addEventListener('click', function () { rail.scrollBy({ left: -step(), behavior: 'smooth' }); });
    if (next) next.addEventListener('click', function () { rail.scrollBy({ left: step(), behavior: 'smooth' }); });
    var bar = $('.rail-progress span', root);
    function upd() {
      var max = rail.scrollWidth - rail.clientWidth;
      if (bar) { var vis = rail.clientWidth / rail.scrollWidth; bar.style.width = (vis * 100) + '%'; bar.style.left = (max ? (rail.scrollLeft / max) * (100 - vis * 100) : 0) + '%'; }
      if (prev) prev.disabled = rail.scrollLeft < 4;
      if (next) next.disabled = rail.scrollLeft > max - 4;
    }
    rail.addEventListener('scroll', upd, { passive: true }); window.addEventListener('resize', upd); upd();
  };

  /* ================================================================ PAGES */
  var Pages = {};

  Pages.home = function () {
    // hero bottle
    var hero = ASSAF.getProduct('arrogate-pink-200ml') || ASSAF.PRODUCTS[0];
    $('[data-hero-bottle]').innerHTML = ASSAF.stage(hero, { tilt: true, eager: true });
    $$('[data-hero-link]').forEach(function (a) { a.setAttribute('data-unbox', hero.id); });
    $$('[data-hero-link]').forEach(function (a) { a.href = 'product.html?id=' + hero.id; });
    $$('[data-hero-name]').forEach(function (el) { el.textContent = hero.name; });
    $$('[data-hero-notes]').forEach(function (el) {
      el.textContent = hero.notes ? [hero.notes.top[0], hero.notes.heart[0], hero.notes.base[0]].filter(Boolean).join(' · ') : hero.tagline;
    });
    $$('[data-hero-price]').forEach(function (el) { el.textContent = money(hero.price); });
    $$('[data-count-products]').forEach(function (el) { el.textContent = ASSAF.PRODUCTS.filter(function (p) { return p.family !== 'Gift Sets'; }).length; });
    $$('[data-count-families]').forEach(function (el) { el.textContent = ASSAF.FAMILIES.length; });
    $$('[data-free-ship]').forEach(function (el) { el.textContent = money(FREE_SHIP); });
    // scroll parallax on the hero render (transform only)
    var heroStage = $('.hero-stage');
    if (heroStage && !ASSAF.reduced()) {
      var pr = 0;
      window.addEventListener('scroll', function () {
        if (pr) return;
        pr = requestAnimationFrame(function () { pr = 0; var y = Math.min(window.scrollY, 900); heroStage.style.setProperty('--py', (y * 0.18).toFixed(1) + 'px'); });
      }, { passive: true });
    }
    renderRecent();

    // moving product marquee (tap any bottle to open it)
    var track = $('[data-marquee]');
    var moving = ASSAF.PRODUCTS.filter(function (p) { return p.available && p.family !== 'Gift Sets'; })
      .sort(function (a, b) { return b.bestseller - a.bestseller; }).slice(0, 10);
    var html = moving.map(function (p) { return ASSAF.card(p, { cls: 'card-marquee' }); }).join('');
    track.innerHTML = html + html;
    ASSAF.marquee(track, 0.6);

    // below-the-fold sections are built just before they scroll into view
    whenNear($('#showcase'), initShowcase);
    whenNear($('[data-families]'), buildFamilies);
    whenNear($('#bestsellers'), buildBest);
    initNewsletter();
  };

  function whenNear(el, fn) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (en) {
      if (en.some(function (e) { return e.isIntersecting; })) { io.disconnect(); fn(); initReveal(); }
    }, { rootMargin: '900px 0px' });
    io.observe(el);
  }

  function buildFamilies() {
    $('[data-families]').innerHTML = ASSAF.FAMILIES.map(function (f, i) {
      var inF = ASSAF.PRODUCTS.filter(function (x) { return x.family === f; });
      var p = inF.find(function (x) { return x.bestseller && x.available; }) || inF.find(function (x) { return x.available; }) || inF[0];
      var count = inF.length;
      return '<a class="family reveal" style="--tint:' + p.liquid[0] + ';--tint2:' + p.liquid[1] + ';--d:' + i * 80 + 'ms" href="shop.html?family=' + encodeURIComponent(f) + '">' +
        ASSAF.stage(p) +
        '<div class="family-text"><span class="eyebrow">' + count + (f === 'Gift Sets' ? ' sets' : ' fragrances') + '</span><h3>' + f + '</h3><span class="link">Explore ' + ICON.arrow + '</span></div></a>';
    }).join('');
  }

  function buildBest() {
    var best = ASSAF.PRODUCTS.filter(function (p) { return p.bestseller; });
    if (best.length < 6) best = best.concat(ASSAF.PRODUCTS.filter(function (p) { return !p.bestseller && p.available && p.family !== 'Gift Sets'; }).slice(0, 8 - best.length));
    $('[data-best]').innerHTML = best.map(function (p) { return ASSAF.card(p); }).join('');
    ASSAF.carousel($('#bestsellers'));
  }

  function initNewsletter() {
    var nf = $('#newsletter');
    if (!nf) return;
    nf.addEventListener('submit', function (e) {
      e.preventDefault();
      var em = nf.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { toast('Please enter a valid email'); return; }
      nf.innerHTML = '<p class="thanks">Thank you — you’re on the list for new launches and offers.</p>';
    });
  }

  function initShowcase() {
    var sec = $('#showcase'); if (!sec) return;
    var ids = ['arrogate-pink-200ml', 'attacks', 'edp-frankel-blue-elixir-200ml', 'promise'];
    var items = ids.map(ASSAF.getProduct).filter(Boolean);
    var stage = $('[data-show-stage]'), txt = $('[data-show-text]'), nav = $('[data-show-nav]');
    stage.innerHTML = items.map(function (p, i) {
      return '<a href="product.html?id=' + p.id + '" class="show-bottle" data-i="' + i + '" aria-label="View ' + esc(p.name) + '"><span class="plate">' + ASSAF.stage(p) + '</span></a>';
    }).join('');
    txt.innerHTML = items.map(function (p, i) {
      return '<div class="show-copy" data-i="' + i + '"><span class="eyebrow">0' + (i + 1) + ' / 0' + items.length + ' · ' + p.family + '</span>' +
        '<h2>' + esc(p.name) + '</h2><p class="lead">' + esc(p.tagline) + '</p><p' + (p.rtl ? ' dir="rtl" lang="ar"' : '') + '>' + esc(p.description.length > 230 ? p.description.slice(0, 230).replace(/\s\S*$/, '') + '…' : p.description) + '</p>' +
        (p.notes ? '<ul class="note-chips">' + p.notes.top.slice(0, 3).concat(p.notes.heart.slice(0, 1), p.notes.base.slice(0, 1)).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '<div style="height:24px"></div>') +
        '<div class="show-actions"><a class="btn btn-gold" href="product.html?id=' + p.id + '">Discover · ' + money(p.price) + '</a>' +
        (p.available ? '<button class="btn btn-ghost-light" data-add="' + p.id + '" data-size="' + firstAvail(p) + '">Add to bag</button>' : '') + '</div></div>';
    }).join('');
    nav.innerHTML = items.map(function (p, i) {
      return '<button data-i="' + i + '" style="--tint:' + p.liquid[0] + '" aria-label="Show ' + esc(p.name) + '"><span aria-hidden="true">' + esc(p.name) + '</span></button>';
    }).join('');
    sec.style.setProperty('--steps', items.length);

    var current = -1;
    function setActive(i) {
      if (i === current) return; current = i;
      var p = items[i];
      sec.style.setProperty('--show-a', p.liquid[0]); sec.style.setProperty('--show-b', p.liquid[1]);
      $$('.show-bottle', stage).forEach(function (el, k) { el.className = 'show-bottle ' + (k === i ? 'active' : k < i ? 'past' : 'next'); });
      $$('.show-copy', txt).forEach(function (el, k) { el.classList.toggle('active', k === i); });
      $$('button', nav).forEach(function (el, k) { el.classList.toggle('active', k === i); });
    }
    function onScroll() {
      var r = sec.getBoundingClientRect();
      var total = sec.offsetHeight - window.innerHeight;
      var prog = Math.min(Math.max(-r.top / total, 0), 0.9999);
      $('.show-progress span', sec).style.height = (prog * 100) + '%';
      setActive(Math.floor(prog * items.length));
    }
    window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll); onScroll();
    // tap a product name to scroll to it
    $$('button', nav).forEach(function (b) {
      b.addEventListener('click', function () {
        var i = +b.getAttribute('data-i');
        var total = sec.offsetHeight - window.innerHeight;
        var top = sec.getBoundingClientRect().top + window.scrollY + total * ((i + 0.5) / items.length);
        window.scrollTo({ top: top, behavior: 'smooth' });
      });
    });
  }

  Pages.shop = function () {
    var params = new URLSearchParams(location.search);
    var state = {
      family: params.get('family') || 'All', gender: params.get('gender') || 'All',
      sort: 'featured', q: params.get('q') || '', wish: params.get('wishlist') === '1'
    };
    ASSAF.onWishChange = function () { if (state.wish) render(); };
    var famBox = $('[data-filter-family]'), genBox = $('[data-filter-gender]');
    if (state.family !== 'All' && ASSAF.FAMILIES.indexOf(state.family) < 0) state.family = 'All';
    famBox.innerHTML = ['All'].concat(ASSAF.FAMILIES).map(function (f) { return '<button data-v="' + f + '">' + f + '</button>'; }).join('');
    genBox.innerHTML = ['All', 'Men', 'Women', 'Unisex'].map(function (f) { return '<button data-v="' + f + '">' + f + '</button>'; }).join('');
    var grid = $('[data-grid]'), countEl = $('[data-count]'), sortSel = $('#sort'), qIn = $('#shop-search');
    qIn.value = state.q;

    function render() {
      $$('button', famBox).forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-v') === state.family); });
      $$('button', genBox).forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-v') === state.gender); });
      var q = state.q.toLowerCase();
      var list = ASSAF.PRODUCTS.filter(function (p) {
        if (state.family !== 'All' && p.family !== state.family) return false;
        if (state.gender !== 'All' && p.gender !== state.gender) return false;
        if (q && ASSAF.haystack(p).indexOf(q) < 0) return false;
        if (state.wish && !Wish.has(p.id)) return false;
        return true;
      });
      if (state.sort === 'featured') list.sort(function (a, b) { return (b.available - a.available) || (b.bestseller - a.bestseller); });
      if (state.sort === 'sale') list.sort(function (a, b) { return (b.available - a.available) || ((b.compare ? 1 - b.price / b.compare : 0) - (a.compare ? 1 - a.price / a.compare : 0)); });
      if (state.sort === 'low') list.sort(function (a, b) { return a.price - b.price; });
      if (state.sort === 'high') list.sort(function (a, b) { return b.price - a.price; });
      if (state.sort === 'name') list.sort(function (a, b) { return a.name.localeCompare(b.name); });
      countEl.textContent = list.length + (list.length === 1 ? ' fragrance' : ' fragrances');
      $('[data-shop-title]').textContent = state.wish ? 'Your Wishlist' : state.family === 'Gift Sets' ? 'Gift Sets' : state.family !== 'All' ? state.family + ' Collection' : state.gender !== 'All' ? 'For ' + (state.gender === 'Men' ? 'Him' : state.gender === 'Women' ? 'Her' : 'Everyone') : 'All Fragrances';
      grid.innerHTML = list.length ? list.map(function (p, i) {
        return ASSAF.card(p, { cls: 'reveal' }).replace('class="card reveal"', 'class="card reveal" style="--d:' + (i % 4) * 70 + 'ms"');
      }).join('') : (state.wish ? '<div class="empty-state"><p>Your wishlist is empty. Tap the heart on any fragrance to save it.</p><a class="btn btn-ghost" href="shop.html">Browse fragrances</a></div>'
        : '<div class="empty-state"><p>No fragrances match these filters.</p><button class="btn btn-ghost" data-reset>Reset filters</button></div>');
      initReveal();
      var u = new URLSearchParams();
      if (state.family !== 'All') u.set('family', state.family);
      if (state.gender !== 'All') u.set('gender', state.gender);
      if (state.q) u.set('q', state.q);
      if (state.wish) u.set('wishlist', '1');
      history.replaceState(null, '', 'shop.html' + (u.toString() ? '?' + u : ''));
    }
    famBox.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { state.family = b.getAttribute('data-v'); state.wish = false; render(); } });
    genBox.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { state.gender = b.getAttribute('data-v'); render(); } });
    sortSel.addEventListener('change', function () { state.sort = sortSel.value; render(); });
    qIn.addEventListener('input', function () { state.q = qIn.value.trim(); render(); });
    grid.addEventListener('click', function (e) {
      if (e.target.closest('[data-reset]')) { state.family = 'All'; state.gender = 'All'; state.q = ''; state.wish = false; qIn.value = ''; render(); }
    });
    render();
  };

  Pages.product = function () {
    var id = new URLSearchParams(location.search).get('id');
    var p = ASSAF.getProduct(id) || ASSAF.PRODUCTS[0];
    document.title = p.name + ' — Assaf Perfumes';
    var meta = $('meta[name="description"]'); if (meta) meta.setAttribute('content', p.tagline + '. ' + (p.rtl ? '' : p.description).slice(0, 140));
    var root = $('[data-product]');
    var start = p.variants.findIndex(function (v) { return v.id === id; });
    var size = String(start > -1 ? start : firstAvail(p)), qty = 1;
    var list = ASSAF.PRODUCTS.filter(function (x) { return x.family === p.family; });
    var idx = list.indexOf(p);
    var prevP = list[(idx - 1 + list.length) % list.length];
    var nextP = list[(idx + 1) % list.length];
    var notes = p.notes;

    root.style.setProperty('--tint', p.liquid[0]); root.style.setProperty('--tint2', p.liquid[1]);
    root.innerHTML =
      '<div class="pdp-media"><div class="pdp-stage" data-pdp-img>' + ASSAF.stage(p, { variant: +size, eager: true, tilt: true }) +
      '<button class="btn pdp-3d-btn" data-view3d>' + ICON.cube + ' Unbox in 3D</button>' +
      (list.length > 1 ? '<a class="pdp-switch prev" href="product.html?id=' + prevP.id + '" aria-label="Previous: ' + esc(prevP.name) + '">‹</a>' +
      '<a class="pdp-switch next" href="product.html?id=' + nextP.id + '" aria-label="Next: ' + esc(nextP.name) + '">›</a>' : '') + '</div></div>' +
      '<div class="pdp-info">' +
      '<nav class="crumbs"><a href="index.html">Home</a> / <a href="shop.html">Shop</a> / <a href="shop.html?family=' + encodeURIComponent(p.family) + '">' + p.family + '</a></nav>' +
      (p.badge ? '<span class="badge static' + (p.available ? '' : ' muted-badge') + '">' + p.badge + '</span>' : '') +
      '<h1>' + esc(p.name) + '</h1><p class="lead">' + esc(p.tagline) + '</p>' +
      '<p class="pdp-price" data-price></p>' +
      (p.description ? '<p class="pdp-desc"' + (p.rtl ? ' dir="rtl" lang="ar"' : '') + '>' + esc(p.description) + '</p>' : '') +
      '<div class="opt"><span class="opt-label">' + (p.variants.length > 1 ? 'Choose size' : 'Size') + '</span><div class="sizes">' + p.variants.map(function (v, i) {
        return '<button data-size-opt="' + i + '"' + (v.available ? '' : ' class="unavailable"') + '>' + esc(v.label) + '<small>' + (v.available ? money(v.price) : 'Sold out') + '</small></button>';
      }).join('') + '</div></div>' +
      '<div class="buy-row"><div class="qty qty-lg"><button data-pq="-1" aria-label="Decrease">−</button><span data-pqty>1</span><button data-pq="1" aria-label="Increase">+</button></div>' +
      '<button class="btn btn-gold grow" data-buy>Add to bag</button></div>' +
      '<div class="buy-row"><button class="btn btn-ghost grow" data-buy-now>Buy it now</button>' +
      '<button class="icon-btn heart" style="width:48px;height:48px;border:1px solid var(--line-2)" data-wish="' + p.id + '" aria-pressed="' + Wish.has(p.id) + '" aria-label="Save to wishlist">' + ICON.heart + '</button></div>' +
      '<ul class="perks"><li>Free express shipping over ' + money(FREE_SHIP) + '</li><li>Gift-ready Assaf packaging</li><li>Questions? <a href="mailto:support@assaf.ae">support@assaf.ae</a></li></ul>' +
      '<div class="specs"><div><span>Collection</span><strong>' + p.family + '</strong></div><div><span>For</span><strong>' + p.gender + '</strong></div>' +
      '<div><span>Sizes</span><strong>' + p.variants.map(function (v) { return esc(v.label.split(' · ')[0]); }).join(', ') + '</strong></div><div><span>Status</span><strong>' + (p.available ? 'In stock' : 'Sold out') + '</strong></div></div>' +
      (notes ? '<div class="pyramid"><h2 class="h3">Fragrance notes</h2>' +
      [['Top', 'top'], ['Heart', 'heart'], ['Base', 'base']].filter(function (t) { return notes[t[1]].length; }).map(function (t) {
        return '<div class="tier"><span>' + t[0] + ' notes</span><p>' + notes[t[1]].map(esc).join(' · ') + '</p></div>';
      }).join('') + '</div>' : '') +
      '<details class="acc"><summary>How to wear</summary><p>Spray onto pulse points — wrists, neck and behind the ears — from about 15 cm. For a longer trail, mist lightly onto clothing.</p></details>' +
      '<details class="acc"><summary>Shipping</summary><p>Free express shipping on orders over ' + money(FREE_SHIP) + '. For delivery times, exchanges and returns, contact <a href="mailto:support@assaf.ae">support@assaf.ae</a>.</p></details>' +
      '</div>';

    var buyBtn = $('[data-buy]', root), nowBtn = $('[data-buy-now]', root);
    function upd() {
      var v = variant(p, size);
      $('[data-price]', root).innerHTML = priceHTML(v.price * qty, v.compare ? v.compare * qty : null) +
        (v.compare ? ' <span class="save">Save ' + Math.round(100 - v.price / v.compare * 100) + '%</span>' : '');
      $$('[data-size-opt]', root).forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-size-opt') === size); });
      buyBtn.disabled = nowBtn.disabled = !v.available;
      buyBtn.textContent = v.available ? 'Add to bag' : 'Sold out';
      nowBtn.hidden = !v.available;
      var sp = $('[data-sticky-price]'); if (sp) sp.textContent = money(v.price * qty);
    }
    root.addEventListener('click', function (e) {
      var s = e.target.closest('[data-size-opt]');
      if (s) {
        size = s.getAttribute('data-size-opt');
        var st = $('[data-pdp-img] .stage', root);
        if (st) st.outerHTML = ASSAF.stage(p, { variant: +size, eager: true, tilt: true });
        upd();
      }
      var q = e.target.closest('[data-pq]');
      if (q) { qty = Math.max(1, Math.min(20, qty + (+q.getAttribute('data-pq')))); $('[data-pqty]', root).textContent = qty; upd(); }
      if (e.target.closest('[data-buy]')) { Cart.add(p.id, size, qty, { from: $('.pdp-stage', root) }); }
      if (e.target.closest('[data-view3d]') && ASSAF.Unbox) ASSAF.Unbox.open(p.id, { size: +size, from: $('.pdp-stage', root) });
      if (e.target.closest('[data-buy-now]')) { Cart.add(p.id, size, qty); location.href = 'checkout.html'; }
    });

    // sticky mobile add-to-bag bar
    var sticky = $('[data-sticky-buy]');
    sticky.innerHTML = '<div class="container"><span><strong>' + esc(p.name) + '</strong><small data-sticky-price></small></span><button class="btn btn-gold" data-sticky-add>Add to bag</button></div>';
    $('[data-sticky-add]').addEventListener('click', function (e) { Cart.add(p.id, size, qty, { from: e.currentTarget }); });
    upd();
    window.addEventListener('scroll', function () {
      var r = buyBtn.getBoundingClientRect();
      sticky.classList.toggle('show', r.bottom < 0 && variant(p, size).available);
    }, { passive: true });

    // related
    var rel = ASSAF.PRODUCTS.filter(function (x) { return x.id !== p.id && x.available; })
      .sort(function (a, b) { return ((b.family === p.family) - (a.family === p.family)) || (b.bestseller - a.bestseller); }).slice(0, 10);
    $('[data-related]').innerHTML = rel.map(function (x) { return ASSAF.card(x); }).join('');
    ASSAF.carousel($('#related'));
    renderRecent(p.id);
    Recent.push(p.id);
  };

  Pages.cart = function () {
    var box = $('[data-cart-page]');
    function render() {
      if (!Cart.items.length) {
        box.innerHTML = '<div class="empty-state big"><h2>Your bag is empty</h2><p class="muted">Find a signature scent that tells your story.</p><a class="btn btn-gold" href="shop.html">Shop fragrances</a></div>';
        return;
      }
      var sub = Cart.subtotal();
      box.innerHTML = '<div class="cart-layout"><div class="cart-lines">' + Cart.items.map(function (i, idx) {
        var p = ASSAF.getProduct(i.id); if (!p) return '';
        return '<div class="line line-lg">' + boxed(p, i) +
          '<div class="line-info"><span class="eyebrow">' + p.family + '</span><a href="product.html?id=' + p.id + '"><strong>' + esc(p.name) + '</strong></a><span class="muted small">' + variant(p, i.size).label + ' · ' + money(priceFor(p, i.size)) + ' each</span>' +
          '<div class="qty" data-idx="' + idx + '"><button data-q="-1" aria-label="Decrease">−</button><span>' + i.qty + '</span><button data-q="1" aria-label="Increase">+</button></div></div>' +
          '<div class="line-price">' + money(priceFor(p, i.size) * i.qty) + '<button class="link-btn" data-remove="' + idx + '">Remove</button></div></div>';
      }).join('') + '</div>' + summaryHTML(sub, true) + '</div>';
    }
    Cart.listeners.push(render); render();
  };

  // NOTE: the delivery fee below is a placeholder — set it to match assaf.ae.
  var SHIP_FEE = 25;
  function shippingFor(sub) { return sub >= FREE_SHIP ? 0 : SHIP_FEE; }
  function summaryHTML(sub, withBtn, method, discount) {
    var ship = shippingFor(sub);
    discount = discount || 0;
    return '<aside class="summary"><h3>Order summary</h3>' +
      '<div class="row"><span>Subtotal</span><span>' + money(sub) + '</span></div>' +
      (discount ? '<div class="row accent"><span>Discount</span><span>−' + money(discount) + '</span></div>' : '') +
      '<div class="row"><span>Delivery</span><span>' + (ship ? money(ship) : 'Free') + '</span></div>' +
      '<div class="row total"><span>Total</span><span>' + money(sub - discount + ship) + '</span></div>' +
      '<p class="muted small">' + (sub >= FREE_SHIP ? 'Free express shipping applied.' : 'Free express shipping on orders over ' + money(FREE_SHIP) + '.') + '</p>' +
      (withBtn ? '<a href="checkout.html" class="btn btn-gold btn-block">Proceed to checkout</a><a href="shop.html" class="btn btn-ghost btn-block">Continue shopping</a>' : '') +
      '</aside>';
  }

  Pages.checkout = function () {
    var form = $('#checkout-form'), side = $('[data-checkout-summary]');
    var discount = 0, code = '';
    if (!Cart.items.length) {
      $('[data-checkout]').innerHTML = '<div class="empty-state big"><h2>Your bag is empty</h2><p class="muted">Add a fragrance before checking out.</p><a class="btn btn-gold" href="shop.html">Shop fragrances</a></div>';
      return;
    }
    function method() { var m = $('input[name="shipping"]:checked', form); return m ? m.value : 'standard'; }
    function render() {
      var sub = Cart.subtotal();
      discount = 0;
      side.innerHTML = '<div class="mini-lines">' + Cart.items.map(function (i) {
        var p = ASSAF.getProduct(i.id); if (!p) return '';
        return '<div class="mini">' + boxed(p, i, 'qty') +
          '<div><strong>' + esc(p.name) + '</strong><span class="muted small">' + variant(p, i.size).label + '</span></div><span>' + money(priceFor(p, i.size) * i.qty) + '</span></div>';
      }).join('') + '</div>' +
        summaryHTML(sub, false, method(), 0);
    }
    form.addEventListener('change', function (e) {
      if (e.target.name === 'shipping') render();
      if (e.target.name === 'payment') $('[data-card-fields]').hidden = e.target.value !== 'card';
    });
    Cart.listeners.push(render); render();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = true;
      $$('[required]', form).forEach(function (f) {
        if (f.closest('[hidden]')) { f.closest('.field').classList.remove('invalid'); return; }
        var valid = f.checkValidity();
        f.closest('.field').classList.toggle('invalid', !valid);
        if (!valid) ok = false;
      });
      if (!ok) { toast('Please complete the highlighted fields'); var bad = $('.field.invalid input, .field.invalid select', form); if (bad) bad.focus(); return; }
      var sub = Cart.subtotal(), ship = shippingFor(sub);
      var order = {
        no: 'AS-' + Date.now().toString().slice(-7),
        name: form.firstName.value, email: form.email.value,
        city: form.city.value, total: sub - discount + ship, items: Cart.items.slice(),
        payment: $('input[name="payment"]:checked', form).value, method: method()
      };
      store('assaf_last_order', order);
      Cart.clear();
      $('[data-checkout]').innerHTML =
        '<div class="confirm reveal in"><div class="seal">✦</div><span class="eyebrow">Order ' + order.no + '</span>' +
        '<h1>Thank you, ' + esc(order.name) + '</h1>' +
        '<p class="lead">Your order has been received.</p>' +
        '<p class="muted">A confirmation will be sent to <strong>' + esc(order.email) + '</strong>. Our team will contact you about delivery to ' + esc(order.city) + '.</p>' +
        '<div class="confirm-total">Order total: <strong>' + money(order.total) + '</strong></div>' +
        '<a href="shop.html" class="btn btn-gold">Continue shopping</a></div>';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // light input formatting for card fields
    var cn = $('#cardNumber');
    if (cn) cn.addEventListener('input', function () { cn.value = cn.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim(); });
    var ce = $('#cardExp');
    if (ce) ce.addEventListener('input', function () { var v = ce.value.replace(/\D/g, '').slice(0, 4); ce.value = v.length > 2 ? v.slice(0, 2) + '/' + v.slice(2) : v; });
  };

  Pages.contact = function () {
    var f = $('#contact-form');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = true;
      $$('[required]', f).forEach(function (x) { var v = x.checkValidity(); x.closest('.field').classList.toggle('invalid', !v); if (!v) ok = false; });
      if (!ok) { toast('Please complete the highlighted fields'); return; }
      f.innerHTML = '<div class="confirm small-confirm"><div class="seal">✦</div><h3>Message received</h3><p class="muted">Our team will get back to you soon.</p></div>';
    });
  };

  Pages.about = function () {};

  /* ---------------------------------------------------------------- boot */
  document.addEventListener('DOMContentLoaded', function () {
    buildLayout();
    Cart.render();
    Wish.render();
    if (Pages[PAGE]) Pages[PAGE]();
    initReveal();
    var pre = $('.preloader'); // (removed from the pages for faster first paint; kept for compatibility)
    if (pre) {
      var hide = function () { pre.classList.add('done'); setTimeout(function () { pre.remove(); }, 900); };
      if (document.readyState === 'complete') setTimeout(hide, 500); else window.addEventListener('load', function () { setTimeout(hide, 500); });
    }
  });
})();
