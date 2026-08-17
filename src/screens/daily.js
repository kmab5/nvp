/**
 * NVP Daily.
 *
 * One code, everyone, once a day. No opponent, eight attempts, and the result is
 * a grid of pips you can post without spoiling it for anyone — which is the
 * point: the share is how people find the game.
 */

import { h, replace, plural } from '../ui/dom.js';
import { createCodePad } from '../ui/codepad.js';
import { renderLedger, createNotes } from '../ui/ledger.js';
import { MAX_ATTEMPTS, formatCountdown } from '../../shared/daily.js';
import { createDailyMatch } from '../match/daily.js';
import { copyText } from '../net.js';
import * as sfx from '../sfx.js';

export function dailyScreen(host, { app }) {
  const match = createDailyMatch({ link: window.location.origin });
  const root = h('section', { class: 'screen screen--narrow' });
  replace(host, root);

  const notes = createNotes({ onChange: () => pad?.refresh() });
  let pad = null;
  let error = null;
  let copied = false;
  let signature = '';

  async function submit(code) {
    error = null;
    const outcome = match.guess(code);
    if (!outcome.ok) {
      error = outcome.error;
      sfx.play('reject');
      render();
      return;
    }
    pad.reset();
    render();
  }

  function histogram(view) {
    const { buckets, solved, played } = view.stats;
    // Nothing to plot until at least one puzzle has been solved — a column of
    // zeroes reads as broken rather than empty.
    if (!solved) {
      return h(
        'p',
        { class: 'note' },
        played === 1
          ? 'That was your first daily. Solve one and your record shows up here.'
          : `${plural(played, 'daily')} played, none solved yet.`,
      );
    }
    const peak = Math.max(1, ...buckets);
    return h(
      'div',
      { class: 'histogram' },
      h(
        'p',
        { class: 'eyebrow' },
        `Solved in — ${solved} of ${plural(played, 'daily')}`,
      ),
      ...buckets.map((count, i) => h(
        'div',
        { class: 'histogram__row' },
        h('span', { class: 'histogram__label' }, String(i + 1)),
        h(
          'div',
          {
            class: `histogram__bar ${view.solved && view.attempts === i + 1 ? 'histogram__bar--current' : ''}`,
            style: { width: `${Math.max(6, (count / peak) * 100)}%` },
          },
          h('span', null, String(count)),
        ),
      )),
    );
  }

  function renderDone(view) {
    const grid = view.shareText.split('\n').slice(2).join('\n');
    return h(
      'div',
      { class: 'daily__done' },
      h(
        'p',
        { class: `overlay__title ${view.solved ? 'overlay__title--win' : 'overlay__title--loss'}` },
        view.solved ? 'Cracked it' : 'Out of attempts',
      ),
      h(
        'p',
        { class: 'dim' },
        view.solved
          ? `Puzzle #${view.number} in ${plural(view.attempts, 'attempt')}.`
          : `Puzzle #${view.number}. The code was ${view.secret}.`,
      ),
      h(
        'div',
        { class: 'reveal' },
        h(
          'div',
          { class: 'reveal__row' },
          h('span', { class: 'reveal__label' }, "Today's code"),
          h('span', { class: 'reveal__code' }, view.secret),
        ),
        view.streak > 0
          ? h(
            'div',
            { class: 'reveal__row' },
            h('span', { class: 'reveal__label' }, 'Current streak'),
            h('span', { class: 'reveal__code' }, `${view.streak}`),
          )
          : null,
      ),
      h('pre', { class: 'daily__grid' }, grid),
      h(
        'div',
        { class: 'overlay__actions' },
        h('button', {
          class: 'btn btn--primary',
          type: 'button',
          onclick: async () => {
            // The native share sheet where it exists, clipboard everywhere else.
            if (navigator.share) {
              try {
                await navigator.share({ text: view.shareText });
                return;
              } catch {
                /* dismissed — fall through to copying */
              }
            }
            copied = await copyText(view.shareText);
            render();
            setTimeout(() => { copied = false; render(); }, 2000);
          },
        }, copied ? 'Copied' : 'Share result'),
        h('button', {
          class: 'btn btn--ghost',
          type: 'button',
          onclick: () => app.go('menu'),
        }, 'Main menu'),
      ),
      h('p', { class: 'daily__countdown' }, `Next puzzle in ${formatCountdown(view.msUntilNext)}`),
      histogram(view),
    );
  }

  function render() {
    const view = match.view();

    const header = h(
      'header',
      { class: 'daily__head' },
      h('p', { class: 'eyebrow' }, `Daily · puzzle #${view.number}`),
      h('h1', { class: 'setup__title' }, 'One code, everyone'),
      h(
        'p',
        { class: 'dim' },
        view.phase === 'over'
          ? 'Come back tomorrow for the next one.'
          : `${plural(view.remaining, 'attempt')} left. Everybody in the world gets this same code today.`,
      ),
      view.streak > 0
        ? h('p', { class: 'daily__streak' }, `🔥 ${view.streak} day streak`)
        : null,
    );

    const body = view.phase === 'over'
      ? renderDone(view)
      : h(
        'div',
        { class: 'daily__play' },
        error ? h('p', { class: 'alert', role: 'alert' }, error) : null,
        pad.el,
        notes.el,
      );

    replace(
      root,
      header,
      view.guesses.length
        ? h(
          'div',
          { class: 'panel', style: { padding: 'var(--gap-3)' } },
          renderLedger({ guesses: view.guesses, empty: '', freshIndex: view.guesses.length }),
        )
        : null,
      body,
      view.phase === 'over'
        ? null
        : h('button', {
          class: 'btn btn--quiet',
          type: 'button',
          onclick: () => app.go('menu'),
        }, 'Back to the menu'),
    );
  }

  pad = createCodePad({
    submitLabel: 'Submit guess',
    hint: `Type 1-9, Enter to submit · ${MAX_ATTEMPTS} attempts`,
    onSubmit: submit,
    digitStates: () => notes.states(),
  });

  // The countdown only exists on the finished screen, so tick just for that.
  const timer = setInterval(() => {
    if (match.view().phase !== 'over') return;
    const next = match.view().msUntilNext;
    const label = root.querySelector('.daily__countdown');
    if (label) label.textContent = `Next puzzle in ${formatCountdown(next)}`;
  }, 1000);

  const off = match.on(() => {
    const view = match.view();
    const next = JSON.stringify([view.phase, view.guesses.length, error, copied]);
    if (next === signature) return;
    signature = next;
    render();
  });

  render();

  return {
    destroy() {
      off();
      clearInterval(timer);
      pad.destroy();
    },
  };
}
