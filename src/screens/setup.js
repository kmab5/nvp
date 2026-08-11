/**
 * Pre-match setup. Deliberately short: names and difficulty only. Secret codes are
 * collected on the play screen, where the handoff gate already lives.
 */

import { h, replace } from '../ui/dom.js';
import { LEVEL_ORDER, LEVELS } from '../cpu.js';
import * as prefs from '../prefs.js';

function nameField(label, value, placeholder, onInput) {
  const input = h('input', {
    type: 'text',
    value,
    placeholder,
    maxlength: 14,
    autocomplete: 'off',
    spellcheck: 'false',
    oninput: (event) => onInput(event.target.value),
  });
  return h('label', { class: 'field' }, h('span', { class: 'eyebrow' }, label), input);
}

export function localSetupScreen(host, { app }) {
  let nameA = prefs.get('names.p1', '');
  let nameB = prefs.get('names.p2', '');
  let gate = prefs.get('handoffGate', true);

  function start() {
    const names = {
      A: nameA.trim() || 'Player 1',
      B: nameB.trim() || 'Player 2',
    };
    prefs.set('names.p1', names.A);
    prefs.set('names.p2', names.B);
    prefs.set('handoffGate', gate);
    app.startLocal({ names, gate });
  }

  const body = h(
    'div',
    { class: 'setup' },
    h(
      'div',
      { class: 'setup__head' },
      h('p', { class: 'eyebrow' }, 'Pass and play'),
      h('h1', { class: 'setup__title' }, 'Who is playing?'),
      h('p', { class: 'setup__sub' }, 'You will each set a secret code on the next screen, one at a time.'),
    ),
    h(
      'div',
      { class: 'roster' },
      nameField('First player', nameA, 'Player 1', (v) => { nameA = v; }),
      nameField('Second player', nameB, 'Player 2', (v) => { nameB = v; }),
    ),
    h(
      'label',
      { class: 'switch' },
      h('input', {
        type: 'checkbox',
        checked: gate,
        onchange: (event) => { gate = event.target.checked; },
      }),
      'Show a handoff card between turns',
    ),
    h('p', { class: 'note' }, 'Guesses and scores are public — only the codes are hidden.'),
    h(
      'div',
      { class: 'overlay__actions' },
      h('button', {
        class: 'btn btn--ghost',
        type: 'button',
        onclick: () => app.go('menu'),
      }, 'Back'),
      h('button', {
        class: 'btn btn--primary',
        type: 'button',
        onclick: start,
      }, 'Start match'),
    ),
  );

  replace(host, h('section', { class: 'screen screen--narrow' }, body));
  return { destroy() {} };
}

export function cpuSetupScreen(host, { app }) {
  let chosen = prefs.get('lastDifficulty', 'racer');
  if (!LEVELS[chosen]) chosen = 'racer';
  const choices = h('div', { class: 'choices' });

  function bars(index, active) {
    return h('span', { class: 'choice__bars', 'aria-hidden': 'true' }, ...[0, 1, 2].map((i) => h('span', {
      class: `choice__bar ${i <= index ? 'choice__bar--on' : ''}`,
      style: { height: `${8 + i * 6}px`, opacity: i <= index ? '1' : '0.5' },
    })));
  }

  function renderChoices() {
    const record = prefs.get('record.cpu', {}) || {};
    replace(choices, ...LEVEL_ORDER.map((id, index) => {
      const level = LEVELS[id];
      const book = record[id];
      return h(
        'button',
        {
          class: 'choice',
          type: 'button',
          'aria-pressed': String(id === chosen),
          onclick: () => { chosen = id; renderChoices(); },
        },
        bars(index, id === chosen),
        h(
          'span',
          { style: { display: 'grid', gap: '2px' } },
          h('span', { class: 'choice__name' }, level.name, ' ', h('span', { class: 'choice__desc' }, `— ${level.tagline}`)),
          h('span', { class: 'choice__desc' }, level.blurb),
          h(
            'span',
            { class: 'choice__pace' },
            level.pace,
            book && book.best ? ` · your best: ${book.best} rounds` : '',
            book && (book.won || book.lost) ? ` · ${book.won || 0}W ${book.lost || 0}L` : '',
          ),
        ),
      );
    }));
  }

  renderChoices();

  const body = h(
    'div',
    { class: 'setup' },
    h(
      'div',
      { class: 'setup__head' },
      h('p', { class: 'eyebrow' }, 'Play the CPU'),
      h('h1', { class: 'setup__title' }, 'Pick your opponent'),
      h('p', { class: 'setup__sub' }, 'You move first in every round. All three levels reason only from the scores you give them.'),
    ),
    choices,
    h(
      'div',
      { class: 'overlay__actions' },
      h('button', {
        class: 'btn btn--ghost',
        type: 'button',
        onclick: () => app.go('menu'),
      }, 'Back'),
      h('button', {
        class: 'btn btn--primary',
        type: 'button',
        onclick: () => {
          prefs.set('lastDifficulty', chosen);
          app.startCpu({ difficulty: chosen });
        },
      }, 'Start match'),
    ),
  );

  replace(host, h('section', { class: 'screen screen--narrow' }, body));
  return { destroy() {} };
}
