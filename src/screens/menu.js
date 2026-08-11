/**
 * The menu.
 *
 * The hero is the acronym, expanded. It doubles as the rules: three rows, and the
 * two that are scored wear the colours they will wear for the rest of the game.
 * A player who reads nothing else knows what Value and Position mean before they
 * ever press a key.
 */

import { h, replace, plural } from '../ui/dom.js';
import { ledgerRow } from '../ui/ledger.js';
import * as prefs from '../prefs.js';

const MODES = [
  {
    id: 'local',
    name: 'Pass and play',
    desc: 'Two of you, one screen. Codes are masked while you type, and the screen hands off between turns.',
    tiles: [1, 1, 0, 0],
  },
  {
    id: 'online',
    name: 'Play online',
    desc: 'Open a room, send the code. Two devices, anywhere, same match.',
    tiles: [1, 0, 0, 1],
  },
  {
    id: 'cpu',
    name: 'Play the CPU',
    desc: 'Three levels. The Rookie forgets things. The Ace never wastes a question.',
    tiles: [1, 2, 2, 2],
  },
];

function keywordRow(letter, word, gloss, variant) {
  return h(
    'div',
    { class: `keyword__row keyword__row--${variant}` },
    h('span', { class: 'keyword__lead' }, letter),
    h('span', { class: 'keyword__rest' }, word),
    h('span', { class: 'keyword__gloss' }, gloss),
  );
}

/**
 * One rule item, guaranteed to be exactly two real elements: a bullet and a
 * text span. `.rules li` lays those two out in a two-column grid — mixing raw
 * text nodes and inline elements as direct grid children instead would leave
 * the browser to decide how many grid items that actually is, and every extra
 * item after the first two spills into a new row starting back at column one,
 * where it's stuck rewrapping one word per line inside the narrow bullet
 * column. Wrapping the varied inline content (text, `<strong>`, whatever) in
 * one span sidesteps that entirely: there are always exactly two items.
 */
function rule(...content) {
  return h(
    'li',
    null,
    h('span', { class: 'rules__mark', 'aria-hidden': 'true' }, '—'),
    h('span', { class: 'rules__text' }, ...content),
  );
}

export function menuScreen(host, { app }) {
  const record = prefs.summary();

  const hero = h(
    'header',
    { class: 'hero' },
    h('p', { class: 'eyebrow' }, 'A code-cracking duel'),
    h(
      'div',
      { class: 'keyword' },
      keywordRow('N', 'umber', 'Four digits, 1 to 9, none repeated.', 'n'),
      keywordRow('V', 'alue', 'How many of your digits are in their code.', 'v'),
      keywordRow('P', 'osition', 'How many of those are in the right slot.', 'p'),
    ),
    h(
      'p',
      { class: 'hero__lede' },
      'You each hide a code. You take turns guessing. Every guess comes back scored '
      + 'on those two numbers and nothing else — first to read the other\'s code wins.',
    ),
  );

  const modes = h('div', { class: 'modes' }, ...MODES.map((mode) => h(
    'button',
    { class: 'mode', type: 'button', onclick: () => app.go(mode.id) },
    h('div', { class: 'mode__tiles', 'aria-hidden': 'true' }, ...mode.tiles.map((state) => h('span', {
      class: `mode__tile ${state === 1 ? 'mode__tile--on' : ''} ${state === 2 ? 'mode__tile--half' : ''}`,
    }))),
    h('span', { class: 'mode__name' }, mode.name),
    h('span', { class: 'mode__desc' }, mode.desc),
  )));

  const stats = record.played
    ? h(
      'div',
      { class: 'statline' },
      h('span', null, plural(record.played, 'match', 'matches'), ' played'),
      h('span', null, h('b', null, String(record.wins)), ' won'),
      record.best
        ? h('span', null, 'fastest crack: ', h('b', null, `${record.best} rounds`))
        : null,
    )
    : null;

  const extra = h(
    'div',
    { class: 'statline' },
    h('button', {
      class: 'btn btn--ghost',
      type: 'button',
      onclick: () => app.go('rules'),
    }, 'How to play'),
    h('span', null, 'Four digits, two numbers back, no second chances.'),
  );

  replace(host, h('section', { class: 'screen' }, hero, modes, stats, extra));
  return { destroy() {} };
}

export function rulesScreen(host, { app }) {
  const example = h(
    'div',
    { class: 'worked' },
    h('p', { class: 'eyebrow' }, 'Worked example'),
    h('p', { class: 'dim' }, 'Their secret code is 4 7 1 9. You guess 1 7 3 2.'),
    h('ol', { class: 'ledger' }, ledgerRow({ index: 1, guess: '1732', value: 2, position: 1 })),
    h(
      'p',
      { class: 'note' },
      'Value 2 — the 1 and the 7 are both in their code. Position 1 — only the 7 is '
      + 'in the right slot. The 3 and the 2 are not in the code at all.',
    ),
  );

  const prose = h(
    'div',
    { class: 'prose' },
    h('p', { class: 'eyebrow' }, 'How to play'),
    h('h2', null, 'Two codes, one race'),
    h(
      'p',
      null,
      'Each player picks a secret code. Then you alternate guesses at each other\'s. '
      + 'A guess is never answered with which digits were right — only with how many.',
    ),
    h(
      'ul',
      { class: 'rules' },
      rule(h('strong', null, 'Four digits'), ', drawn from 1 to 9.'),
      rule(
        h('strong', null, 'No zero'), ' and ', h('strong', null, 'no repeats'),
        ' — in codes or in guesses. Every digit counts exactly once, which keeps the two scores unambiguous.',
      ),
      rule(h('strong', null, 'Value'), ' counts the digits you named that appear anywhere in their code.'),
      rule(h('strong', null, 'Position'), ' counts how many of those landed in the right slot. Position is never higher than Value.'),
      rule(
        'Position 4 means you have it. ', h('strong', null, 'Both players always finish the round'),
        ' — so going first is an advantage, not a win, and matching a crack in the same round is a draw.',
      ),
    ),
    example,
    h('h2', null, 'Reading the ledger'),
    h(
      'p',
      null,
      'Each attempt shows the same score twice: as pips and as numbers. '
      + 'A green pip is a digit in the right slot, an amber pip is a digit in the wrong slot, '
      + 'and a hollow pip is a digit that is not in the code at all.',
    ),
    h(
      'p',
      null,
      'While it is your turn you also get a private notepad. Tap a digit to cycle it '
      + 'through maybe, in, and out — the keypad picks up the same marks, and nobody '
      + 'else ever sees them.',
    ),
    h(
      'div',
      { class: 'overlay__actions', style: { maxWidth: '24rem' } },
      h('button', {
        class: 'btn btn--primary',
        type: 'button',
        onclick: () => app.go('menu'),
      }, 'Back to the menu'),
    ),
  );

  replace(host, h('section', { class: 'screen screen--narrow' }, prose));
  return { destroy() {} };
}
