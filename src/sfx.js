/**
 * Four synthesised blips. No audio files, no autoplay: the context is created on
 * the first user gesture and every sound is short enough to stay out of the way.
 */

import * as prefs from './prefs.js';
import * as haptics from './haptics.js';

let ctx = null;

function context() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

function tone({ freq, dur = 0.09, type = 'sine', gain = 0.05, slide = 0, delay = 0 }) {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') audio.resume();
  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), start + dur);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(amp).connect(audio.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

const VOICES = {
  tap: () => tone({ freq: 520, dur: 0.05, type: 'triangle', gain: 0.035 }),
  back: () => tone({ freq: 240, dur: 0.06, type: 'triangle', gain: 0.03 }),
  submit: () => {
    tone({ freq: 420, dur: 0.08, type: 'square', gain: 0.03 });
    tone({ freq: 660, dur: 0.1, type: 'square', gain: 0.025, delay: 0.06 });
  },
  reject: () => tone({ freq: 180, dur: 0.16, type: 'sawtooth', gain: 0.035, slide: -60 }),
  crack: () => {
    [523, 659, 784, 1047].forEach((freq, i) => {
      tone({ freq, dur: 0.16, type: 'sine', gain: 0.045, delay: i * 0.075 });
    });
  },
  lose: () => {
    [392, 330, 262].forEach((freq, i) => {
      tone({ freq, dur: 0.22, type: 'sine', gain: 0.04, delay: i * 0.12 });
    });
  },
  turn: () => tone({ freq: 700, dur: 0.07, type: 'sine', gain: 0.03 }),
};

/**
 * The single feedback entry point: one call fires both the sound and the
 * matching vibration. They are toggled independently — someone playing muted
 * still wants to feel a cracked code, and someone who finds vibration annoying
 * still wants the audio — so neither switch gates the other.
 */
export function play(name) {
  haptics.fire(name);
  if (!prefs.get('sound', true)) return;
  const voice = VOICES[name];
  if (!voice) return;
  try {
    voice();
  } catch {
    /* audio is a nicety, never a failure mode */
  }
}

export function enabled() {
  return prefs.get('sound', true);
}

export function toggle() {
  const next = !enabled();
  prefs.set('sound', next);
  if (next) play('tap');
  return next;
}
