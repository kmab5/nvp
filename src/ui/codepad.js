/**
 * Code entry.
 *
 * A four-slot display plus a 1-9 keypad. The pad is the only way in, which means
 * the rules are enforced by the interface rather than by an error message: zero
 * isn't on the keypad, and a digit you've already placed goes dead until you
 * take it back. Physical keyboards work too.
 */

import { h, on } from './dom.js';
import { CODE_LENGTH, DIGITS, randomCode } from '../../shared/engine.js';
import * as sfx from '../sfx.js';

/**
 * @param {object} options
 * @param {(code: string) => void} options.onSubmit
 * @param {boolean} [options.masked]      hide digits behind dots (secret entry)
 * @param {boolean} [options.allowRandom] offer a "roll one for me" button
 * @param {string}  [options.submitLabel]
 * @param {() => Record<string, string>} [options.digitStates] tint keys from notes
 */
export function createCodePad({
  onSubmit,
  masked = false,
  allowRandom = false,
  submitLabel = 'Submit guess',
  hint = 'Type 1-9, Enter to submit',
  digitStates = () => ({}),
}) {
  let entry = '';
  let revealed = !masked;
  let disabled = false;
  let lastFilled = -1;

  const tiles = h('div', { class: 'pad__tiles', role: 'group', 'aria-label': 'Your code' });
  const keys = h('div', { class: 'pad__keys' });
  const hintLine = h('p', { class: 'pad__hint', text: hint });

  const submitBtn = h('button', {
    class: 'btn btn--primary',
    type: 'button',
    onclick: () => commit(),
  }, submitLabel);

  const backBtn = h('button', {
    class: 'btn btn--ghost btn--icon',
    type: 'button',
    'aria-label': 'Delete last digit',
    onclick: () => backspace(),
  }, '⌫');

  const revealBtn = masked
    ? h('button', {
      class: 'btn btn--ghost',
      type: 'button',
      onclick: () => { revealed = !revealed; render(); },
    }, 'Show')
    : null;

  const randomBtn = allowRandom
    ? h('button', {
      class: 'btn btn--ghost',
      type: 'button',
      onclick: () => { entry = randomCode(); lastFilled = CODE_LENGTH - 1; sfx.play('tap'); render(); },
    }, 'Random')
    : null;

  const tools = h('div', { class: 'pad__tools' }, backBtn, revealBtn, randomBtn);
  const commitRow = h('div', { class: 'pad__commit' }, submitBtn);
  const el = h('div', { class: 'pad' }, tiles, keys, tools, commitRow, hintLine);

  function push(digit) {
    if (disabled || entry.length >= CODE_LENGTH || entry.includes(digit)) return;
    entry += digit;
    lastFilled = entry.length - 1;
    sfx.play('tap');
    render();
  }

  function backspace() {
    if (disabled || !entry) return;
    entry = entry.slice(0, -1);
    lastFilled = -1;
    sfx.play('back');
    render();
  }

  function commit() {
    if (disabled || entry.length !== CODE_LENGTH) {
      sfx.play('reject');
      flash();
      return;
    }
    onSubmit(entry);
  }

  function flash() {
    hintLine.textContent = `Fill all ${CODE_LENGTH} slots first.`;
    setTimeout(() => { hintLine.textContent = hint; }, 1600);
  }

  function renderTiles() {
    tiles.replaceChildren(...Array.from({ length: CODE_LENGTH }, (_, i) => {
      const filled = i < entry.length;
      const glyph = filled ? (revealed ? entry[i] : '•') : '·';
      const classes = ['tile'];
      classes.push(filled ? 'tile--filled' : 'tile--empty');
      if (!disabled && i === entry.length) classes.push('tile--cursor');
      if (i === lastFilled) classes.push('tile--pop');
      return h('div', { class: classes.join(' '), 'aria-hidden': 'true' }, glyph);
    }));
  }

  function renderKeys() {
    const states = digitStates() || {};
    keys.replaceChildren(...DIGITS.split('').map((digit) => {
      const used = entry.includes(digit);
      const state = states[digit];
      const classes = ['key'];
      if (state === 'in') classes.push('key--in');
      else if (state === 'out') classes.push('key--out');
      else if (state === 'maybe') classes.push('key--maybe');
      return h('button', {
        class: classes.join(' '),
        type: 'button',
        disabled: disabled || used || entry.length >= CODE_LENGTH,
        onclick: () => push(digit),
      }, digit);
    }));
  }

  function render() {
    renderTiles();
    renderKeys();
    submitBtn.disabled = disabled || entry.length !== CODE_LENGTH;
    backBtn.disabled = disabled || entry.length === 0;
    if (randomBtn) randomBtn.disabled = disabled;
    if (revealBtn) {
      revealBtn.textContent = revealed ? 'Hide' : 'Show';
      revealBtn.disabled = disabled || entry.length === 0;
    }
  }

  const offKeys = on(window, 'keydown', (event) => {
    if (disabled) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (DIGITS.includes(event.key)) {
      event.preventDefault();
      push(event.key);
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      backspace();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape' && entry) {
      event.preventDefault();
      entry = '';
      lastFilled = -1;
      sfx.play('back');
      render();
    }
  });

  render();

  return {
    el,
    value: () => entry,
    reset() {
      entry = '';
      lastFilled = -1;
      revealed = !masked;
      render();
    },
    setDisabled(value) {
      disabled = Boolean(value);
      render();
    },
    setHint(text) {
      hint = text;
      hintLine.textContent = text;
    },
    refresh: render,
    destroy: offKeys,
  };
}
