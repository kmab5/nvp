# NVP — Number Value Position

A two-player code-cracking duel. Both players hide a four-digit code; you take
turns guessing at each other's, and every guess comes back scored on two numbers
and nothing else.

| | |
|---|---|
| **Value** | how many of your digits appear in their code |
| **Position** | how many of those are in the right slot |

Position 4 means you've read it. Live at **[nvp-kmab.vercel.app](https://nvp-kmab.vercel.app)**.

## Rules

- Codes and guesses are **four digits from 1–9**.
- **No zero, no repeated digits** — in codes or guesses. Every digit counts
  exactly once, which is what keeps the two scores unambiguous.
- Players alternate. **Both players always finish the round**, so moving first is
  an advantage rather than a free win: if you crack their code and they crack
  yours in the same round, it's a draw.
- Matches are capped at 30 rounds.

## Modes

**Pass and play** — two players, one device. Codes are masked while they're typed
and a full-screen handoff card blocks the board whenever the device should change
hands. The gate can be switched off for turns if you're playing on the honour
system. Guess history is public information in this game, so only the codes hide.

**Play online** — one player opens a room and shares the five-character code (or
the invite link). Works across any two devices. Rooms expire after six hours of
quiet, and a refresh mid-match rejoins your seat rather than forfeiting it.

**Play the CPU** — three levels. You always move first. Every level reasons only
from the scores you hand it, never from your code, so a win is a real win.

| Level | Average | Worst seen | How it plays |
|---|---|---|---|
| Rookie | 7.5 rounds | 20 | Remembers its last three clues, guesses wild a quarter of the time |
| Racer | 5.7 rounds | 14 | Long memory and solid deduction, still takes the odd flyer |
| Ace | 5.1 rounds | 7 | Picks the guess that splits the remaining codes most evenly |

Those numbers are measured, not guessed — `npm test` replays 220 solo games per
level. Worth knowing: the whole search space is only 3,024 codes, so a competent
solver is already near-optimal. The Ace's real edge over the Racer is consistency
(worst case 7 versus 14), not average speed.

## Running it

```bash
npm start           # http://localhost:3000 — no install, no account
npm test            # rules, CPU strength, and the online API
```

`npm start` runs a small Node server that serves the static files and the API
function, reproducing what Vercel does in production. `vercel dev` works too if
you have the CLI.

## Deploying to Vercel

Import the repo — there's no build step, so the defaults are right. Framework
preset **Other**, build command empty, output directory the repo root.

### Online play needs Redis

Everything except online multiplayer works with zero configuration. Online rooms
need shared storage, because Vercel runs each request in a short-lived instance
and two players will not land in the same one.

1. In your Vercel project: **Storage → Create Database → Upstash Redis** (the
   free tier is far more than this game needs).
2. Connect it to the project. That injects `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` automatically.
3. Redeploy.

`api/_lib/store.js` also accepts `UPSTASH_REDIS_REST_URL` / `..._TOKEN` if you'd
rather bring your own. **Without either pair it falls back to in-memory storage**,
which is fine locally and will behave erratically in production — rooms appear to
vanish as requests hit different instances. The API reports which driver is live
in its `persistent` field, and `npm start` prints it at boot.

## How it works

No build step, no dependencies, no framework. ES modules straight to the browser,
one serverless function, and the game rules in a file both sides import.

```
shared/engine.js     rules, scoring, turn order, match resolution
src/                 client: match controllers, screens, UI components
api/game.js          the entire backend — one endpoint
api/_lib/            room model and the storage adapter
scripts/             dev server, tests, browser walkthrough
```

A few decisions worth knowing about if you come back to this later:

**The rules live in one file.** `shared/engine.js` is imported verbatim by both
the browser and the serverless function. Scoring cannot drift between what you
see and what the server records, because there is only one implementation.

**Turn order isn't stored, it's derived.** Whose move it is, the round number and
the result are all computed from the two guess lists. Seat A moves when the lists
are level, seat B when it owes one. There's no turn pointer for two simultaneous
requests to disagree about, and each player only ever appends to their own list.
It also gives the second player their reply for free — the match can't be decided
until both lists are the same length.

**Secrets never leave the server.** In online play the client posts a guess and
the server scores it against a code the client has never seen. You can't read the
answer out of the network tab, and you can't lie about your own score. Codes are
released only once the match is over.

**Polling, not sockets.** Vercel doesn't keep processes alive, and this is a
turn-based game — the client polls faster while it's waiting on the opponent and
eases off when the move is its own. Writes are compare-and-swap on a version
counter inside a Lua script, so two players acting in the same millisecond can't
clobber each other.

**One play screen, three modes.** Each controller in `src/match/` exposes the same
view shape, so `src/screens/play.js` only branches where the mode genuinely
changes what a player sees.

### API

```
GET  /api/game?room=ABCDE&token=…      state, redacted for you
POST /api/game  { action, … }          create · join · secret · guess · rematch · leave
```

## Design

NVP takes its palette from the [kmab brand kit](https://github.com/kmab5/kmab-brand)
but assigns it its own meaning, and the assignment is absolute: **Value is always
amber, Position is always green**, purple is the game itself (your turn, focus,
primary action). Nothing else in the interface is allowed those three colours, so
a colour anywhere on screen means exactly one thing. Type is Space Grotesk with
Space Mono for anything numeric.

The menu hero is the acronym expanded — it doubles as the rules, in the colours
those two words wear for the rest of the game.

> `assets/og.png` was generated offline without the brand fonts installed, so its
> lettering is a stand-in. Regenerate it with Space Grotesk and Space Mono if you
> want it exactly on-brand.

## Testing

`npm test` covers the rules, the symmetry of scoring, turn order, match
resolution including the both-crack-in-one-round draw, CPU strength across 660
games, and the online API end to end — secret leakage, turn enforcement, the
rematch handshake and concurrent writes.

`scripts/browsertest.py` drives a real browser through all three modes including
a two-context online match, and writes screenshots. It needs Playwright:

```bash
pip install playwright && playwright install chromium
npm start &                      # in another shell
python3 scripts/browsertest.py
```

---

A game by Sami.
