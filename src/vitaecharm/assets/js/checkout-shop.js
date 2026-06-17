// Shopify-style single MM/YY expiration input. The SDK only supports separate
// exp-month/exp-year fields (verified against campaign-cart v0.4.24:
// CheckoutFormEnhancer reads them from checkoutStore.formData, synced via
// change/input/blur listeners attached to each [data-next-checkout-field]).
// So the visible field auto-formats "MM / YY" and mirrors into the two hidden
// fields, dispatching events so the SDK store picks the values up.
function initExpirationInput() {
  var display = document.getElementById('cc-exp-display');
  if (!display) return;
  var monthField = document.querySelector('[data-next-checkout-field="exp-month"]');
  var yearField = document.querySelector('[data-next-checkout-field="exp-year"]');
  if (!monthField || !yearField) return;

  function sync(field, value) {
    if (field.value === value) return;
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }

  display.addEventListener('input', function () {
    var digits = display.value.replace(/\D/g, '').slice(0, 4);
    // A first digit of 2-9 can only be a single-digit month — zero-pad it
    if (digits.length >= 1 && digits[0] > '1') digits = '0' + digits;
    var month = digits.slice(0, 2);
    var year = digits.slice(2, 4);
    display.value = year.length ? month + ' / ' + year : month;
    sync(monthField, month.length === 2 ? month : '');
    sync(yearField, year.length === 2 ? year : '');
    // The two hidden fields share one .form-group, so the SDK's per-field
    // error clearing leaves the group's has-error class behind once both
    // fields are valid again — reconcile after the SDK listeners have run.
    setTimeout(function () {
      var group = display.closest('.form-group');
      if (group && !group.querySelector('.next-error-field') && !group.querySelector('.next-error-label')) {
        group.classList.remove('has-error', 'addErrorIcon');
      }
    }, 0);
  });

  // Let backspace eat the " / " separator instead of fighting the formatter
  display.addEventListener('keydown', function (e) {
    if (e.key === 'Backspace' && /\s\/\s$/.test(display.value)) {
      e.preventDefault();
      display.value = display.value.slice(0, -4);
    }
  });

  // Blur the hidden fields too so SDK blur-validation runs against them
  display.addEventListener('blur', function () {
    monthField.dispatchEvent(new Event('blur', { bubbles: true }));
    yearField.dispatchEvent(new Event('blur', { bubbles: true }));
  });
}

initExpirationInput();

// ─── Order-summary decorator (Shopify wording parity) ───────────────────────
// The SDK's CartSummaryEnhancer re-renders the summary innerHTML on every cart
// change, and its {item.*} tokens can't express the Shopify wording the
// merchant wants ("FREE" prices, renamed titles, "N bottles", offer tag lines,
// post-discount subtotal, recurring-subtotal row). So a MutationObserver
// re-applies the decoration after each render. Every write is guarded by a
// value comparison, so a pass over an already-decorated summary makes no DOM
// mutations and the observer settles instead of looping.
(function () {
  // Package facts — must match the tier matrix in body-oil.js / campaign spec
  // (subscription tiers 2/4/5, one-time tiers 9/10/11, 12 = free bonus bottle,
  // 3/6/7/8 = free gifts).
  var BODY_OIL = {
    2: '1 bottle', 4: '2 bottles', 5: '3 bottles',
    9: '1 bottle', 10: '2 bottles', 11: '3 bottles'
  };
  var SUB_IDS = { 2: 1, 4: 1, 5: 1 };
  var FREE_IDS = { 3: 1, 6: 1, 7: 1, 8: 1, 12: 1 };
  // "1X FREE OIL" is the offer's display name on the merchant's live Shopify
  // checkout — it appears verbatim on every gift line (mask, mitt, nail oil),
  // not just the oil. Intentional parity, not a copy bug.
  var OFFER_LABEL = '1X FREE OIL';

  function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  // "0,00 $" / "$0.00" → true (has digits, none of them 1-9)
  function isZeroAmount(text) {
    return /\d/.test(text) && !/[1-9]/.test(text);
  }

  function parseAmount(text) {
    var m = String(text).replace(/[^\d.,]/g, '');
    if (!m) return NaN;
    // The last separator is the decimal point ("1.234,56" / "1,234.56") only
    // when 1-2 digits follow it; 3 digits means it's a thousands separator
    // ("$1,234" → 1234, not 1.234).
    var lastSep = Math.max(m.lastIndexOf(','), m.lastIndexOf('.'));
    if (lastSep === -1) return parseFloat(m);
    var frac = m.slice(lastSep + 1);
    if (frac.length > 2) return parseFloat(m.replace(/[.,]/g, ''));
    return parseFloat(m.slice(0, lastSep).replace(/[.,]/g, '') + '.' + frac);
  }

  // Format `value` re-using the currency layout of `sample` (e.g. "60,95 $")
  function formatLike(sample, value) {
    var digits = value.toFixed(2);
    var lastSep = Math.max(sample.lastIndexOf(','), sample.lastIndexOf('.'));
    if (lastSep !== -1) digits = digits.replace('.', sample[lastSep]);
    // Replace the numeric run (with separators) in the sample with our digits
    return sample.replace(/\d[\d.,\s ]*\d|\d/, digits);
  }

  function decorateLine(line) {
    var pkg = parseInt(line.getAttribute('data-package-id'), 10);
    var title = line.querySelector('.cart-item__title');
    var tag = line.querySelector('.cart-item__tag');
    var tagText = line.querySelector('.cart-item__tag-text');
    var finalPrice = line.querySelector('.checkout__line-item__final-price');
    var original = line.querySelector('.cart-price.price--original');

    // Main Body Oil tiers: plain product name + "N bottles" line
    if (BODY_OIL[pkg] && title) {
      setText(title, 'Body Oil');
      var bottles = line.querySelector('.cart-item__bottles');
      if (!bottles) {
        bottles = document.createElement('div');
        bottles.className = 'cart-item__bottles text-2xs text-muted text-weight-normal';
        title.parentNode.insertAdjacentElement('afterend', bottles);
      }
      setText(bottles, BODY_OIL[pkg]);
    }

    // "Every 30 days" → "Deliver every 30 days"
    var freq = line.querySelector('.cart-item__freq--true');
    if (freq) {
      var f = freq.textContent.trim();
      if (f && !/^deliver/i.test(f)) {
        setText(freq, 'Deliver ' + f.charAt(0).toLowerCase() + f.slice(1));
      }
    }

    // Offer tag line: "1X FREE OIL (-$38.00)" on free lines; plain label on the
    // subscription line (the offer that grants the free bottle).
    if (tag && tagText) {
      var label = null;
      if (FREE_IDS[pkg] && original) {
        var was = original.textContent.trim();
        label = was ? OFFER_LABEL + ' (-' + was + ')' : OFFER_LABEL;
      } else if (SUB_IDS[pkg]) {
        label = OFFER_LABEL;
      }
      if (label) {
        setText(tagText, label);
        if (tag.hidden) tag.hidden = false;
      } else if (!tag.hidden) {
        tag.hidden = true;
      }
    }

    // Zero price → the word FREE (strikethrough compare-at stays). Scoped to
    // the known free packages so a transient $0 placeholder on a paid line
    // can never be presented as FREE.
    if (FREE_IDS[pkg] && finalPrice && isZeroAmount(finalPrice.textContent)) {
      setText(finalPrice, 'FREE');
    }
  }

  function decorateSummary(summary) {
    summary.querySelectorAll('[data-summary-lines] [data-package-id]').forEach(function (line) {
      // One malformed line must not kill decoration for the rest of the summary
      try { decorateLine(line); } catch (e) { /* leave that line undecorated */ }
    });

    // SDK 0.4.x cart API is the Zustand store (same access pattern as
    // body-oil.js / clone-adapter.js, verified against v0.4.24). Only the
    // item-count label needs it — the money math below is DOM-only so it
    // still reconciles if this internal ever disappears in an SDK bump.
    var state = null;
    try {
      var nc = window.NextCommerce;
      if (nc && typeof nc.useCartStore === 'function') state = nc.useCartStore.getState();
    } catch (e) { /* SDK not ready */ }

    // Subtotal: "Subtotal · N items" + post-discount value (the {subtotal}
    // token is pre-discount; with the offer rows hidden it wouldn't reconcile
    // with Total). Taxes aren't in the SDK total (the taxes row reads
    // "Calculated when you place your order"), so subtotal = total − shipping.
    var subLabel = summary.querySelector('.js-subtotal-label');
    var subValue = summary.querySelector('.js-subtotal-value');
    if (state && subLabel) {
      var count = state.totalQuantity ||
        (state.items || []).reduce(function (n, it) { return n + (it.quantity || 1); }, 0);
      if (count) setText(subLabel, 'Subtotal · ' + count + ' ' + (count === 1 ? 'item' : 'items'));
    }
    if (subValue) {
      var totalEl = summary.querySelector('.order-totals__value--total');
      var shipEl = summary.querySelector('.js-shipping-value');
      var totalsText = totalEl ? totalEl.textContent.trim() : '';
      var total = parseAmount(totalsText);
      var ship = parseAmount(shipEl ? shipEl.textContent.trim() : '');
      if (!isNaN(total)) {
        var net = total - (isNaN(ship) ? 0 : ship);
        setText(subValue, formatLike(totalsText, net));
      }
    }

    // Compare-at "before" total in the collapsed summary bar (Shopify shows
    // $165.00 struck through). The SDK's cart.subtotal renders 0 for this
    // free-gift offer, so we own the value: sum each line's original price
    // (or its final price when no compare-at original exists — the paid Body
    // Oil line). The element lives in the accordion trigger, OUTSIDE this
    // [data-next-cart-summary], so it's resolved document-wide.
    var compareEl = document.querySelector('.js-compare-total');
    if (compareEl) try {
      var compareSum = 0, sampleText = '';
      summary.querySelectorAll('[data-summary-lines] [data-package-id]').forEach(function (line) {
        var orig = line.querySelector('.cart-price.price--original');
        var fin = line.querySelector('.checkout__line-item__final-price');
        var o = parseAmount(orig ? orig.textContent : '');
        var amt = (!isNaN(o) && o > 0) ? o : parseAmount(fin ? fin.textContent : '');
        if (!isNaN(amt)) { compareSum += amt; if (!sampleText && orig) sampleText = orig.textContent.trim(); }
      });
      var totalSample = summary.querySelector('.order-totals__value--total');
      sampleText = (totalSample && totalSample.textContent.trim()) || sampleText;
      // Require a numeric sample: formatLike returns the sample unchanged when
      // it finds no digit run, which would print a pre-hydration "{total}"
      // placeholder into the struck total. Skip until the total has rendered.
      if (compareSum > 0 && /\d/.test(sampleText)) setText(compareEl, formatLike(sampleText, compareSum));
    } catch (e) { /* never let the compare-at pass abort the rest of decorateSummary */ }

    // Recurring subtotal row mirrors the subscription line's sub-terms text
    var row = summary.querySelector('.js-recurring-row');
    var value = summary.querySelector('.js-recurring-value');
    var subTerms = summary.querySelector('.cart-item__sub-terms--true');
    if (row && value) {
      if (subTerms && subTerms.textContent.trim()) {
        // The line's frequency span is lowercased via CSS text-transform, which
        // textContent doesn't reflect — lowercase it in the mirrored copy too.
        setText(value, subTerms.textContent.replace(/\s+/g, ' ').trim()
          .replace(/\bEvery\b/, 'every'));
        if (row.hidden) row.hidden = false;
      } else if (!row.hidden) {
        row.hidden = true;
      }
    }

    // The subscription disclosure under the Pay button only applies when the
    // cart actually contains a recurring item. Document-wide check (not this
    // summary's subTerms): mobile and desktop summaries both run this pass,
    // and a summary that didn't render lines must not hide the disclosure.
    var disclosure = document.querySelector('.js-subscription-disclosure');
    if (disclosure) {
      var hasRecurring = !!document.querySelector('[data-next-cart-summary] .cart-item__sub-terms--true');
      if (disclosure.hidden === hasRecurring) disclosure.hidden = !hasRecurring;
    }
  }

  function initSummaryDecorator() {
    document.querySelectorAll('[data-next-cart-summary]').forEach(function (summary) {
      if (summary.dataset.vcDecorated) return; // re-init must not stack observers
      summary.dataset.vcDecorated = '1';
      var observer = new MutationObserver(function () {
        decorateSummary(summary);
        // Swallow the echo batch from our own writes — saves a second full
        // decoration pass per SDK render and breaks any future write loop.
        observer.takeRecords();
      });
      decorateSummary(summary);
      observer.observe(summary, { childList: true, subtree: true, characterData: true });
    });
  }

  window.addEventListener('next:initialized', initSummaryDecorator);
  // If the SDK initialized before this script attached its listener (CDN
  // module vs page-script load race), the event already fired — run now.
  if (window.NextCommerce) initSummaryDecorator();
})();

window.addEventListener('next:initialized', function() {
  // FOMO "just purchased" popup intentionally disabled (merchant feedback
  // round 3) — re-enable with next.fomo({...}) if the merchant changes course.

  // Phone is required on shipping only. The SDK builds the billing phone field
  // by cloning the shipping phone field — including its required attributes —
  // which makes billing display "Phone*". The SDK's billing validation does not
  // actually require phone, so strip the cloned required flags and reset the
  // placeholder so the billing field reads as optional and isn't misleading.
  var billingPhone = document.querySelector('[data-next-checkout-field="billing-phone"]');
  if (billingPhone) {
    billingPhone.removeAttribute('required');
    billingPhone.removeAttribute('data-next-required');
    billingPhone.placeholder = 'Phone (Optional)';
  }

  // Shopify parity: no asterisks on placeholders. The SDK appends "*" to the
  // required shipping phone placeholder after init — reset it.
  var shippingPhone = document.getElementById('phone');
  if (shippingPhone && /\*$/.test(shippingPhone.placeholder)) {
    shippingPhone.placeholder = shippingPhone.placeholder.replace(/\*$/, '');
  }

  // Shopify parity: SDK i18n resets the ZIP placeholder to "ZIP Code"
  var zip = document.getElementById('shipping_postal_code');
  if (zip) zip.placeholder = 'ZIP code';

  // Shopify parity: the state placeholder option reads "State", not the SDK's
  // injected "Select State".
  var provinceSelect = document.querySelector('[data-next-checkout-field="province"]');
  if (provinceSelect && provinceSelect.options.length && provinceSelect.options[0].value === '') {
    provinceSelect.options[0].textContent = 'State';
  }
});
