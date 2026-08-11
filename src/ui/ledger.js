/**
 * The ledger — the signature surface of the game.
 *
 * Each attempt reads left to right like a timing feed: attempt number, the code,
 * then the score twice over. The pips give you the shape of the answer at a
 * glance (green = right slot, amber = right digit wrong slot, hollow = not in the
 * code at all) and the chips give you the exact numbers you'll actually reason
 * with. Same information, two speeds of reading.
 */

import { h } from './dom.js';
import { CODE_LENGTH, DIGITS } from '../../shared/engine.js';

export function ledgerRow({ index, guess, value, position }, { fresh = false } = {}) {
  const cracked = position === CODE_LENGTH;

  const digits = h(
    'div',
    { class: 'row__code' },
    ...guess.split('').map((d) => h('span', { class: 'row__digit' }, d)),
  );

  const pips = h('div', { class: 'row__pips', 'aria-hidden': 'true' }, ...[
    ...Array.from({ length: position }, () => h('span', { class: 'pip pip--position' })),
    ...Array.from({ length: value - position }, () => h('span', { class: 'pip pip--value' })),
    ...Array.from({ length: CODE_LENGTH - value }, () => h('span', { class: 'pip' })),
  ]);

  const score = h(
    'div',
    { class: 'row__score' },
    h('span', { class: 'chip chip--value' }, 'V', h('b', null, String(value))),
    h('span', { class: 'chip chip--position' }, 'P', h('b', null, String(position))),
  );

  const classes = ['row'];
  if (fresh) classes.push('row--fresh');
  if (cracked) classes.push('row--crack');

  return h(
    'li',
    {
      class: classes.join(' '),
      'aria-label': `Attempt ${index}: ${guess.split('').join(' ')}. `
        + `Value ${value}, position ${position}.`
        + (cracked ? ' Code cracked.' : ''),
    },
    h('span', { class: 'row__no', 'aria-hidden': 'true' }, String(index).padStart(2, '0')),
    digits,
    pips,
    score,
  );
}

/**
 * @param {object} options
 * @param {{guess:string,value:number,position:number}[]} options.guesses
 * @param {number} [options.freshIndex] 1-based row to animate in
 */
export function renderLedger({ guesses, empty, freshIndex = -1 }) {
  if (!guesses.length) {
    return h('p', { class: 'ledger__empty' }, empty);
  }
  return h(
    'ol',
    { class: 'ledger' },
    ...guesses.map((turn, i) => ledgerRow(
      { index: i + 1, ...turn },
      { fresh: i + 1 === freshIndex },
    )),
  );
}

/** Best score reached so far, for the result screen. */
export function bestScore(guesses) {
  return guesses.reduce(
    (best, turn) => (turn.position > best.position
      || (turn.position === best.position && turn.value > best.value) ? turn : best),
    { value: 0, position: 0 },
  );
}

const CYCLE = { unknown: 'maybe', maybe: 'in', in: 'out', out: 'unknown' };

const LABEL = {
  unknown: 'unmarked',
  maybe: 'marked as maybe',
  in: 'marked as in the code',
  out: 'marked as ruled out',
};

/**
 * A scratchpad for the player's own deductions. Purely local — nothing here is
 * sent anywhere, and it resets between matches. The keypad picks up the same
 * marks so your notes follow you into the next guess.
 */
export function createNotes({ onChange } = {}) {
  const marks = new Map(DIGITS.split('').map((d) => [d, 'unknown']));
  const row = h('div', { class: 'notes__row', role: 'group', 'aria-label': 'Digit notes' });

  const reset = h('button', {
    class: 'btn btn--quiet',
    type: 'button',
    onclick: () => {
      for (const d of marks.keys()) marks.set(d, 'unknown');
      render();
      onChange?.();
    },
  }, 'Clear');

  const el = h(
    'div',
    { class: 'notes' },
    h(
      'div',
      { class: 'notes__head' },
      h('span', { class: 'eyebrow' }, 'Your notes'),
      reset,
    ),
    row,
    h('p', { class: 'note' }, 'Tap a digit to cycle: maybe, in, out. Only you see this.'),
  );

  function render() {
    row.replaceChildren(...DIGITS.split('').map((digit) => {
      const state = marks.get(digit);
      return h('button', {
        class: 'pip-btn',
        type: 'button',
        dataset: { state },
        'aria-label': `Digit ${digit}, ${LABEL[state]}`,
        onclick: () => {
          marks.set(digit, CYCLE[marks.get(digit)]);
          render();
          onChange?.();
        },
      }, digit);
    }));
  }

  render();

  return {
    el,
    states: () => Object.fromEntries([...marks].filter(([, s]) => s !== 'unknown')),
    clear() {
      for (const d of marks.keys()) marks.set(d, 'unknown');
      render();
    },
  };
}
