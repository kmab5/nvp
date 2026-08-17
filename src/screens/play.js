/**
 * One play screen for all three modes.
 *
 * Every controller (hot-seat, CPU, online) exposes the same view shape, so this
 * file never branches on mode except where the mode genuinely changes what the
 * player sees — a room code in the HUD, a handoff card between hot-seat turns.
 *
 * Re-rendering is wholesale but guarded by a signature check, because the online
 * poller fires every second or so and rebuilding on every poll would restart the
 * row animations and feel jittery.
 */

import { h, replace, plural } from '../ui/dom.js';
import { createCodePad } from '../ui/codepad.js';
import { renderLedger, createNotes } from '../ui/ledger.js';
import { CODE_LENGTH } from '../../shared/engine.js';
import { copyText, shareLink } from '../net.js';
import * as sfx from '../sfx.js';

export function playScreen(host, { match, app }) {
  const root = h('section', { class: 'screen screen--play' });
  const play = h('div', { class: 'play' });
  const hud = h('div', { class: 'hud' });
  const boardsEl = h('div', { class: 'boards' });
  const segmented = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Which board to show' });
  const consoleEl = h('div', { class: 'console' });
  const overlayHost = h('div');

  /**
   * Keep the screen awake during a match. Thinking about a guess involves
   * long stretches of not touching anything, and a phone dimming mid-deduction
   * is exactly the wrong moment. Released on teardown, and re-acquired after
   * the OS drops it on tab switch.
   */
  let wakeLock = null;
  async function acquireWakeLock() {
    if (!('wakeLock' in navigator) || document.hidden) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch {
      /* denied, unsupported, or battery saver — not worth surfacing */
    }
  }
  const onVisible = () => { if (!document.hidden && !wakeLock) acquireWakeLock(); };
  document.addEventListener('visibilitychange', onVisible);
  acquireWakeLock();

  play.append(hud, segmented, boardsEl, consoleEl);
  root.append(play, overlayHost);
  replace(host, root);

  let visibleBoard = 0;
  let error = null;
  let copied = false;
  let resultHidden = false;
  let signature = '';
  const seen = new Map();       // board key -> how many rows we have already shown
  const notesBySeat = new Map();
  let guessPad = null;
  let secretPad = null;
  let lastSecretSeat = null;

  function notesFor(view) {
    const key = view.mode === 'local' ? view.seat : 'solo';
    if (!notesBySeat.has(key)) {
      notesBySeat.set(key, createNotes({ onChange: () => guessPad?.refresh() }));
    }
    return notesBySeat.get(key);
  }

  async function submitGuess(code) {
    error = null;
    const outcome = await match.guess(code);
    if (!outcome.ok) {
      error = outcome.error;
      sfx.play('reject');
      render();
      return;
    }
    sfx.play(outcome.score && outcome.score.position === CODE_LENGTH ? 'crack' : 'submit');
    guessPad?.reset();
    render();
  }

  async function submitSecret(code) {
    error = null;
    const outcome = await match.setSecret(code);
    if (!outcome.ok) {
      error = outcome.error;
      sfx.play('reject');
      render();
      return;
    }
    sfx.play('submit');
    secretPad?.reset();
    render();
  }

  // --- pieces ------------------------------------------------------------

  function renderHud(view) {
    const parts = [];

    if (view.phase === 'playing' || view.phase === 'over') {
      parts.push(h('span', { class: 'hud__round' }, 'Round ', h('b', null, String(view.round))));
    } else if (view.phase === 'setup') {
      parts.push(h('span', { class: 'hud__round' }, 'Setting codes'));
    } else if (view.phase === 'lobby') {
      parts.push(h('span', { class: 'hud__round' }, 'Room open'));
    }

    if (view.phase === 'playing') {
      const yours = view.yourTurn;
      const who = view.mode === 'local'
        ? `${view.me.name} to guess`
        : (yours ? 'Your move' : `${view.them.name} to move`);
      parts.push(h(
        'span',
        { class: `hud__turn ${yours ? 'hud__turn--you' : 'hud__turn--them'}` },
        h('span', { class: 'hud__dot' }),
        who,
      ));
    }

    if (view.phase === 'over' && resultHidden) {
      parts.push(h('button', {
        class: 'btn btn--quiet',
        type: 'button',
        onclick: () => { resultHidden = false; render(); },
      }, '← Show result'));
    }

    if (view.connection === 'stalled') {
      parts.push(h('span', { class: 'hud__link' }, 'Reconnecting'));
    } else if (view.connection === 'gone') {
      parts.push(h('span', { class: 'hud__link' }, 'Room closed'));
    }

    parts.push(h('span', { class: 'hud__spacer' }));

    if (view.mode === 'cpu' && view.difficulty) {
      parts.push(h('span', { class: 'dim' }, `vs ${view.difficulty.name}`));
    }

    if (view.mode === 'online' && view.room) {
      parts.push(h(
        'button',
        {
          class: 'btn btn--quiet hud__room',
          type: 'button',
          title: 'Copy the invite link',
          onclick: async () => {
            copied = await copyText(shareLink(view.room));
            render();
            setTimeout(() => { copied = false; render(); }, 1800);
          },
        },
        view.room,
        h('span', { class: 'faint' }, copied ? 'copied' : 'copy'),
      ));
    }

    parts.push(h('button', {
      class: 'btn btn--quiet',
      type: 'button',
      'aria-label': sfx.enabled() ? 'Turn sound off' : 'Turn sound on',
      onclick: () => { sfx.toggle(); render(); },
    }, sfx.enabled() ? 'Sound on' : 'Sound off'));

    parts.push(h('button', {
      class: 'btn btn--quiet',
      type: 'button',
      onclick: () => app.leaveMatch(),
    }, 'Leave'));

    replace(hud, ...parts);
  }

  function renderBoards(view) {
    // Before the first guess there is nothing to read, and two empty panels just
    // push the code entry below the fold.
    const started = view.phase === 'playing' || view.phase === 'over';
    const boards = started ? (view.boards || []) : [];
    if (!boards.length) {
      replace(boardsEl);
      replace(segmented);
      return;
    }

    replace(segmented, ...boards.map((board, i) => h('button', {
      type: 'button',
      'aria-pressed': String(i === visibleBoard),
      onclick: () => { visibleBoard = i; render(); },
    }, board.title)));

    replace(boardsEl, ...boards.map((board, i) => {
      const previously = seen.get(board.key) ?? 0;
      const fresh = board.guesses.length > previously ? board.guesses.length : -1;
      seen.set(board.key, board.guesses.length);

      return h(
        'div',
        {
          class: `board ${board.active ? 'board--active' : ''}`,
          dataset: { hidden: String(i !== visibleBoard) },
        },
        h(
          'div',
          { class: 'board__head' },
          h('h2', { class: 'board__who' }, board.title, ' ', h('span', null, board.sub)),
          h('span', { class: 'board__count' }, plural(board.guesses.length, 'try', 'tries')),
        ),
        renderLedger({
          guesses: board.guesses,
          empty: 'No attempts yet.',
          freshIndex: fresh,
        }),
      );
    }));
  }

  function statusBlock(title, sub, { spinner = false, thinking = false } = {}) {
    return h(
      'div',
      { class: 'console__status' },
      h('p', { class: 'console__status-title' }, title),
      sub ? h('p', { class: 'dim' }, sub) : null,
      thinking ? h('div', { class: 'thinking' }, h('span'), h('span'), h('span')) : null,
      spinner ? h('p', { class: 'waiting' }, h('span', { class: 'spinner' }), 'Waiting') : null,
    );
  }

  function renderConsole(view) {
    consoleEl.classList.toggle('console--live', Boolean(view.yourTurn));
    const alert = error ? h('p', { class: 'alert', role: 'alert' }, error) : null;

    if (view.phase === 'connecting') {
      return replace(consoleEl, statusBlock('Joining the room', null, { spinner: true }));
    }

    if (view.phase === 'lobby') {
      return replace(consoleEl, h(
        'div',
        { class: 'console__status' },
        h('p', { class: 'eyebrow' }, 'Room open'),
        h('p', { class: 'roomcode__value' }, view.room),
        h('p', { class: 'dim' }, 'Send the code or the link. The match starts as soon as they join.'),
        h(
          'div',
          { class: 'overlay__actions', style: { maxWidth: '22rem' } },
          h('button', {
            class: 'btn btn--primary',
            type: 'button',
            onclick: async () => {
              copied = await copyText(shareLink(view.room));
              render();
            },
          }, copied ? 'Link copied' : 'Copy invite link'),
        ),
        h('p', { class: 'waiting' }, h('span', { class: 'spinner' }), 'Waiting for a second player'),
      ));
    }

    if (view.phase === 'setup') {
      const prompt = view.secretPrompt;
      if (prompt && prompt.alreadySet) {
        return replace(consoleEl, statusBlock(
          'Code locked in',
          `Waiting for ${view.them.name} to set theirs.`,
          { spinner: true },
        ));
      }
      if (!secretPad || lastSecretSeat !== view.seat) {
        lastSecretSeat = view.seat;
        secretPad?.destroy();
        secretPad = createCodePad({
          masked: Boolean(prompt && prompt.masked),
          allowRandom: true,
          submitLabel: 'Lock it in',
          hint: prompt && prompt.masked
            ? 'Hidden as you type. Show it if you need to check.'
            : 'Type 1-9, Enter to lock it in',
          onSubmit: submitSecret,
        });
      }
      secretPad.setDisabled(Boolean(view.handoff) || view.busy);
      return replace(
        consoleEl,
        h(
          'div',
          { class: 'console__status', style: { paddingBottom: '0' } },
          h(
            'p',
            { class: 'eyebrow' },
            view.mode === 'local' && prompt ? `${prompt.name}'s secret code` : 'Your secret code',
          ),
          h('p', { class: 'console__status-title' }, `Choose ${CODE_LENGTH} digits`),
          h('p', { class: 'dim' }, 'No zero, no repeats. This is what your opponent has to break.'),
        ),
        alert,
        secretPad.el,
        prompt && prompt.opponentLocked && view.mode !== 'cpu'
          ? h('p', { class: 'note', style: { textAlign: 'center' } }, `${view.them.name} is ready.`)
          : null,
      );
    }

    if (view.phase === 'over') {
      const status = endStatus(view);
      return replace(consoleEl, h(
        'div',
        { class: 'console__status' },
        h('p', { class: 'eyebrow' }, 'Match over'),
        h('p', { class: 'console__status-title' }, view.result ? view.result.title : 'Match over'),
        status ? h('p', { class: 'dim' }, status) : null,
        h(
          'div',
          { class: 'console__actions' },
          ...endActions(view, 'console'),
        ),
      ));
    }

    // playing
    if (!view.yourTurn) {
      const waitingOn = view.mode === 'cpu'
        ? statusBlock(`${view.them.name} is thinking`, null, { thinking: true })
        : statusBlock(
          `${view.them.name}'s turn`,
          view.mode === 'online' ? 'You will get the move as soon as they guess.' : null,
          { spinner: view.mode === 'online' },
        );
      return replace(consoleEl, waitingOn);
    }

    const notes = notesFor(view);
    if (!guessPad) {
      guessPad = createCodePad({
        submitLabel: 'Submit guess',
        hint: 'Type 1-9, Enter to submit, Esc to clear',
        onSubmit: submitGuess,
        digitStates: () => notesFor(match.view()).states(),
      });
    }
    guessPad.setDisabled(Boolean(view.handoff) || view.busy);

    return replace(consoleEl, h(
      'div',
      { class: 'console__grid' },
      h(
        'div',
        { style: { display: 'grid', gap: 'var(--gap-3)' } },
        h(
          'p',
          { class: 'eyebrow', style: { textAlign: 'center' } },
          view.mode === 'local' ? `${view.me.name} → ${view.them.name}'s code` : `Break ${view.them.name}'s code`,
        ),
        alert,
        guessPad.el,
      ),
      notes.el,
    ));
  }

  /**
   * The end-of-match controls, built once and rendered in two places: inside the
   * result overlay, and in the console once the overlay is dismissed to look at
   * the board. Duplicating them would let the two drift, and the console copy is
   * the one that matters — a player who clicks "View final board" must not be
   * stranded with no way to rematch or leave.
   *
   * @param {'overlay'|'console'} placement
   */
  function endActions(view, placement) {
    const result = view.result;
    const rematch = result.rematch;
    const buttons = [];

    if (placement === 'overlay') {
      buttons.push(h('button', {
        class: 'btn btn--ghost',
        type: 'button',
        onclick: () => { resultHidden = true; render(); },
      }, 'View final board'));
    } else {
      buttons.push(h('button', {
        class: 'btn btn--ghost',
        type: 'button',
        onclick: () => { resultHidden = false; render(); },
      }, 'Show result'));
    }

    buttons.push(h('button', {
      class: 'btn btn--ghost',
      type: 'button',
      onclick: () => app.leaveMatch(),
    }, 'Main menu'));

    // Offline modes: nobody to negotiate with, so replaying is unconditional.
    if (view.mode !== 'online') {
      buttons.push(h('button', {
        class: 'btn btn--primary',
        type: 'button',
        onclick: startRematch,
      }, 'Play again'));
      return buttons;
    }

    if (rematch && !rematch.opponentPresent) {
      // Nothing to accept — the seat is empty.
      return buttons;
    }

    if (rematch && rematch.theyWant && !rematch.iWant) {
      buttons.push(h('button', {
        class: 'btn btn--ghost',
        type: 'button',
        onclick: async () => {
          await match.declineRematch();
          app.leaveMatch();
        },
      }, 'Decline'));
      buttons.push(h('button', {
        class: 'btn btn--primary',
        type: 'button',
        onclick: startRematch,
      }, 'Accept rematch'));
      return buttons;
    }

    buttons.push(h('button', {
      class: 'btn btn--primary',
      type: 'button',
      disabled: Boolean(rematch && rematch.iWant),
      onclick: startRematch,
    }, rematch && rematch.iWant ? 'Waiting…' : 'Rematch'));
    return buttons;
  }

  function startRematch() {
    error = null;
    resultHidden = false;
    seen.clear();
    for (const notes of notesBySeat.values()) notes.clear();
    guessPad?.reset();
    secretPad?.reset();
    match.rematch();
  }

  /** The one-line status above the end-of-match buttons, if there is one. */
  function endStatus(view) {
    const result = view.result;
    if (!result) return null;
    const rematch = result.rematch;
    if (rematch && !rematch.opponentPresent) {
      return `${rematch.opponentName} left the room.`;
    }
    if (rematch && rematch.theyWant && !rematch.iWant) {
      return `${rematch.opponentName} wants a rematch.`;
    }
    return result.pending || null;
  }

  function renderOverlays(view) {
    if (view.handoff) {
      return replace(overlayHost, h(
        'div',
        { class: 'overlay overlay--gate' },
        h(
          'div',
          { class: 'overlay__card' },
          h('p', { class: 'eyebrow' }, 'Pass the device'),
          h('p', { class: 'overlay__title' }, view.handoff.name),
          h('p', { class: 'overlay__body' }, `Hand it over ${view.handoff.reason}. Nobody else should be looking.`),
          h('button', {
            class: 'btn btn--primary btn--wide',
            type: 'button',
            autofocus: true,
            onclick: () => { sfx.play('tap'); match.acknowledgeHandoff(); },
          }, `I'm ${view.handoff.name}`),
        ),
      ));
    }

    const result = view.result;
    if (!result) return replace(overlayHost);
    if (resultHidden) return replace(overlayHost);

    const titleClass = result.kind === 'draw'
      ? 'overlay__title'
      : `overlay__title ${/^You /.test(result.title) ? 'overlay__title--win' : 'overlay__title--loss'}`;

    const status = endStatus(view);

    return replace(overlayHost, h(
      'div',
      { class: 'overlay' },
      h(
        'div',
        { class: 'overlay__card' },
        h('p', { class: 'eyebrow' }, result.kind === 'draw' ? 'Draw' : 'Result'),
        h('p', { class: titleClass }, result.title),
        h('p', { class: 'overlay__body' }, result.detail),
        h(
          'div',
          { class: 'reveal' },
          ...result.reveals.map((item) => h(
            'div',
            { class: 'reveal__row' },
            h(
              'span',
              { class: 'reveal__label' },
              item.label,
              item.rounds
                ? h('span', { class: 'faint' }, ` · broken in ${item.rounds}`)
                : h('span', { class: 'faint' }, ' · never broken'),
            ),
            h('span', { class: 'reveal__code' }, item.code || '····'),
          )),
        ),
        status ? h('p', { class: 'note' }, status) : null,
        h('div', { class: 'overlay__actions' }, ...endActions(view, 'overlay')),
      ),
    ));
  }

  function render() {
    const view = match.view();
    renderHud(view);
    renderBoards(view);
    renderConsole(view);
    renderOverlays(view);
  }

  /** Cheap change detection so the poller doesn't restart animations. */
  function signatureOf(view) {
    return JSON.stringify([
      view.phase, view.round, view.yourTurn, view.busy, view.seat,
      view.handoff, view.notice, view.connection, view.result,
      (view.boards || []).map((b) => [b.key, b.title, b.guesses.length, b.active]),
      view.secretPrompt,
      error, copied, resultHidden, sfx.enabled(), visibleBoard,
    ]);
  }

  const off = match.on(() => {
    const next = signatureOf(match.view());
    if (next === signature) return;
    signature = next;
    render();
  });

  signature = signatureOf(match.view());
  render();

  return {
    destroy() {
      off();
      guessPad?.destroy();
      secretPad?.destroy();
      document.removeEventListener('visibilitychange', onVisible);
      wakeLock?.release().catch(() => {});
      wakeLock = null;
    },
  };
}
