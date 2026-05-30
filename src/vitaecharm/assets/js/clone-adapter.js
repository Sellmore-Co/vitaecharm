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
      var eachStr = money(tierEach(t, state.mode));
      if (now && eachStr) now.textContent = eachStr + '/each';
      // Compare price only applies to Subscribe & Save; one-time = "NO SAVINGS".
      if (was) was.style.display = (state.mode === 'sub') ? '' : 'none';
    });
    var totalStr = money(tierTotal(state.tier, state.mode));
    if (totalStr) atcEls.forEach(function (a) {
      if (/\$[\d.,]+/.test(a.textContent)) a.textContent = a.textContent.replace(/\$[\d.,]+/, totalStr);
    });
  }

  function select(t) { state.tier = t; render(); }

  function go(pkg) {
    var cs = (window.NextCommerce && typeof window.NextCommerce.useCartStore === 'function')
      ? window.NextCommerce.useCartStore.getState() : null;
    if (!cs || typeof cs.addItem !== 'function') {
      window.location.href = CHECKOUT + '?forcePackageId=' + pkg + ':1';
      return;
    }
    Promise.resolve(cs.clear())
      .then(function () { return cs.addItem({ packageId: pkg, quantity: 1 }); })
      .then(function () { window.location.href = CHECKOUT; })
      .catch(function () { window.location.href = CHECKOUT + '?forcePackageId=' + pkg + ':1'; });
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
    // whose PageFly slider JS was stripped. Wire prev/next arrows to scroll one slide.
    [].slice.call(document.querySelectorAll('.pf-slider')).forEach(function (track) {
      var slides = [].slice.call(track.children).filter(function (c) { return c.classList.contains('pf-slide'); });
      if (slides.length < 2) return;
      function cur() {
        var sl = track.scrollLeft, b = 0, bd = Infinity;
        slides.forEach(function (s, i) { var d = Math.abs(s.offsetLeft - track.offsetLeft - sl); if (d < bd) { bd = d; b = i; } });
        return b;
      }
      function go(i) {
        i = Math.max(0, Math.min(slides.length - 1, i));
        track.scrollTo({ left: slides[i].offsetLeft - track.offsetLeft, behavior: 'smooth' });
      }
      var prev = track.querySelector('.pf-slider-prev'), next = track.querySelector('.pf-slider-next');
      if (prev) prev.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); go(cur() - 1); }, true);
      if (next) next.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); go(cur() + 1); }, true);
    });

    // ADD TO CART — stable id first, text fallback
    atcEls = [].slice.call(document.querySelectorAll('#add-to-cart-custom, [id^="add-to-cart"]'));
    [].slice.call(document.querySelectorAll('a, button')).forEach(function (e) {
      if (/ADD TO CART/i.test(e.textContent || '') && atcEls.indexOf(e) === -1) atcEls.push(e);
    });
    atcEls.forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); go(tierPkg(state.tier, state.mode)); }, true);
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
