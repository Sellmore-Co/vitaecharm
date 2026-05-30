/* VitaeCharm clone buy-box adapter.
   The page is a 1:1 clone of the Shopify PageFly PDP with its runtime JS stripped.
   Re-wires the static buy box to the NEXT Campaign Cart SDK:
   - tier selection + subscribe/one-time toggle -> NEXT package id -> add to cart -> checkout
   - prices read LIVE from the Campaigns API (useCampaignStore) so they stay dynamic
   - re-implements PageFly accordion expand/collapse (Accordion + Accordion3)
   Markup has no stable hooks, so targeting is text/structure based (intentionally brittle). */
(function () {
  'use strict';

  var CHECKOUT = '/vitaecharm/checkout/';

  // Tier -> package ids + per-each divisor (effective bottles; structural, not a price).
  // sub buy2 = 3 bottles (2 paid + 1 free offer), buy3 = 5 (3 + 2 free); one-time = qty.
  var TIERMAP = {
    1: { sub: 2,  once: 9,  divSub: 1, divOnce: 1 },  // Buy 1: 1 bottle
    2: { sub: 4,  once: 10, divSub: 3, divOnce: 2 },  // Buy 2 + 1 free = 3 (sub) / 2 (once)
    3: { sub: 5,  once: 11, divSub: 5, divOnce: 3 }   // Buy 3 + 2 free = 5 (sub) / 3 (once)
  };

  var state = { tier: 2, mode: 'sub' };
  var tierAnchors = {};   // tier -> <a> card element
  var atcEls = [];
  var selectedEl = null;

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
    var div = mode === 'sub' ? TIERMAP[t].divSub : TIERMAP[t].divOnce;
    return total / (div || 1);
  }

  function priceLeaves(el) {
    return [].slice.call(el.querySelectorAll('*')).filter(function (n) {
      return n.children.length === 0 && /\$\d/.test((n.textContent || '').trim());
    });
  }

  function injectStyle() {
    if (document.getElementById('nx-clone-style')) return;
    var s = document.createElement('style');
    s.id = 'nx-clone-style';
    s.textContent = '.nx-tier-selected{outline:3px solid #1f8f4e !important;outline-offset:2px;border-radius:12px;}';
    document.head.appendChild(s);
  }

  function render() {
    // tier cards: selection outline + live "each" price (last $-leaf = the active/red price)
    [1, 2, 3].forEach(function (t) {
      var a = tierAnchors[t];
      if (!a) return;
      a.classList.toggle('nx-tier-selected', state.tier === t);
      var eachStr = money(tierEach(t, state.mode));
      var leaves = priceLeaves(a);
      if (leaves.length) {
        var each = leaves[leaves.length - 1]; // red "each" price is the last $-leaf
        if (eachStr) each.textContent = each.textContent.replace(/\$[\d.,]+/, eachStr);
        // The strikethrough compare price is only meaningful for Subscribe & Save.
        // One-time = "NO SAVINGS", so hide the compare (matches the original).
        if (leaves.length >= 2) leaves[0].style.display = (state.mode === 'sub') ? '' : 'none';
      }
    });
    // ATC total = live package total for the selected tier+mode
    var totalStr = money(tierTotal(state.tier, state.mode));
    if (totalStr) {
      atcEls.forEach(function (a) {
        if (/\$[\d.,]+/.test(a.textContent)) a.textContent = a.textContent.replace(/\$[\d.,]+/, totalStr);
      });
    }
  }

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

  function tierFromClick(target) {
    var el = target, best = null, bestEl = null;
    for (var i = 0; i < 9 && el && el !== document.body; i++) {
      var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      var m = t.match(/^Buy ([123])\b/);
      if (m && t.length < 140) { best = parseInt(m[1], 10); bestEl = el; break; }
      el = el.parentElement;
    }
    if (!best) return null;
    return { tier: best, el: (bestEl.closest && bestEl.closest('a')) || bestEl };
  }

  function isATC(el) {
    var a = el && el.closest ? el.closest('a,button') : null;
    return a && (a.id === 'add-to-cart-custom' || /ADD TO CART/i.test(a.textContent || ''));
  }

  function findTierAnchors() {
    var pf = document.querySelector('#__pf') || document.body;
    [1, 2, 3].forEach(function (t) {
      var strong = [].slice.call(pf.querySelectorAll('strong, span, p, label, div')).filter(function (e) {
        return (e.textContent || '').replace(/\s+/g, ' ').trim().indexOf('Buy ' + t) === 0;
      }).sort(function (a, b) { return a.textContent.length - b.textContent.length; })[0];
      if (strong) tierAnchors[t] = (strong.closest && strong.closest('a')) || strong;
    });
  }

  // ---- Accordion expand/collapse (Accordion.Header sibling-wrapper, Accordion3.Header <details>) ----
  function accordionBody(head) {
    var details = head.closest && head.closest('details');
    if (details) return details.querySelector('.pf-accordion-body') || details.querySelector('.pf-accordion-wrapper');
    var w = head.nextElementSibling;
    while (w && (w.className || '').indexOf('pf-accordion') === -1) w = w.nextElementSibling;
    return w;
  }

  function toggleAccordion(head) {
    var open = head.getAttribute('data-active') === 'true';
    head.setAttribute('data-active', open ? 'false' : 'true');
    var arrow = head.querySelector('.pfa-arrow');
    if (arrow) arrow.style.transform = open ? '' : 'rotate(90deg)';
    var details = head.closest && head.closest('details');
    if (details) details.open = !open;
    var body = accordionBody(head);
    if (body) {
      if (open) {
        body.classList.add('pf-accordion-hide');
        body.style.height = ''; body.style.display = ''; body.style.overflow = '';
      } else {
        body.classList.remove('pf-accordion-hide');
        body.style.display = 'block'; body.style.overflow = 'hidden'; body.style.height = 'auto';
      }
    }
  }

  ready(function () {
    injectStyle();
    var pf = document.querySelector('#__pf') || document.body;
    findTierAnchors();

    // Tier selection (PageFly tiers are <a href="#"> with shared markup)
    pf.addEventListener('click', function (e) {
      if (isATC(e.target)) return;
      var hit = tierFromClick(e.target);
      if (!hit) return;
      e.preventDefault();
      state.tier = hit.tier;
      if (selectedEl) selectedEl.classList.remove('nx-tier-selected');
      selectedEl = hit.el;
      selectedEl.classList.add('nx-tier-selected');
      render();
    }, true);

    // Subscribe / Buy-once toggle
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

    // Accordions (both PageFly variants)
    document.addEventListener('click', function (e) {
      var head = e.target.closest && e.target.closest('[data-pf-type="Accordion.Header"], [data-pf-type="Accordion3.Header"]');
      if (!head) return;
      e.preventDefault();
      toggleAccordion(head);
    }, true);

    // Product gallery — PageFly media slider (main scroll-track + thumbnail strip).
    // Re-wire prev/next arrows and thumbnail clicks to scroll the main track.
    (function setupGallery() {
      var sliders = [].slice.call(document.querySelectorAll('.pf-media-slider'));
      if (!sliders.length) return;
      var main = sliders[0];
      var slides = [].slice.call(main.querySelectorAll('.pf-slide-main-media'));
      if (slides.length < 2) return;
      var thumbStrip = sliders[1];
      var thumbs = thumbStrip ? [].slice.call(thumbStrip.querySelectorAll('.pf-slide-list-media')) : [];

      function curIndex() {
        var sl = main.scrollLeft, best = 0, bestD = Infinity;
        slides.forEach(function (s, i) {
          var d = Math.abs(s.offsetLeft - sl);
          if (d < bestD) { bestD = d; best = i; }
        });
        return best;
      }
      function goTo(i) {
        i = Math.max(0, Math.min(slides.length - 1, i));
        main.scrollTo({ left: slides[i].offsetLeft, behavior: 'smooth' });
        thumbs.forEach(function (t, j) { t.classList.toggle('active', j === i); });
      }

      var prev = main.querySelector('.pf-slider-prev');
      var next = main.querySelector('.pf-slider-next');
      if (prev) prev.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); goTo(curIndex() - 1); }, true);
      if (next) next.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); goTo(curIndex() + 1); }, true);

      thumbs.forEach(function (t, i) {
        t.style.cursor = 'pointer';
        t.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); goTo(i); }, true);
      });
      // keep active thumb in sync while the user swipes the main track
      var raf;
      main.addEventListener('scroll', function () {
        if (raf) return;
        raf = requestAnimationFrame(function () { raf = null; var i = curIndex(); thumbs.forEach(function (t, j) { t.classList.toggle('active', j === i); }); });
      }, { passive: true });
      goTo(0);
    })();

    // ADD TO CART — stable id first, text fallback
    atcEls = [].slice.call(document.querySelectorAll('#add-to-cart-custom, [id^="add-to-cart"]'));
    [].slice.call(document.querySelectorAll('a, button')).forEach(function (e) {
      if (/ADD TO CART/i.test(e.textContent || '') && atcEls.indexOf(e) === -1) atcEls.push(e);
    });
    atcEls.forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        go(tierPkg(state.tier, state.mode));
      }, true);
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
