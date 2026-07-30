// Browser Web Push wrapper (Phase 3, item 7). Registers public/sw.js,
// subscribes/unsubscribes via the standard Push API, and persists the
// subscription through src/api's push functions. Needs
// VITE_VAPID_PUBLIC_KEY set to the same public key configured as the
// send-push Edge Function's VAPID_PUBLIC_KEY secret.
import * as api from '../api';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY;
}

export async function getPushSubscriptionStatus() {
  if (!isPushSupported()) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'subscribed' : 'unsubscribed';
}

export async function subscribeToPush(userId) {
  if (!isPushSupported()) throw new Error('Push notifications are not supported in this browser');
  const reg = await navigator.serviceWorker.register('/sw.js');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted');

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  const json = sub.toJSON();
  await api.savePushSubscription(userId, { endpoint: json.endpoint, keys: json.keys });
  return sub;
}

export async function unsubscribeFromPush() {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await api.deletePushSubscription(endpoint).catch(() => {});
}
