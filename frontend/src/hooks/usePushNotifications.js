import { useEffect } from 'react';
import client from '../api/client';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export default function usePushNotifications() {
  useEffect(() => {
    // Only runs in a PWA context with service worker support
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    // Don't nag if already denied
    if (Notification.permission === 'denied') return;

    async function setup() {
      try {
        const reg = await navigator.serviceWorker.ready;

        // Already subscribed — nothing to do
        const existing = await reg.pushManager.getSubscription();
        if (existing) return;

        // Only prompt if already granted, or ask once on first open
        let permission = Notification.permission;
        if (permission === 'default') {
          permission = await Notification.requestPermission();
        }
        if (permission !== 'granted') return;

        const { data } = await client.get('/notifications/vapid-public-key');
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(data.key),
        });
        await client.post('/notifications/subscribe', { subscription: sub });
      } catch {
        // Silently fail — push notifications are a nice-to-have
      }
    }

    setup();
  }, []);
}
