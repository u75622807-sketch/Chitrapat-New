// js/pwa.js — ऐप को फ़ोन/कंप्यूटर पर "इंस्टॉल" करने और ऑफ़लाइन चलाने (Service Worker) की सुविधा
//
// पुरानी गड़बड़ी: sw.js फ़ाइल थी, पर उसे कहीं register ही नहीं किया गया था — यानी वो कभी चलती ही नहीं थी।
import { toast } from './ui.js';

let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn(!!deferredPrompt));

export const canInstall = () => !!deferredPrompt;
export const isStandalone = () =>
  (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function onInstallChange(fn) {
  listeners.add(fn);
  fn(!!deferredPrompt);
  return () => listeners.delete(fn);
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  promptEvent.prompt();
  const choice = await promptEvent.userChoice.catch(() => ({ outcome: 'dismissed' }));
  notify();
  return choice.outcome === 'accepted';
}

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
    toast('चित्रपट ऐप इंस्टॉल हो गया 🎉', { type: 'success' });
  });

  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!('serviceWorker' in navigator) || !secure) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            toast('ऐप का नया वर्ज़न आ गया है', {
              action: { label: 'रीफ़्रेश करें', onClick: () => location.reload() },
              timeout: 6000,
            });
          }
        });
      });
    }).catch((err) => console.warn('[चित्रपट] Service Worker रजिस्टर नहीं हुआ:', err));
  });
}
