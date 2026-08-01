// Dynamically loads Razorpay's Checkout script the first time it's needed,
// so it never blocks the initial app bundle/load for the vast majority of
// sessions that never touch a paid tournament entry.

let loadPromise = null;

function loadCheckoutScript() {
  if (window.Razorpay) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the payment gateway. Check your connection and try again.'));
    document.body.appendChild(script);
  });
  return loadPromise;
}

// { orderId, amount (paise), keyId, name, description, prefill: {name, email}, onSuccess(response), onFailure(error) }
export async function openRazorpayCheckout({ orderId, amount, keyId, name, description, prefill, onSuccess, onFailure }) {
  try {
    await loadCheckoutScript();
  } catch (err) {
    onFailure?.(err);
    return;
  }

  const rzp = new window.Razorpay({
    key: keyId,
    order_id: orderId,
    amount,
    currency: 'INR',
    name: name || 'Match Tracker Pro',
    description: description || 'Tournament entry fee',
    prefill: prefill || {},
    theme: { color: '#0f172a' },
    handler: (response) => onSuccess?.(response),
    modal: {
      ondismiss: () => onFailure?.(new Error('Payment cancelled')),
    },
  });
  rzp.on('payment.failed', (response) => {
    onFailure?.(new Error(response?.error?.description || 'Payment failed'));
  });
  rzp.open();
}
