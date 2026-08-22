import { auth } from '../firebase';
import { UserProfile } from '../types';

export async function buildAuthenticatedHeaders(user: UserProfile): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  try {
    if (auth.currentUser) {
      headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
    }
  } catch {
    // The client identity headers keep demo/local environments usable.
  }
  if (!headers.Authorization && user.uid) {
    headers['X-Client-Uid'] = user.uid;
    headers['X-Client-Email'] = user.email || '';
    headers['X-Client-Name'] = user.name || '';
  }
  return headers;
}

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const decoded = window.atob(base64);
  return Uint8Array.from(decoded, character => character.charCodeAt(0));
}

export function canUseWebPush(): boolean {
  return typeof window !== 'undefined'
    && window.isSecureContext
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export async function subscribeDeviceToPush(user: UserProfile): Promise<'subscribed' | 'unavailable' | 'denied'> {
  if (!canUseWebPush()) return 'unavailable';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const headers = await buildAuthenticatedHeaders(user);
  const publicKeyResponse = await fetch('/api/notifications/public-key', { headers });
  const publicKeyData = await publicKeyResponse.json().catch(() => ({}));
  if (!publicKeyResponse.ok || !publicKeyData.publicKey) return 'unavailable';

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKeyData.publicKey)
    });
  }

  const response = await fetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON() })
  });
  if (!response.ok) throw new Error('Não foi possível registrar este dispositivo para notificações.');
  return 'subscribed';
}

