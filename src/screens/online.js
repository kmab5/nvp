/**
 * Online lobby.
 *
 * Three ways in: open a room, join one by code, or pick up a match you were
 * already in (a refresh mid-game shouldn't cost you the match, so the seat token
 * is kept locally and revalidated against the server before it's offered).
 */

import { h, replace } from '../ui/dom.js';
import { api, NetError } from '../net.js';
import * as prefs from '../prefs.js';

function normalize(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

export function onlineScreen(host, { app, params = {} }) {
  let name = prefs.get('names.online', '');
  let code = normalize(params.room || '');
  let error = null;
  let busy = false;
  let resumable = null;

  const body = h('div', { class: 'setup' });
  replace(host, h('section', { class: 'screen screen--narrow' }, body));

  async function checkResumable() {
    const saved = prefs.session.read();
    if (!saved) return;
    try {
      const { state } = await api.state(saved.room, saved.token);
      if (state.phase !== 'over' || state.opponent) {
        resumable = { ...saved, state };
        render();
      } else {
        prefs.session.clear();
      }
    } catch {
      prefs.session.clear();
    }
  }

  function guard(action) {
    return async () => {
      if (busy) return;
      busy = true;
      error = null;
      render();
      try {
        await action();
      } catch (problem) {
        error = problem instanceof NetError ? problem.message : 'Something went wrong.';
        busy = false;
        render();
      }
    };
  }

  const create = guard(async () => {
    prefs.set('names.online', name.trim());
    const response = await api.createRoom(name.trim() || 'Player 1');
    prefs.session.save({ room: response.room, token: response.token, seat: response.seat });
    app.startOnline(response);
  });

  const join = guard(async () => {
    if (code.length !== 5) {
      error = 'Room codes are five characters.';
      busy = false;
      render();
      return;
    }
    prefs.set('names.online', name.trim());
    const response = await api.joinRoom(code, name.trim() || 'Player 2');
    prefs.session.save({ room: response.room, token: response.token, seat: response.seat });
    app.startOnline(response);
  });

  const resume = guard(async () => {
    app.startOnline({
      room: resumable.room,
      token: resumable.token,
      seat: resumable.seat,
      state: resumable.state,
    });
  });

  function render() {
    const codeInput = h('input', {
      type: 'text',
      value: code,
      placeholder: 'ABC12',
      maxlength: 5,
      autocapitalize: 'characters',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': 'Room code',
      oninput: (event) => {
        const next = normalize(event.target.value);
        event.target.value = next;
        code = next;
      },
      onkeydown: (event) => { if (event.key === 'Enter') join(); },
    });

    replace(
      body,
      h(
        'div',
        { class: 'setup__head' },
        h('p', { class: 'eyebrow' }, 'Play online'),
        h('h1', { class: 'setup__title' }, 'Open a room or join one'),
        h('p', { class: 'setup__sub' }, 'Rooms hold two players and expire after six hours of quiet.'),
      ),

      resumable
        ? h(
          'div',
          { class: 'panel', style: { padding: 'var(--gap-3)', display: 'grid', gap: 'var(--gap-2)' } },
          h('p', { class: 'eyebrow' }, 'Match in progress'),
          h('p', null, `Room ${resumable.room} is still open.`),
          h('button', {
            class: 'btn btn--primary',
            type: 'button',
            disabled: busy,
            onclick: resume,
          }, 'Rejoin that match'),
          h('button', {
            class: 'btn btn--quiet',
            type: 'button',
            onclick: () => {
              api.leave(resumable.room, resumable.token).catch(() => {});
              prefs.session.clear();
              resumable = null;
              render();
            },
          }, 'Forget it'),
        )
        : null,

      h(
        'label',
        { class: 'field' },
        h('span', { class: 'eyebrow' }, 'Your name'),
        h('input', {
          type: 'text',
          value: name,
          placeholder: 'Player 1',
          maxlength: 14,
          autocomplete: 'off',
          oninput: (event) => { name = event.target.value; },
        }),
      ),

      error ? h('p', { class: 'alert', role: 'alert' }, error) : null,

      h('button', {
        class: 'btn btn--primary btn--wide',
        type: 'button',
        disabled: busy,
        onclick: create,
      }, busy ? 'Working…' : 'Open a new room'),

      h('p', { class: 'eyebrow', style: { textAlign: 'center' } }, 'or join with a code'),

      h('div', { class: 'field field--code' }, codeInput),

      h('button', {
        class: 'btn btn--wide',
        type: 'button',
        disabled: busy,
        onclick: join,
      }, 'Join room'),

      h('button', {
        class: 'btn btn--quiet',
        type: 'button',
        onclick: () => app.go('menu'),
      }, 'Back to the menu'),
    );
  }

  render();
  checkResumable();
  return { destroy() {} };
}
