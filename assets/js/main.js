/* ASSAF — shared site behaviour: layout, cart, search, animations, page controllers. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var PAGE = document.body.getAttribute('data-page');

  /* ---------------------------------------------------------------- helpers */
  function money(v) {
    return ASSAF.CURRENCY + ' ' + Math.round(v).toLocaleString('en-US');
  }
  function sizeInfo(id) {
    return ASSAF.SIZES.find(function (s) { return s.id === id; }) || ASSAF.SIZES[0];
  }
  function priceFor(p, sizeId) { return p.price * sizeInfo(sizeId).mult; }
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

  /* ---------------------------------------------------------------- cart */
  var Cart = {
    items: store('assaf_cart') || [],
    save: function () { store('assaf_cart', this.items); this.render(); },
    count: function () { return this.items.reduce(function (n, i) { return n + i.qty; }, 0); },
    subtotal: function () {
      return this.items.reduce(function (t, i) {
        var p = ASSAF.getProduct(i.id); return p ? t + priceFor(p, i.size) * i.qty : t;
      }, 0);
    },
    add: function (id, size, qty) {
      size = size || ASSAF.SIZES[0].id; qty = qty || 1;
      var line = this.items.find(function (i) { return i.id === id && i.size === size; });
      if (line) line.qty = Math.min(line.qty + qty, 20); else this.items.push({ id: id, size: size, qty: qty });
      this.save();
      var p = ASSAF.getProduct(id);
      toast((p ? p.name : 'Item') + ' added to your bag');
      bump();
    },
    setQty: function (idx, qty) {
      if (qty <= 0) this.items.splice(idx, 1); else this.items[idx].qty = Math.min(qty, 20);
      this.save();
    },
    clear: function () { this.items = []; this.save(); },
    listeners: [],
    render: function () {
      $$('[data-cart-count]').forEach(function (el) {
        var c = Cart.count(); el.textContent = c; el.classList.toggle('is-empty', c === 0);
      });
      renderDrawer();
      this.listeners.forEach(function (fn) { fn(); });
    }
  };
  ASSAF.Cart = Cart;

  function bump() {
    $$('.cart-btn').forEach(function (b) {
      b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
    });
  }

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
    bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 13H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
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
      ['index.html', 'Home', 'home'], ['shop.html', 'Shop', 'shop'],
      ['shop.html?family=Oud', 'Oud', ''], ['about.html', 'Our Story', 'about'], ['contact.html', 'Contact', 'contact']
    ];
    var links = nav.map(function (n) {
      return '<a href="' + n[0] + '"' + (n[2] && n[2] === PAGE ? ' aria-current="page"' : '') + '>' + n[1] + '</a>';
    }).join('');

    var header = document.createElement('header');
    header.className = 'site-header' + (document.body.hasAttribute('data-solid-header') ? ' is-solid' : '');
    header.innerHTML =
      '<div class="announce"><div class="announce-track">' +
      '<span>Complimentary delivery across the Kingdom on orders over SAR 400</span><span>✦</span>' +
      '<span>Free sample with every order</span><span>✦</span><span>Gift wrapping available at checkout</span><span>✦</span>' +
      '<span>Complimentary delivery across the Kingdom on orders over SAR 400</span><span>✦</span>' +
      '<span>Free sample with every order</span><span>✦</span><span>Gift wrapping available at checkout</span><span>✦</span>' +
      '</div></div>' +
      '<div class="header-bar container">' +
      '<button class="icon-btn burger" aria-label="Open menu" aria-expanded="false"><span></span><span></span></button>' +
      '<nav class="main-nav" aria-label="Main">' + links + '</nav>' +
      '<a href="index.html" class="logo" aria-label="Assaf home">ASSAF<small>PARFUMS</small></a>' +
      '<div class="header-actions">' +
      '<button class="icon-btn" data-open-search aria-label="Search">' + ICON.search + '</button>' +
      '<button class="icon-btn cart-btn" data-open-cart aria-label="Open bag">' + ICON.bag + '<span class="cart-count is-empty" data-cart-count>0</span></button>' +
      '</div></div>';
    document.body.prepend(header);

    var mobile = document.createElement('div');
    mobile.className = 'mobile-nav'; mobile.id = 'mobile-nav';
    mobile.innerHTML = '<nav aria-label="Mobile">' + links + '</nav><p class="mobile-nav-foot">Crafted in the Kingdom of Saudi Arabia</p>';
    document.body.appendChild(mobile);

    var drawer = document.createElement('aside');
    drawer.className = 'drawer'; drawer.id = 'cart-drawer'; drawer.setAttribute('aria-label', 'Shopping bag');
    drawer.innerHTML =
      '<div class="drawer-head"><h3>Your Bag <span data-cart-count>0</span></h3><button class="icon-btn" data-close-cart aria-label="Close bag">' + ICON.close + '</button></div>' +
      '<div class="ship-meter"><p data-ship-msg></p><div class="meter"><span data-ship-bar></span></div></div>' +
      '<div class="drawer-body" data-drawer-items></div>' +
      '<div class="drawer-foot"><div class="row"><span>Subtotal</span><strong data-drawer-subtotal>SAR 0</strong></div>' +
      '<p class="muted small">Taxes included. Shipping calculated at checkout.</p>' +
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
      '<div class="footer-brand"><a href="index.html" class="logo">ASSAF<small>PARFUMS</small></a>' +
      '<p>Rare ingredients, Arabian heritage and modern perfumery — composed to be remembered.</p>' +
      '<div class="socials"><a href="#" aria-label="Instagram">' + ICON.ig + '</a><a href="#" aria-label="TikTok">' + ICON.tt + '</a><a href="#" aria-label="X">' + ICON.x + '</a><a href="#" aria-label="WhatsApp">' + ICON.wa + '</a></div></div>' +
      '<div><h4>Shop</h4><a href="shop.html">All fragrances</a><a href="shop.html?gender=Men">For him</a><a href="shop.html?gender=Women">For her</a><a href="shop.html?gender=Unisex">Unisex</a></div>' +
      '<div><h4>Families</h4>' + ASSAF.FAMILIES.map(function (f) { return '<a href="shop.html?family=' + f + '">' + f + '</a>'; }).join('') + '</div>' +
      '<div><h4>House</h4><a href="about.html">Our story</a><a href="contact.html">Contact</a><a href="contact.html#faq">Shipping &amp; returns</a><a href="contact.html#faq">FAQ</a></div>' +
      '</div>' +
      '<div class="container footer-bottom"><span>© ' + new Date().getFullYear() + ' Assaf Parfums. All rights reserved.</span>' +
      '<span class="pay">Mada · Visa · Mastercard · Apple Pay · Cash on delivery</span></div>';
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
    scrim.addEventListener('click', closeAll);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });

    $('#search input').addEventListener('input', function (e) { renderSearch(e.target.value); });
    renderSearch('');

    var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 40); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  function openCart() { closeAll(); document.body.classList.add('cart-open'); }
  function openSearch() {
    closeAll(); document.body.classList.add('search-open');
    setTimeout(function () { $('#search input').focus(); }, 200);
  }
  function closeAll() {
    document.body.classList.remove('cart-open', 'search-open', 'nav-open');
    var b = $('.burger'); if (b) b.setAttribute('aria-expanded', 'false');
  }
  ASSAF.openCart = openCart;

  function renderSearch(q) {
    var box = $('[data-search-results]'); if (!box) return;
    q = q.trim().toLowerCase();
    var list = ASSAF.PRODUCTS.filter(function (p) {
      if (!q) return true;
      var hay = [p.name, p.family, p.gender, p.tagline].concat(p.notes.top, p.notes.heart, p.notes.base).join(' ').toLowerCase();
      return hay.indexOf(q) > -1;
    });
    box.innerHTML = list.length ? list.slice(0, 8).map(function (p) {
      return '<a class="search-item" href="product.html?id=' + p.id + '"><div class="search-thumb" style="--tint:' + p.liquid[0] + '">' + ASSAF.bottle(p, { shadow: false }) + '</div>' +
        '<div><strong>' + esc(p.name) + '</strong><span>' + p.family + ' · ' + money(p.price) + '</span></div></a>';
    }).join('') : '<p class="muted">No fragrance matches “' + esc(q) + '”. Try “oud”, “rose” or “musk”.</p>';
  }

  var FREE_SHIP = 400;
  ASSAF.FREE_SHIP = FREE_SHIP;
  function renderDrawer() {
    var box = $('[data-drawer-items]'); if (!box) return;
    var sub = Cart.subtotal();
    if (!Cart.items.length) {
      box.innerHTML = '<div class="empty"><p>Your bag is empty.</p><a href="shop.html" class="btn btn-ghost">Discover fragrances</a></div>';
    } else {
      box.innerHTML = Cart.items.map(function (i, idx) {
        var p = ASSAF.getProduct(i.id); if (!p) return '';
        return '<div class="line"><a href="product.html?id=' + p.id + '" class="line-thumb" style="--tint:' + p.liquid[0] + '">' + ASSAF.bottle(p, { shadow: false }) + '</a>' +
          '<div class="line-info"><a href="product.html?id=' + p.id + '"><strong>' + esc(p.name) + '</strong></a><span class="muted small">' + sizeInfo(i.size).label + ' · Eau de Parfum</span>' +
          '<div class="qty" data-idx="' + idx + '"><button data-q="-1" aria-label="Decrease">−</button><span>' + i.qty + '</span><button data-q="1" aria-label="Increase">+</button></div></div>' +
          '<div class="line-price">' + money(priceFor(p, i.size) * i.qty) + '<button class="link-btn" data-remove="' + idx + '">Remove</button></div></div>';
      }).join('');
    }
    $('[data-drawer-subtotal]').textContent = money(sub);
    var left = FREE_SHIP - sub;
    $('[data-ship-msg]').innerHTML = left > 0 ? 'You are <strong>' + money(left) + '</strong> away from free delivery' : 'You have unlocked <strong>free delivery</strong> ✦';
    $('[data-ship-bar]').style.width = Math.min(100, (sub / FREE_SHIP) * 100) + '%';
    $('[data-checkout-link]').classList.toggle('is-disabled', !Cart.items.length);
  }

  // delegated cart line controls (drawer + cart page)
  document.addEventListener('click', function (e) {
    var q = e.target.closest('.qty button[data-q]');
    if (q) {
      var idx = +q.parentNode.getAttribute('data-idx');
      Cart.setQty(idx, Cart.items[idx].qty + (+q.getAttribute('data-q')));
      return;
    }
    var r = e.target.closest('[data-remove]');
    if (r) { Cart.setQty(+r.getAttribute('data-remove'), 0); return; }
    var add = e.target.closest('[data-add]');
    if (add) { e.preventDefault(); Cart.add(add.getAttribute('data-add'), add.getAttribute('data-size')); }
  });

  /* ---------------------------------------------------------------- product card */
  ASSAF.card = function (p, opts) {
    opts = opts || {};
    return '<article class="card' + (opts.cls ? ' ' + opts.cls : '') + '">' +
      '<a class="card-media" href="product.html?id=' + p.id + '" style="--tint:' + p.liquid[0] + ';--tint2:' + p.liquid[1] + '" draggable="false">' +
      (p.badge ? '<span class="badge">' + p.badge + '</span>' : '') +
      '<div class="card-bottle">' + ASSAF.bottle(p) + '</div>' +
      '<span class="card-view">View fragrance ' + ICON.arrow + '</span></a>' +
      '<div class="card-body"><div><span class="eyebrow">' + p.family + ' · ' + p.gender + '</span>' +
      '<h3><a href="product.html?id=' + p.id + '" draggable="false">' + esc(p.name) + '</a></h3>' +
      '<span class="price">' + money(p.price) + '</span></div>' +
      '<button class="add-btn" data-add="' + p.id + '" aria-label="Add ' + esc(p.name) + ' to bag">+</button></div></article>';
  };

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
    var hero = ASSAF.getProduct('oud-royale');
    $('[data-hero-bottle]').innerHTML = ASSAF.bottle(hero);
    // parallax on hero
    var heroEl = $('.hero');
    var heroB = $('.hero-bottle');
    heroEl.addEventListener('pointermove', function (e) {
      var r = heroEl.getBoundingClientRect();
      var dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
      heroB.style.transform = 'rotateY(' + dx * 18 + 'deg) rotateX(' + -dy * 10 + 'deg)';
    });
    heroEl.addEventListener('pointerleave', function () { heroB.style.transform = ''; });

    // moving product marquee (tap any bottle to open it)
    var track = $('[data-marquee]');
    var html = ASSAF.PRODUCTS.map(function (p) { return ASSAF.card(p, { cls: 'card-marquee' }); }).join('');
    track.innerHTML = html + html;
    ASSAF.marquee(track, 0.6);

    // scroll-driven showcase
    initShowcase();

    // families
    $('[data-families]').innerHTML = ASSAF.FAMILIES.map(function (f, i) {
      var p = ASSAF.PRODUCTS.find(function (x) { return x.family === f; });
      var count = ASSAF.PRODUCTS.filter(function (x) { return x.family === f; }).length;
      return '<a class="family reveal" style="--tint:' + p.liquid[0] + ';--tint2:' + p.liquid[1] + ';--d:' + i * 80 + 'ms" href="shop.html?family=' + f + '">' +
        '<div class="family-bottle">' + ASSAF.bottle(p, { shadow: false }) + '</div>' +
        '<div class="family-text"><span class="eyebrow">' + count + ' fragrances</span><h3>' + f + '</h3><span class="link">Explore ' + ICON.arrow + '</span></div></a>';
    }).join('');

    // bestsellers carousel
    var best = ASSAF.PRODUCTS.filter(function (p) { return p.badge === 'Bestseller' || p.intensity >= 4; });
    $('[data-best]').innerHTML = best.map(function (p) { return ASSAF.card(p); }).join('');
    ASSAF.carousel($('#bestsellers'));

    // testimonials
    var slides = $$('.quote');
    var dots = $('.quote-dots');
    var qi = 0;
    dots.innerHTML = slides.map(function (_, i) { return '<button aria-label="Show review ' + (i + 1) + '"></button>'; }).join('');
    function showQ(i) {
      qi = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle('active', k === qi); });
      $$('button', dots).forEach(function (d, k) { d.classList.toggle('active', k === qi); });
    }
    $$('button', dots).forEach(function (d, k) { d.addEventListener('click', function () { showQ(k); restart(); }); });
    var qt; function restart() { clearInterval(qt); qt = setInterval(function () { showQ(qi + 1); }, 5000); }
    showQ(0); restart();

    // newsletter
    var nf = $('#newsletter');
    nf.addEventListener('submit', function (e) {
      e.preventDefault();
      var em = nf.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { toast('Please enter a valid email'); return; }
      nf.innerHTML = '<p class="thanks">Welcome to the House of Assaf. Your 10% code: <strong>ASSAF10</strong></p>';
    });
  };

  function initShowcase() {
    var sec = $('#showcase'); if (!sec) return;
    var ids = ['oud-royale', 'rose-de-taif', 'midnight-bakhoor', 'citrus-majlis'];
    var items = ids.map(ASSAF.getProduct);
    var stage = $('[data-show-stage]'), txt = $('[data-show-text]'), nav = $('[data-show-nav]');
    stage.innerHTML = items.map(function (p, i) {
      return '<a href="product.html?id=' + p.id + '" class="show-bottle" data-i="' + i + '" aria-label="View ' + esc(p.name) + '">' + ASSAF.bottle(p) + '</a>';
    }).join('');
    txt.innerHTML = items.map(function (p, i) {
      return '<div class="show-copy" data-i="' + i + '"><span class="eyebrow">0' + (i + 1) + ' / 0' + items.length + ' · ' + p.family + '</span>' +
        '<h2>' + esc(p.name) + '</h2><p class="lead">' + esc(p.tagline) + '</p><p>' + esc(p.description) + '</p>' +
        '<ul class="note-chips">' + p.notes.top.concat(p.notes.heart.slice(0, 1), p.notes.base.slice(0, 1)).map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul>' +
        '<div class="show-actions"><a class="btn btn-gold" href="product.html?id=' + p.id + '">Discover · ' + money(p.price) + '</a>' +
        '<button class="btn btn-ghost-light" data-add="' + p.id + '">Add to bag</button></div></div>';
    }).join('');
    nav.innerHTML = items.map(function (p, i) {
      return '<button data-i="' + i + '" style="--tint:' + p.liquid[0] + '"><span>' + esc(p.name) + '</span></button>';
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
      sort: 'featured', q: params.get('q') || ''
    };
    var famBox = $('[data-filter-family]'), genBox = $('[data-filter-gender]');
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
        if (q) {
          var hay = [p.name, p.family, p.tagline].concat(p.notes.top, p.notes.heart, p.notes.base).join(' ').toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        return true;
      });
      if (state.sort === 'low') list.sort(function (a, b) { return a.price - b.price; });
      if (state.sort === 'high') list.sort(function (a, b) { return b.price - a.price; });
      if (state.sort === 'name') list.sort(function (a, b) { return a.name.localeCompare(b.name); });
      countEl.textContent = list.length + (list.length === 1 ? ' fragrance' : ' fragrances');
      $('[data-shop-title]').textContent = state.family !== 'All' ? state.family + ' Collection' : state.gender !== 'All' ? 'For ' + (state.gender === 'Men' ? 'Him' : state.gender === 'Women' ? 'Her' : 'Everyone') : 'All Fragrances';
      grid.innerHTML = list.length ? list.map(function (p, i) {
        return ASSAF.card(p, { cls: 'reveal' }).replace('class="card reveal"', 'class="card reveal" style="--d:' + (i % 4) * 70 + 'ms"');
      }).join('') : '<div class="empty-state"><p>No fragrances match these filters.</p><button class="btn btn-ghost" data-reset>Reset filters</button></div>';
      initReveal();
      var u = new URLSearchParams();
      if (state.family !== 'All') u.set('family', state.family);
      if (state.gender !== 'All') u.set('gender', state.gender);
      if (state.q) u.set('q', state.q);
      history.replaceState(null, '', 'shop.html' + (u.toString() ? '?' + u : ''));
    }
    famBox.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { state.family = b.getAttribute('data-v'); render(); } });
    genBox.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { state.gender = b.getAttribute('data-v'); render(); } });
    sortSel.addEventListener('change', function () { state.sort = sortSel.value; render(); });
    qIn.addEventListener('input', function () { state.q = qIn.value.trim(); render(); });
    grid.addEventListener('click', function (e) {
      if (e.target.closest('[data-reset]')) { state.family = 'All'; state.gender = 'All'; state.q = ''; qIn.value = ''; render(); }
    });
    render();
  };

  Pages.product = function () {
    var id = new URLSearchParams(location.search).get('id');
    var p = ASSAF.getProduct(id) || ASSAF.PRODUCTS[0];
    document.title = p.name + ' — Assaf Parfums';
    var meta = $('meta[name="description"]'); if (meta) meta.setAttribute('content', p.description);
    var root = $('[data-product]');
    var size = ASSAF.SIZES[0].id, qty = 1;
    var idx = ASSAF.PRODUCTS.indexOf(p);
    var prevP = ASSAF.PRODUCTS[(idx - 1 + ASSAF.PRODUCTS.length) % ASSAF.PRODUCTS.length];
    var nextP = ASSAF.PRODUCTS[(idx + 1) % ASSAF.PRODUCTS.length];

    root.style.setProperty('--tint', p.liquid[0]); root.style.setProperty('--tint2', p.liquid[1]);
    root.innerHTML =
      '<div class="pdp-media"><div class="pdp-stage"><div class="pdp-bottle">' + ASSAF.bottle(p) + '</div>' +
      '<a class="pdp-switch prev" href="product.html?id=' + prevP.id + '" aria-label="Previous: ' + esc(prevP.name) + '">‹</a>' +
      '<a class="pdp-switch next" href="product.html?id=' + nextP.id + '" aria-label="Next: ' + esc(nextP.name) + '">›</a></div></div>' +
      '<div class="pdp-info">' +
      '<nav class="crumbs"><a href="index.html">Home</a> / <a href="shop.html">Shop</a> / <a href="shop.html?family=' + p.family + '">' + p.family + '</a></nav>' +
      (p.badge ? '<span class="badge static">' + p.badge + '</span>' : '') +
      '<h1>' + esc(p.name) + '</h1><p class="lead">' + esc(p.tagline) + '</p>' +
      '<p class="pdp-price" data-price>' + money(p.price) + '</p>' +
      '<p>' + esc(p.description) + '</p>' +
      '<div class="opt"><span class="opt-label">Size</span><div class="sizes">' + ASSAF.SIZES.map(function (s, i) {
        return '<button data-size-opt="' + s.id + '"' + (i === 0 ? ' class="active"' : '') + '>' + s.label + '<small>' + money(p.price * s.mult) + '</small></button>';
      }).join('') + '</div></div>' +
      '<div class="buy-row"><div class="qty qty-lg"><button data-pq="-1" aria-label="Decrease">−</button><span data-pqty>1</span><button data-pq="1" aria-label="Increase">+</button></div>' +
      '<button class="btn btn-gold grow" data-buy>Add to bag</button></div>' +
      '<button class="btn btn-ghost btn-block" data-buy-now>Buy it now</button>' +
      '<ul class="perks"><li>Free delivery over ' + money(FREE_SHIP) + '</li><li>Complimentary sample &amp; gift wrap</li><li>14-day returns on unopened bottles</li></ul>' +
      '<div class="specs"><div><span>Family</span><strong>' + p.family + '</strong></div><div><span>For</span><strong>' + p.gender + '</strong></div>' +
      '<div><span>Longevity</span><strong>' + p.longevity + '</strong></div><div><span>Intensity</span><strong class="dots">' +
      [1, 2, 3, 4, 5].map(function (n) { return '<i class="' + (n <= p.intensity ? 'on' : '') + '"></i>'; }).join('') + '</strong></div></div>' +
      '<div class="pyramid"><h3>Olfactory pyramid</h3>' +
      [['Top', 'top'], ['Heart', 'heart'], ['Base', 'base']].map(function (t) {
        return '<div class="tier"><span>' + t[0] + ' notes</span><p>' + p.notes[t[1]].join(' · ') + '</p></div>';
      }).join('') + '</div>' +
      '<details class="acc"><summary>How to wear</summary><p>Apply to pulse points — wrists, neck and behind the ears — from 15 cm. For a longer trail, mist onto clothing or layer with a matching Assaf oil.</p></details>' +
      '<details class="acc"><summary>Delivery &amp; returns</summary><p>Riyadh, Jeddah and Dammam: 1–2 business days. Rest of KSA: 2–4 days. GCC: 3–6 days. Unopened bottles can be returned within 14 days.</p></details>' +
      '<details class="acc"><summary>Ingredients</summary><p>Alcohol Denat., Parfum (Fragrance), Aqua (Water). Concentration: Eau de Parfum, 20%.</p></details>' +
      '</div>';

    function updPrice() { $('[data-price]', root).textContent = money(priceFor(p, size) * qty); }
    root.addEventListener('click', function (e) {
      var s = e.target.closest('[data-size-opt]');
      if (s) { size = s.getAttribute('data-size-opt'); $$('[data-size-opt]', root).forEach(function (b) { b.classList.toggle('active', b === s); }); updPrice(); }
      var q = e.target.closest('[data-pq]');
      if (q) { qty = Math.max(1, Math.min(20, qty + (+q.getAttribute('data-pq')))); $('[data-pqty]', root).textContent = qty; updPrice(); }
      if (e.target.closest('[data-buy]')) { Cart.add(p.id, size, qty); openCart(); }
      if (e.target.closest('[data-buy-now]')) { Cart.add(p.id, size, qty); location.href = 'checkout.html'; }
    });

    // sticky mobile add-to-bag bar
    var sticky = $('[data-sticky-buy]');
    sticky.innerHTML = '<div class="container"><span><strong>' + esc(p.name) + '</strong><small data-sticky-price>' + money(p.price) + '</small></span><button class="btn btn-gold" data-sticky-add>Add to bag</button></div>';
    $('[data-sticky-add]').addEventListener('click', function () { Cart.add(p.id, size, qty); });
    var buyBtn = $('[data-buy]', root);
    window.addEventListener('scroll', function () {
      var r = buyBtn.getBoundingClientRect();
      sticky.classList.toggle('show', r.bottom < 0);
      $('[data-sticky-price]').textContent = money(priceFor(p, size) * qty);
    }, { passive: true });

    // related
    var rel = ASSAF.PRODUCTS.filter(function (x) { return x.id !== p.id; })
      .sort(function (a, b) { return (b.family === p.family) - (a.family === p.family); }).slice(0, 8);
    $('[data-related]').innerHTML = rel.map(function (x) { return ASSAF.card(x); }).join('');
    ASSAF.carousel($('#related'));
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
        return '<div class="line line-lg"><a href="product.html?id=' + p.id + '" class="line-thumb" style="--tint:' + p.liquid[0] + '">' + ASSAF.bottle(p, { shadow: false }) + '</a>' +
          '<div class="line-info"><span class="eyebrow">' + p.family + '</span><a href="product.html?id=' + p.id + '"><strong>' + esc(p.name) + '</strong></a><span class="muted small">' + sizeInfo(i.size).label + ' · ' + money(priceFor(p, i.size)) + ' each</span>' +
          '<div class="qty" data-idx="' + idx + '"><button data-q="-1" aria-label="Decrease">−</button><span>' + i.qty + '</span><button data-q="1" aria-label="Increase">+</button></div></div>' +
          '<div class="line-price">' + money(priceFor(p, i.size) * i.qty) + '<button class="link-btn" data-remove="' + idx + '">Remove</button></div></div>';
      }).join('') + '</div>' + summaryHTML(sub, true) + '</div>';
    }
    Cart.listeners.push(render); render();
  };

  function shippingFor(sub, method) {
    if (method === 'express') return 45;
    return sub >= FREE_SHIP ? 0 : 25;
  }
  function summaryHTML(sub, withBtn, method, discount) {
    var ship = shippingFor(sub, method || 'standard');
    discount = discount || 0;
    return '<aside class="summary"><h3>Order summary</h3>' +
      '<div class="row"><span>Subtotal</span><span>' + money(sub) + '</span></div>' +
      (discount ? '<div class="row accent"><span>Discount</span><span>−' + money(discount) + '</span></div>' : '') +
      '<div class="row"><span>Delivery</span><span>' + (ship ? money(ship) : 'Free') + '</span></div>' +
      '<div class="row total"><span>Total</span><span>' + money(sub - discount + ship) + '</span></div>' +
      '<p class="muted small">Prices include 15% VAT.</p>' +
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
      discount = code === 'ASSAF10' ? Math.round(sub * 0.1) : 0;
      side.innerHTML = '<div class="mini-lines">' + Cart.items.map(function (i) {
        var p = ASSAF.getProduct(i.id); if (!p) return '';
        return '<div class="mini"><div class="line-thumb sm" style="--tint:' + p.liquid[0] + '">' + ASSAF.bottle(p, { shadow: false }) + '<b>' + i.qty + '</b></div>' +
          '<div><strong>' + esc(p.name) + '</strong><span class="muted small">' + sizeInfo(i.size).label + '</span></div><span>' + money(priceFor(p, i.size) * i.qty) + '</span></div>';
      }).join('') + '</div>' +
        '<div class="promo"><input id="promo" placeholder="Gift card or discount code" value="' + esc(code) + '"/><button type="button" class="btn btn-ghost" data-apply>Apply</button></div>' +
        summaryHTML(sub, false, method(), discount);
    }
    side.addEventListener('click', function (e) {
      if (e.target.closest('[data-apply]')) {
        var v = $('#promo').value.trim().toUpperCase();
        if (v === 'ASSAF10') { code = v; toast('Code applied — 10% off'); } else { code = ''; toast('That code is not valid'); }
        render();
      }
    });
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
      var sub = Cart.subtotal(), ship = shippingFor(sub, method());
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
        '<p class="lead">Your order is confirmed and is being prepared with care in our atelier.</p>' +
        '<p class="muted">A confirmation will be sent to <strong>' + esc(order.email) + '</strong>. Estimated delivery to ' + esc(order.city) + ': ' +
        (order.method === 'express' ? '1–2' : '2–4') + ' business days.</p>' +
        '<div class="confirm-total">Total paid ' + (order.payment === 'cod' ? '(on delivery)' : '') + ': <strong>' + money(order.total) + '</strong></div>' +
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
      f.innerHTML = '<div class="confirm small-confirm"><div class="seal">✦</div><h3>Message received</h3><p class="muted">Our concierge will reply within one business day.</p></div>';
    });
  };

  Pages.about = function () {};

  /* ---------------------------------------------------------------- boot */
  document.addEventListener('DOMContentLoaded', function () {
    buildLayout();
    Cart.render();
    if (Pages[PAGE]) Pages[PAGE]();
    initReveal();
    var pre = $('.preloader');
    if (pre) {
      var hide = function () { pre.classList.add('done'); setTimeout(function () { pre.remove(); }, 900); };
      if (document.readyState === 'complete') setTimeout(hide, 500); else window.addEventListener('load', function () { setTimeout(hide, 500); });
    }
  });
})();
