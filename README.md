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

### Online play needs Redis — and it's free at this scale

Everything except online multiplayer works with zero configuration. Online rooms
need shared storage, because Vercel runs each request in a short-lived instance
and two players will not land in the same one — **this is true whether you poll
or use WebSockets.** Vercel does support WebSockets natively now, but a
connection is pinned to the instance that accepted it, there's no built-in way to
broadcast between instances, and Vercel's own guidance for exactly this situation
is to use Redis for durable state. Switching transports doesn't remove the need
for shared storage; it's the same requirement either way.

The good news: Upstash's free tier is 256MB and 500,000 commands a month, no
credit card required, and has been stable at that allowance since March 2025. A
single match here runs somewhere around 2,000–3,000 commands total across both
players' polling — call it a couple hundred matches a month before you'd ever be
billed.

1. In your Vercel project: **Storage → Create Database → Upstash Redis**.
2. Connect it to the project. That injects `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` automatically, for the **Production** environment as well
   as Preview — double check both if you connected it a while ago.
3. Redeploy.

`api/_lib/store.js` also accepts `UPSTASH_REDIS_REST_URL` / `..._TOKEN` if you'd
rather bring your own. **Without either pair it falls back to in-memory
storage**, which is fine locally and will behave erratically in production —
each request can land in a different instance with empty memory, so a room can
look like it vanished within seconds of being created. The online lobby now
checks this itself and shows a banner if it detects the fallback is live.

### Checking it actually worked

A quick manual test can lie to you here: if you create a room and it seems to
work, that may just mean one request landed on a warm instance that still has
last time's in-memory state, not that Redis is connected. The failure only shows
up once two players hit two *different* instances, which a solo click-through
won't reproduce. Three ways to check for real, cheapest first:

**1. Ask the deployed app directly.**

```bash
curl https://your-app.vercel.app/api/health
```

```json
{ "driver": "redis", "persistent": true, "ok": true, "roundTripMs": 42 }
```

`driver` tells you which storage backend is actually live — not which one you
configured, which one the code is using. If it says `"memory"` in production,
the env vars never reached the deployed functions (check they're set for the
**Production** environment specifically, not just Preview). Curl it again a
minute later; a driver that flips between `redis` and `memory` across requests
means only some instances see the credentials.

**2. Check your real credentials before you even deploy.**

```bash
# with KV_REST_API_URL / KV_REST_API_TOKEN in a local .env, or exported
npm run check-storage
```

This performs an actual write, read-back, and a deliberately stale write against
your database — the same compare-and-swap the game relies on for every guess —
and tells you plainly whether it held up. It's the same check `/api/health` does
in production, run from your machine against the same credentials before they're
live.

**3. Play a real cross-device match.** Deploy, then open the site on two separate
devices (or a phone plus a laptop — two tabs on one machine can share more state
than you'd expect). Create a room on one, join from the other, play it out. If a
room ever reports itself full when it shouldn't, or a valid room code 404s, that's
the in-memory fallback showing through — recheck step 1.

If you ever change providers or rotate a token, rerun `check-storage` before
redeploying — a stale or read-only token is the most common failure, and it looks
identical to "everything's fine" until the first write.

## How it works

No build step, no dependencies, no framework. ES modules straight to the browser,
one serverless function, and the game rules in a file both sides import.

```
shared/engine.js     rules, scoring, turn order, match resolution
src/                 client: match controllers, screens, UI components
api/game.js          the entire backend — one endpoint
api/health.js        driver + round-trip check, curl this after deploying
api/_lib/            room model and the storage adapter
scripts/             dev server, tests, storage checks, browser walkthrough
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
games, the online API end to end (secret leakage, turn enforcement, the rematch
handshake, concurrent writes), and — against a mock of Upstash's REST protocol —
that the Redis driver itself sends well-formed commands and survives a real race.
None of that touches your actual database; see "Checking it actually worked"
above for that.

`scripts/browsertest.py` drives a real browser through all three modes including
a two-context online match, and writes screenshots. It needs Playwright:

```bash
pip install playwright && playwright install chromium
npm start &                      # in another shell
python3 scripts/browsertest.py
```

---

A game by Sami.
