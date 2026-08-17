/**
 * Haptics.
 *
 * Patterns are deliberately matched to the sound cues in sfx.js — the same
 * event should feel the way it sounds, so a player with the sound off still
 * gets the shape of what happened.
 *
 * Support is Android-only in practice: iOS Safari does not implement the
 * Vibration API, in a browser tab or an installed web app. There is no
 * workaround, so this degrades to nothing rather than pretending otherwise.
 */

import * as prefs from './prefs.js';

const PATTERNS = {
  tap: 8,
  back: 12,
  submit: 18,
  reject: [24, 40, 24],
  turn: [12, 60, 12],
  crack: [0, 40, 55, 40, 55, 90],
  lose: [0, 70, 90, 50],
};

export function supported() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function enabled() {
  return prefs.get('haptics', true) !== false;
}

export function toggle() {
  const next = !enabled();
  prefs.set('haptics', next);
  if (next) fire('tap');
  return next;
}

export function fire(name) {
  if (!supported() || !enabled()) return;
  const pattern = PATTERNS[name];
  if (pattern === undefined) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* vibration is a nicety, never a failure mode */
  }
}
