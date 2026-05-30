/* VitaeCharm Body Oil PDP — buy box + gallery.
   Buy box: Subscribe/Buy-Once toggle × 3 tiers → package matrix, on-page add-to-cart.
   FAQ accordion is handled by landing.js. No innerHTML — values written via textContent. */
(function () {
  'use strict';

  // Tier → package matrix (from campaign spec). sub = subscription, once = one-time.
  var TIERS = {
    '1': { name: 'Buy 1', bottles: 1,
      sub:  { pkg: 2,  each: '$32', was: '$38', total: '$32'  },
      once: { pkg: 9,  each: '$38', was: '',    total: '$38'  } },
    '2': { name: 'Buy 2, Get 1 FREE', bottles: 2,
      sub:  { pkg: 4,  each: '$19', was: '$26', total: '$57'  },
      once: { pkg: 10, each: '$38', was: '',    total: '$76'  } },
    '3': { name: 'Buy 3, Get 2 FREE', bottles: 3,
      sub:  { pkg: 5,  each: '$15', was: '$23', total: '$75'  },
      once: { pkg: 11, each: '$38', was: '',    total: '$114' } }
  };

  var root = document.querySelector('[data-bo-buybox]');
  if (!root) return;

  var state = { tier: '2', mode: 'sub' }; // default: Buy 2, subscription (matches live page)

  var cards = Array.prototype.slice.call(root.querySelectorAll('[data-bo-tier]'));
  var modeBtns = Array.prototype.slice.call(root.querySelectorAll('[data-bo-mode]'));
  var gifts = Array.prototype.slice.call(root.querySelectorAll('[data-bo-gift-min]'));
  var atcTotal = root.querySelector('[data-bo-atc-total]');
  var atc = root.querySelector('[data-bo-atc]');
  var subNote = root.querySelector('[data-bo-subnote]');

  function setText(el, value) { if (el) el.textContent = value; }

  function render() {
    cards.forEach(function (card) {
      var t = card.getAttribute('data-bo-tier');
      var data = TIERS[t][state.mode];
      setText(card.querySelector('[data-bo-each]'), data.each);
      var wasEl = card.querySelector('[data-bo-was]');
      if (wasEl) { wasEl.textContent = data.was; wasEl.style.visibility = data.was ? 'visible' : 'hidden'; }
      card.classList.toggle('is-selected', t === state.tier);
      card.setAttribute('aria-checked', t === state.tier ? 'true' : 'false');
    });

    modeBtns.forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-bo-mode') === state.mode);
    });

    var bottles = TIERS[state.tier].bottles;
    gifts.forEach(function (g) {
      var min = parseInt(g.getAttribute('data-bo-gift-min'), 10) || 1;
      g.classList.toggle('is-unlocked', bottles >= min);
    });

    setText(atcTotal, TIERS[state.tier][state.mode].total);
    if (subNote) subNote.style.display = state.mode === 'sub' ? '' : 'none';
  }

  cards.forEach(function (card) {
    card.addEventListener('click', function () { state.tier = card.getAttribute('data-bo-tier'); render(); });
  });
  modeBtns.forEach(function (b) {
    b.addEventListener('click', function () { state.mode = b.getAttribute('data-bo-mode'); render(); });
  });
  var buyOnce = root.querySelector('[data-bo-buyonce]');
  if (buyOnce) buyOnce.addEventListener('click', function () { state.mode = 'once'; render(); });

  // ---- Add to cart (on-page) ----
  // SDK 0.4.x cart API is the Zustand store: window.NextCommerce.useCartStore.getState()
  // with .clear() and .addItem({ packageId, quantity }). Verified against v0.4.24.
  var checkoutUrl = root.getAttribute('data-bo-checkout') || '/';

  function cartStore() {
    try {
      var nc = window.NextCommerce;
      if (nc && typeof nc.useCartStore === 'function') return nc.useCartStore.getState();
    } catch (e) {}
    return null;
  }

  function whenReady() {
    return new Promise(function (resolve) {
      function isReady() { var cs = cartStore(); return cs && typeof cs.addItem === 'function'; }
      if (isReady()) return resolve(true);
      var done = false;
      function ok() { if (!done && isReady()) { done = true; resolve(true); } }
      document.addEventListener('next:initialized', ok);
      var tries = 0;
      var iv = setInterval(function () { tries++; ok(); if (done || tries > 50) { clearInterval(iv); if (!done) resolve(false); } }, 100);
    });
  }

  if (atc) {
    atc.addEventListener('click', function () {
      var pkg = TIERS[state.tier][state.mode].pkg;
      atc.disabled = true;
      whenReady().then(function (ready) {
        var cs = cartStore();
        if (!ready || !cs) { window.location.href = checkoutUrl + '?forcePackageId=' + pkg + ':1'; return; }
        Promise.resolve(cs.clear())
          .then(function () { return cs.addItem({ packageId: pkg, quantity: 1 }); })
          .then(function () { window.location.href = checkoutUrl; })
          .catch(function () { window.location.href = checkoutUrl + '?forcePackageId=' + pkg + ':1'; });
      });
    });
  }

  // ---- Gallery thumbnails ----
  var gallery = document.querySelector('[data-bo-gallery]');
  if (gallery) {
    var mainImg = gallery.querySelector('[data-bo-gallery-main]');
    var thumbs = Array.prototype.slice.call(gallery.querySelectorAll('[data-bo-thumb]'));
    thumbs.forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        var img = thumb.querySelector('img');
        if (mainImg && img) { mainImg.src = img.src; mainImg.alt = img.alt; }
        thumbs.forEach(function (t) { t.classList.remove('is-active'); });
        thumb.classList.add('is-active');
      });
    });
  }

  render();
})();
