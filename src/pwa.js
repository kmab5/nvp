/**
 * The installable-app layer: service worker lifecycle, the install prompt, and
 * connectivity state.
 *
 * Two platform realities shape this file:
 *
 *  - Android fires `beforeinstallprompt`, which can be captured and replayed
 *    later from a button of our own.
 *  - iOS fires nothing. There is no install event and no programmatic prompt;
 *    the only route is Share → Add to Home Screen, done by hand. So iOS gets
 *    written instructions instead of a button, and only when it's plausibly
 *    useful — never inside an already-installed window.
 */

import * as prefs from './prefs.js';

const listeners = new Set();
const emit = () => { for (const fn of [...listeners]) fn(); };

let deferredPrompt = null;
let updateReady = null;   // the waiting ServiceWorker, once one exists
let online = navigator.onLine !== false;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True when running from a home-screen icon rather than a browser tab. */
export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

export function isIOS() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua)
    // iPadOS 13+ reports as a Mac; the touch points give it away.
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export const isOnline = () => online;
export const hasUpdate = () => Boolean(updateReady);

/**
 * Whether to offer installation at all. Suppressed when already installed, when
 * the player has dismissed it recently, or on desktop where it's noise.
 */
export function installOffer() {
  if (isStandalone()) return null;
  const snoozedUntil = prefs.get('installSnoozedUntil', 0);
  if (Date.now() < snoozedUntil) return null;
  if (deferredPrompt) return 'prompt';
  // Only iOS needs the manual walkthrough, and only on a touch device.
  if (isIOS() && navigator.maxTouchPoints > 0) return 'ios';
  return null;
}

export function snoozeInstall(days = 14) {
  prefs.set('installSnoozedUntil', Date.now() + days * 24 * 60 * 60 * 1000);
  emit();
}

/** Replays the captured Android prompt. Resolves to true if they installed. */
export async function promptInstall() {
  if (!deferredPrompt) return false;
  const event = deferredPrompt;
  deferredPrompt = null;
  emit();
  event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome !== 'accepted') snoozeInstall(7);
  return outcome === 'accepted';
}

/** Activates a waiting worker and reloads once it takes over. */
export function applyUpdate() {
  if (!updateReady) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  }, { once: true });
  updateReady.postMessage('skip-waiting');
}

export function register() {
  window.addEventListener('online', () => { online = true; emit(); });
  window.addEventListener('offline', () => { online = false; emit(); });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();     // keep the mini-infobar from appearing
    deferredPrompt = event;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    prefs.set('installSnoozedUntil', 0);
    emit();
  });

  if (!('serviceWorker' in navigator)) return;
  // localhost over http is a secure context; anything else must be https.
  if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') return;

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');

      const track = (worker) => {
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          // "installed" with an existing controller means an update is waiting,
          // as opposed to the very first install.
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            updateReady = worker;
            emit();
          }
        });
      };

      if (registration.waiting && navigator.serviceWorker.controller) {
        updateReady = registration.waiting;
        emit();
      }
      track(registration.installing);
      registration.addEventListener('updatefound', () => track(registration.installing));
    } catch {
      /* offline support is a bonus, never a reason to fail startup */
    }
  });
}
