import { CheckoutPayload } from '@/lib/api/payments';

/** Submit redirect checkout (PayFast form POST or BNPL redirect). */
export function submitCheckout(checkout: CheckoutPayload) {
  if (checkout.formFields && checkout.url) {
    const form = document.createElement('form');
    form.method = checkout.method || 'POST';
    form.action = checkout.url;
    Object.entries(checkout.formFields).forEach(([key, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = value;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
    return;
  }
  if (checkout.url) {
    window.location.href = checkout.url;
  }
}

export function paymentReturnUrl(intentId: string) {
  const base = import.meta.env.VITE_PAYMENTS_RETURN_BASE || window.location.origin;
  return `${base.replace(/\/$/, '')}/payments/return?intentId=${encodeURIComponent(intentId)}`;
}

export function paymentCancelUrl(intentId: string) {
  const base = import.meta.env.VITE_PAYMENTS_CANCEL_BASE || window.location.origin;
  return `${base.replace(/\/$/, '')}/payments/cancel?intentId=${encodeURIComponent(intentId)}`;
}
