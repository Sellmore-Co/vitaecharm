/* VitaeCharm clone buy-box adapter.
   The page is a 1:1 clone of the Shopify PageFly PDP with its runtime JS stripped.
   Re-wires the static buy box to the NEXT Campaign Cart SDK:
   - tier selection (#selector-tabs a + theme .active class) + subscribe/one-time toggle
     -> NEXT package id -> add to cart -> checkout
   - prices read LIVE from the Campaigns API (useCampaignStore); written to .now / .was spans
   - re-implements PageFly accordions (Accordion + Accordion3) and the media-slider gallery */
(function () {
  'use strict';

  var CHECKOUT = '/vitaecharm/checkout/';

  // Tier -> package ids + per-each divisor (effective bottles; structural, not a price).
  // sub buy2 = 3 bottles (2 paid + 1 free offer), buy3 = 5 (3 + 2 free); one-time = qty.
  var TIERMAP = {
    1: { sub: 2,  once: 9,  divSub: 1, divOnce: 1 },
    2: { sub: 4,  once: 10, divSub: 3, divOnce: 2 },
    3: { sub: 5,  once: 11, divSub: 5, divOnce: 3 }
  };
  // Stable theme hooks (no text/structure guessing needed).
  var TIER_IDS = { 1: '#pr-single-bottle', 2: '#pr-two-bottles', 3: '#pr-three-bottles' };

  // Free gifts (DOM card order: Mitt, Collagen, Nail, Sleep) -> package id + min tier to unlock.
  // Mitt is free at 1+ bottle; the other three at 2+ bottles. Applies in both modes.
  var GIFTS = [
    { pkg: 3, minTier: 1 }, // Oil Mitt
    { pkg: 8, minTier: 2 }, // Collagen Mask
    { pkg: 7, minTier: 2 }, // Nail Oil
    { pkg: 6, minTier: 2 }  // Sleep Mask
  ];
  function unlockedGiftPkgs() {
    return GIFTS.filter(function (g) { return state.tier >= g.minTier; }).map(function (g) { return g.pkg; });
  }

  // Free Body Oil bottles bundled into the multi-buy tiers. Added as package 12
  // ("FREE Body Oil"), a dedicated one-time package the "FREE Body Oil" offer zeroes
  // to $0. Using a dedicated package (not the Buy-1 package 2) keeps the offer from
  // affecting the standalone Buy-1 purchase.
  // Buy 2, Get 1 FREE -> tier 2 -> 1 free bottle; Buy 3, Get 2 FREE -> tier 3 -> 2 free bottles.
  var FREE_BOTTLE_PKG = 12;
  var FREE_BOTTLE_QTY = { 1: 0, 2: 1, 3: 2 };

  var state = { tier: 1, mode: 'sub' };
  var tierAnchors = {};
  var atcEls = [];

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  // ---- Live prices from Campaigns API (campaignRetrieve via useCampaignStore) ----
  function pkgPrice(refId) {
    try {
      var cmp = window.NextCommerce && window.NextCommerce.useCampaignStore
        ? window.NextCommerce.useCampaignStore.getState() : null;
      if (!cmp) return null;
      var p = typeof cmp.getPackage === 'function' ? cmp.getPackage(refId) : null;
      if (!p && cmp.packages) {
        p = cmp.packages.filter(function (x) { return String(x.ref_id || x.ref || x.id) === String(refId); })[0];
      }
      if (!p) return null;
      var v = parseFloat(p.price_total != null ? p.price_total : p.price);
      return isNaN(v) ? null : v;
    } catch (e) { return null; }
  }

  function money(v) {
    if (v == null) return null;
    return '$' + (Math.round(v * 100) % 100 === 0 ? String(Math.round(v)) : v.toFixed(2));
  }

  function tierPkg(t, mode) { return TIERMAP[t][mode]; }
  function tierTotal(t, mode) { return pkgPrice(tierPkg(t, mode)); }
  function tierEach(t, mode) {
    var total = tierTotal(t, mode);
    if (total == null) return null;
    return total / ((mode === 'sub' ? TIERMAP[t].divSub : TIERMAP[t].divOnce) || 1);
  }

  function render() {
    [1, 2, 3].forEach(function (t) {
      var a = tierAnchors[t];
      if (!a) return;
      a.classList.toggle('active', state.tier === t); // theme's native selected border
      var now = a.querySelector('.now');
      var was = a.querySelector('.was');
      if (state.mode === 'sub') {
        // Subscribe & Save: dynamic sale per-each (from the API) + strikethrough compare.
        var eachStr = money(tierEach(t, 'sub'));
        if (now && eachStr) now.textContent = eachStr + '/each';
        if (was) was.style.display = '';
      } else {
        // Straight sale (one-time): per-each = the tier's standard price (the compare anchor),
        // no strikethrough. These marketing per-each figures ($38/$26/$23) live in the .was span.
        var w = was ? ((was.textContent.match(/\$[\d.,]+/) || [''])[0]) : '';
        if (now && w) now.textContent = w + '/each';
        if (was) was.style.display = 'none';
      }
    });
    var totalStr = money(tierTotal(state.tier, state.mode));
    if (totalStr) atcEls.forEach(function (a) {
      if (/\$[\d.,]+/.test(a.textContent)) a.textContent = a.textContent.replace(/\$[\d.,]+/, totalStr);
    });
    updateGifts();
  }

  // Lock/unlock the free-gift cards by selected tier (Mitt @1+, others @2+), both modes.
  function updateGifts() {
    var grid = document.querySelector('#free-gifts .free-gifts__grid');
    if (!grid) return;
    var cards = [].slice.call(grid.querySelectorAll('.gift'));
    cards.forEach(function (card, i) {
      var unlocked = state.tier >= ((GIFTS[i] && GIFTS[i].minTier) || 1);
      var price = card.querySelector('.gift__price');
      var img = card.querySelector('.gift__media img');
      var lock = card.querySelector('.gift__lock');
      // use !important to beat the theme's .is-locked CSS rules
      card.style.setProperty('opacity', unlocked ? '1' : '0.85', 'important');
      card.style.setProperty('filter', unlocked ? 'none' : 'saturate(0.7)', 'important');
      if (price) price.style.setProperty('background', unlocked ? 'rgb(69, 110, 222)' : 'rgb(184, 192, 204)', 'important');
      if (img) img.style.setProperty('opacity', unlocked ? '1' : '0', 'important');
      if (lock) {
        lock.style.setProperty('opacity', unlocked ? '0' : '1', 'important');
        lock.style.setProperty('visibility', unlocked ? 'hidden' : 'visible', 'important');
        lock.style.pointerEvents = unlocked ? 'none' : '';
      }
    });
    var fg = document.querySelector('#free-gifts');
    if (fg) { fg.classList.toggle('is-locked', state.tier < 2); fg.classList.toggle('is-unlocked', state.tier >= 2); }
  }

  // Selecting a tier (or toggling sub/once) loads that selection into the live cart so it can be
  // inspected in the debug cart before checkout. render() updates the UI; syncCart() the cart.
  function select(t) { state.tier = t; render(); syncCart(); }

  // Build the package set for the current selection, as {packageId, quantity} items:
  // main tier package, the free Body Oil bottle(s) for that tier, then unlocked free gifts.
  function selectionPkgs() {
    var items = [{ packageId: tierPkg(state.tier, state.mode), quantity: 1 }];
    var freeQty = FREE_BOTTLE_QTY[state.tier] || 0;
    // Only add the free bottle(s) if the package actually exists in the campaign data,
    // otherwise addItem() throws ("Package N not found") and breaks the whole add-to-cart.
    if (freeQty > 0 && pkgPrice(FREE_BOTTLE_PKG) != null) {
      items.push({ packageId: FREE_BOTTLE_PKG, quantity: freeQty });
    }
    unlockedGiftPkgs().forEach(function (p) { items.push({ packageId: p, quantity: 1 }); });
    return items;
  }

  function cartStore() {
    return (window.NextCommerce && typeof window.NextCommerce.useCartStore === 'function')
      ? window.NextCommerce.useCartStore.getState() : null;
  }

  // Clear the cart and add the current selection. Returns a promise.
  // syncSeq guards against rapid card clicks: a newer call supersedes an in-flight one.
  var syncSeq = 0;
  function loadCart() {
    var cs = cartStore();
    if (!cs || typeof cs.addItem !== 'function') return Promise.reject(new Error('no cart store'));
    var seq = ++syncSeq;
    var items = selectionPkgs();
    var chain = Promise.resolve(cs.clear());
    items.forEach(function (it) {
      chain = chain.then(function () {
        if (seq !== syncSeq) return;           // superseded by a newer selection
        return cartStore().addItem({ packageId: it.packageId, quantity: it.quantity });
      });
    });
    return chain;
  }

  function syncCart() { loadCart().catch(function () {}); }

  function go() {
    var items = selectionPkgs();
    var forceUrl = CHECKOUT + '?forcePackageId=' +
      items.map(function (i) { return i.packageId + ':' + i.quantity; }).join(',');
    if (!cartStore() || typeof cartStore().addItem !== 'function') { window.location.href = forceUrl; return; }
    loadCart().then(function () { window.location.href = CHECKOUT; })
              .catch(function () { window.location.href = forceUrl; });
  }

  function isATC(el) {
    var a = el && el.closest ? el.closest('a,button') : null;
    return a && (a.id === 'add-to-cart-custom' || /ADD TO CART/i.test(a.textContent || ''));
  }

  // ---- Accordions (Accordion.Header sibling-wrapper, Accordion3.Header <details>) ----
  function accordionBody(head) {
    var details = head.closest && head.closest('details');
    if (details) return details.querySelector('.pf-accordion-body') || details.querySelector('.pf-accordion-wrapper');
    var w = head.nextElementSibling;
    while (w && (w.className || '').indexOf('pf-accordion') === -1) w = w.nextElementSibling;
    return w;
  }
  function injectAccordionStyle() {
    if (document.getElementById('nx-acc-style')) return;
    var s = document.createElement('style');
    s.id = 'nx-acc-style';
    s.textContent =
      '.pf-accordion-body,.pf-accordion-wrapper{transition:height .32s ease;}' +
      '.pfa-arrow{transition:transform .3s ease;}';
    document.head.appendChild(s);
  }

  function onTransEnd(body, prop, fn) {
    function te(e) { if (e.target !== body || e.propertyName !== prop) return; body.removeEventListener('transitionend', te); fn(); }
    body.addEventListener('transitionend', te, false);
  }
  // Accordion3 bodies are CSS grids (animate grid-template-rows 0fr->1fr);
  // FAQ bodies animate their own height. Detect which.
  function isGridBody(body) {
    var cs = getComputedStyle(body);
    return cs.display === 'grid' || /grid-template-rows/.test(cs.transitionProperty);
  }

  function expandBody(body) {
    if (isGridBody(body)) {
      body.style.overflow = 'hidden';
      body.style.gridTemplateRows = '0fr';
      void body.offsetHeight;
      body.style.gridTemplateRows = '1fr';
      onTransEnd(body, 'grid-template-rows', function () { body.style.overflow = ''; });
    } else {
      body.classList.remove('pf-accordion-hide');
      body.style.display = 'block';
      body.style.overflow = 'hidden';
      body.style.height = '0px';
      void body.offsetHeight;
      body.style.height = body.scrollHeight + 'px';
      onTransEnd(body, 'height', function () { body.style.height = 'auto'; body.style.overflow = ''; });
    }
  }

  function collapseBody(body, after) {
    if (isGridBody(body)) {
      body.style.overflow = 'hidden';
      body.style.gridTemplateRows = '1fr';
      void body.offsetHeight;
      body.style.gridTemplateRows = '0fr';
      onTransEnd(body, 'grid-template-rows', function () { if (after) after(); });
    } else {
      body.style.overflow = 'hidden';
      body.style.height = body.scrollHeight + 'px';
      void body.offsetHeight;
      body.style.height = '0px';
      onTransEnd(body, 'height', function () {
        body.classList.add('pf-accordion-hide');
        body.style.height = ''; body.style.display = ''; body.style.overflow = '';
        if (after) after();
      });
    }
  }

  function toggleAccordion(head) {
    var open = head.getAttribute('data-active') === 'true';
    head.setAttribute('data-active', open ? 'false' : 'true');
    var arrow = head.querySelector('.pfa-arrow');
    if (arrow) arrow.style.transform = open ? '' : 'rotate(90deg)';
    var details = head.closest && head.closest('details');
    var body = accordionBody(head);
    if (!body) { if (details) details.open = !open; return; }
    if (open) {
      collapseBody(body, details ? function () { details.open = false; } : null);
    } else {
      if (details) details.open = true;     // mount the <details> content, then animate it open
      expandBody(body);
    }
  }

  ready(function () {
    // Tier cards via stable ids; default selection = whichever the theme marked active.
    [1, 2, 3].forEach(function (t) {
      tierAnchors[t] = document.querySelector(TIER_IDS[t]);
      if (tierAnchors[t] && tierAnchors[t].classList.contains('active')) state.tier = t;
    });
    var tabs = document.querySelector('#selector-tabs');
    if (tabs) tabs.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[id^="pr-"]');
      if (!a) return;
      e.preventDefault();
      for (var t = 1; t <= 3; t++) { if (tierAnchors[t] === a) { select(t); break; } }
    }, true);

    // Subscribe / Buy-once toggle
    var pf = document.querySelector('#__pf') || document.body;
    [].slice.call(pf.querySelectorAll('p, span, a, button, div')).forEach(function (el) {
      if (el.children.length === 0 && /BUY ONCE/i.test(el.textContent || '')) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', function (e) {
          e.preventDefault();
          state.mode = state.mode === 'sub' ? 'once' : 'sub';
          el.textContent = state.mode === 'once' ? 'SUBSCRIBE & SAVE →' : 'BUY ONCE - NO SAVINGS →';
          render();
          syncCart();
        }, true);
      }
    });

    // Accordions
    injectAccordionStyle();
    document.addEventListener('click', function (e) {
      var head = e.target.closest && e.target.closest('[data-pf-type="Accordion.Header"], [data-pf-type="Accordion3.Header"]');
      if (!head) return;
      e.preventDefault();
      toggleAccordion(head);
    }, true);

    // Product gallery — PageFly media slider (main scroll-track + thumbnail strip)
    (function setupGallery() {
      var sliders = [].slice.call(document.querySelectorAll('.pf-media-slider'));
      if (!sliders.length) return;
      var main = sliders[0];
      var slides = [].slice.call(main.querySelectorAll('.pf-slide-main-media'));
      if (slides.length < 2) return;
      var thumbs = sliders[1] ? [].slice.call(sliders[1].querySelectorAll('.pf-slide-list-media')) : [];
      function curIndex() {
        var sl = main.scrollLeft, best = 0, bestD = Infinity;
        slides.forEach(function (s, i) { var d = Math.abs(s.offsetLeft - sl); if (d < bestD) { bestD = d; best = i; } });
        return best;
      }
      function goTo(i) {
        i = Math.max(0, Math.min(slides.length - 1, i));
        main.scrollTo({ left: slides[i].offsetLeft, behavior: 'smooth' });
        thumbs.forEach(function (t, j) { t.classList.toggle('active', j === i); });
      }
      var prev = main.querySelector('.pf-slider-prev'), next = main.querySelector('.pf-slider-next');
      if (prev) prev.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); goTo(curIndex() - 1); }, true);
      if (next) next.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); goTo(curIndex() + 1); }, true);
      thumbs.forEach(function (t, i) { t.style.cursor = 'pointer'; t.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); goTo(i); }, true); });
      var raf;
      main.addEventListener('scroll', function () {
        if (raf) return;
        raf = requestAnimationFrame(function () { raf = null; var i = curIndex(); thumbs.forEach(function (t, j) { t.classList.toggle('active', j === i); }); });
      }, { passive: true });
      goTo(0);
    })();

    // Content carousels (Natural 9 Oils, Before & Afters reviews) — generic .pf-slider tracks
    // whose PageFly slider JS was stripped. Wire prev/next arrows, pagination dots, and scroll.
    // "Natural 9 Oils": nav+buttons are inside the .pf-slider.pf-c-ct container.
    // "Before & Afters": .pf-slider.scrollfix is only the scroll track — nav+buttons are siblings
    // inside the parent element, so we fall back to parentElement for the lookup.
    [].slice.call(document.querySelectorAll('.pf-slider')).forEach(function (track) {
      var slides = [].slice.call(track.children).filter(function (c) { return c.classList.contains('pf-slide'); });
      if (slides.length < 2) return;
      var scope = track.parentElement || track;
      var nav  = track.querySelector('.pf-slider-nav')   || scope.querySelector('.pf-slider-nav');
      var prev = track.querySelector('.pf-slider-prev')  || scope.querySelector('.pf-slider-prev');
      var next = track.querySelector('.pf-slider-next')  || scope.querySelector('.pf-slider-next');
      var dots = nav ? [].slice.call(nav.querySelectorAll('button')) : [];
      function cur() {
        var sl = track.scrollLeft, b = 0, bd = Infinity;
        slides.forEach(function (s, i) { var d = Math.abs(s.offsetLeft - track.offsetLeft - sl); if (d < bd) { bd = d; b = i; } });
        return b;
      }
      function updateUI(i) {
        if (prev) prev.style.visibility = i <= 0 ? 'hidden' : '';
        if (next) next.style.visibility = i >= slides.length - 1 ? 'hidden' : '';
        dots.forEach(function (d, j) { d.classList.toggle('active', j === i); });
      }
      var scrollingTo = -1, scrollLockTimer;
      function go(i) {
        i = Math.max(0, Math.min(slides.length - 1, i));
        scrollingTo = i;
        clearTimeout(scrollLockTimer);
        track.scrollTo({ left: slides[i].offsetLeft - track.offsetLeft, behavior: 'smooth' });
        updateUI(i);
        scrollLockTimer = setTimeout(function () { scrollingTo = -1; }, 600);
      }
      if (prev) prev.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); go(cur() - 1); }, true);
      if (next) next.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); go(cur() + 1); }, true);
      dots.forEach(function (d, i) { d.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); go(i); }, true); });
      var raf;
      track.addEventListener('scroll', function () {
        if (scrollingTo >= 0) return;
        if (raf) return;
        raf = requestAnimationFrame(function () { raf = null; updateUI(cur()); });
      }, { passive: true });
      updateUI(0);
    });

    // ADD TO CART — stable id first, text fallback
    atcEls = [].slice.call(document.querySelectorAll('#add-to-cart-custom, [id^="add-to-cart"]'));
    [].slice.call(document.querySelectorAll('a, button')).forEach(function (e) {
      if (/ADD TO CART/i.test(e.textContent || '') && atcEls.indexOf(e) === -1) atcEls.push(e);
    });
    atcEls.forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); go(); }, true);
    });

    // Render now, and again once the campaign store has loaded live prices.
    render();
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (pkgPrice(TIERMAP[2].sub) != null) { render(); clearInterval(iv); }
      else if (tries > 50) clearInterval(iv);
    }, 100);
  });
})();
