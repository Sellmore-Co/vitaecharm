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

window.addEventListener('next:initialized', function() {
  next.fomo({
    // initialDelay: 5000,      // ms before first popup (default: 5000)
    // displayDuration: 5000,   // ms popup stays visible (default: 5000)
    // delayBetween: 10000,     // ms between popups (default: 10000)
    // maxMobileShows: 5,       // max times to show on mobile (default: 5)
  });

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
