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
});
