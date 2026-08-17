/**
 * App shell.
 *
 * A five-screen router with no history stack: the top bar's mark is always the way
 * out, and leaving a match is explicit because abandoning an online room mid-turn
 * has consequences for the other player.
 */

import { h, replace, svg } from './ui/dom.js';
import { menuScreen, rulesScreen } from './screens/menu.js';
import { dailyScreen } from './screens/daily.js';
import { localSetupScreen, cpuSetupScreen } from './screens/setup.js';
import { onlineScreen } from './screens/online.js';
import { playScreen } from './screens/play.js';
import { createLocalMatch } from './match/local.js';
import { createCpuMatch } from './match/cpu.js';
import { createOnlineMatch } from './match/online.js';
import * as prefs from './prefs.js';
import * as pwa from './pwa.js';

function mark() {
  // NVP's own mark: four slots, two solved. Purple for the game, green for a
  // digit in position, amber for a digit found but misplaced.
  const cell = (x, y, fill, stroke) => svg('rect', {
    x, y, width: 9, height: 9, rx: 2, fill, stroke, 'stroke-width': 1.4,
  });
  return svg(
    'svg',
    { class: 'brand__mark', viewBox: '0 0 22 22', 'aria-hidden': 'true' },
    cell(1, 1, 'var(--purple-500)', 'none'),
    cell(12, 1, 'none', 'var(--line-strong)'),
    cell(1, 12, 'var(--amber-500)', 'none'),
    cell(12, 12, 'var(--green-500)', 'none'),
  );
}

function shell() {
  const host = h('main', { id: 'view' });

  const brand = h(
    'button',
    { class: 'brand', type: 'button', 'aria-label': 'NVP home' },
    mark(),
    h('span', { class: 'brand__word' }, 'NVP'),
  );

  const status = h('div', { class: 'topbar__status' });

  function renderStatus() {
    const bits = [];
    if (!pwa.isOnline()) {
      bits.push(h('span', { class: 'pill pill--warn', title: 'Online rooms need a connection' }, 'Offline'));
    }
    if (pwa.hasUpdate()) {
      bits.push(h('button', {
        class: 'pill pill--action',
        type: 'button',
        // Never automatic: activating the new worker reloads the page, and
        // doing that mid-match would cost someone their turn.
        onclick: () => pwa.applyUpdate(),
      }, 'Update ready'));
    }
    replace(status, ...bits);
  }

  pwa.subscribe(renderStatus);
  renderStatus();

  const topbar = h(
    'div',
    { class: 'topbar' },
    brand,
    h('span', { class: 'topbar__spacer' }),
    status,
    h('span', { class: 'eyebrow' }, 'Number · Value · Position'),
  );

  const footer = h(
    'footer',
    { class: 'footer' },
    h('span', null, 'NVP — a game by Sami'),
    h('a', { href: 'https://github.com/kmab5/nvp', rel: 'noopener' }, 'source'),
    h('span', { class: 'topbar__spacer' }),
    h('span', { class: 'mono' }, '1–9 · no zero · no repeats'),
  );

  const app = h('div', { class: 'app' }, topbar, host, footer);
  document.body.append(app);
  return { host, brand };
}

const { host, brand } = shell();

const SCREENS = {
  menu: menuScreen,
  rules: rulesScreen,
  daily: dailyScreen,
  local: localSetupScreen,
  cpu: cpuSetupScreen,
  online: onlineScreen,
  play: playScreen,
};

let current = null;
let match = null;

const app = {
  go(name, props = {}) {
    if (name !== 'play') closeMatch();
    current?.destroy?.();
    const screen = SCREENS[name] || SCREENS.menu;
    current = screen(host, { app, ...props });
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.title = name === 'menu'
      ? 'NVP — Number Value Position'
      : `NVP — ${name === 'play' ? 'match' : name}`;
  },

  startLocal(config) {
    closeMatch();
    match = createLocalMatch(config);
    app.go('play', { match });
  },

  startCpu({ difficulty }) {
    closeMatch();
    match = createCpuMatch({ difficulty, playerName: 'You' });
    app.go('play', { match });
  },

  startOnline({ room, token, seat, state }) {
    closeMatch();
    match = createOnlineMatch({ room, token, seat, initialState: state });
    // Keep the invite in the address bar so a refresh lands in the right place.
    history.replaceState(null, '', `?room=${room}`);
    app.go('play', { match });
  },

  leaveMatch() {
    closeMatch();
    history.replaceState(null, '', window.location.pathname);
    app.go('menu');
  },
};

function closeMatch() {
  if (!match) return;
  match.quit();
  match = null;
}

brand.addEventListener('click', () => {
  if (match) {
    const stakes = match.mode === 'online'
      ? 'Leave the match? Your opponent will be told the seat is free.'
      : 'Leave the match? Progress will be lost.';
    // eslint-disable-next-line no-alert
    if (!window.confirm(stakes)) return;
  }
  app.leaveMatch();
});

pwa.register();

// A shared invite link (?room=ABC12) drops you straight into the join flow.
const params = new URLSearchParams(window.location.search);
const invited = params.get('room');
// Home-screen shortcuts from the manifest land here (?mode=cpu / ?mode=local).
const shortcut = params.get('mode');

if (invited) {
  app.go('online', { params: { room: invited } });
} else if (shortcut === 'cpu' || shortcut === 'local' || shortcut === 'online' || shortcut === 'daily') {
  history.replaceState(null, '', window.location.pathname);
  app.go(shortcut);
} else if (prefs.session.read()) {
  app.go('online');
} else {
  app.go('menu');
}
