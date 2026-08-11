/**
 * Room storage.
 *
 * Two drivers behind one tiny interface:
 *
 *   redis  — used when Redis REST credentials are present in the environment
 *            (Vercel KV / Upstash both expose these). Survives across the many
 *            short-lived function instances Vercel will spin up.
 *   memory — used when they are not, so `vercel dev` and a fresh clone work with
 *            no setup at all. Single-instance only: fine locally, not for prod.
 *
 * Writes are compare-and-swap on a version counter, done inside a Lua script so
 * two players acting in the same millisecond can never clobber each other.
 */

const URL_KEYS = ['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL', 'REDIS_REST_URL'];
const TOKEN_KEYS = ['KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN', 'REDIS_REST_TOKEN'];

const firstEnv = (keys) => keys.map((k) => process.env[k]).find((v) => v && v.trim());

export const TTL_SECONDS = 60 * 60 * 6;

const CAS_SCRIPT = `
local current = redis.call('HGET', KEYS[1], 'v')
if (not current and ARGV[1] == '0') or current == ARGV[1] then
  redis.call('HSET', KEYS[1], 'v', ARGV[2], 'd', ARGV[3])
  redis.call('EXPIRE', KEYS[1], ARGV[4])
  return 1
end
return 0
`;

function redisDriver(url, token) {
  const base = url.replace(/\/+$/, '');

  async function command(args) {
    const res = await fetch(base, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args.map(String)),
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Redis command failed (${res.status}): ${await res.text()}`);
    }
    const payload = await res.json();
    if (payload.error) throw new Error(`Redis error: ${payload.error}`);
    return payload.result;
  }

  return {
    name: 'redis',
    async read(key) {
      const flat = await command(['HGETALL', key]);
      if (!flat || flat.length === 0) return { version: 0, data: null };
      const map = {};
      for (let i = 0; i < flat.length; i += 2) map[flat[i]] = flat[i + 1];
      if (!map.d) return { version: 0, data: null };
      return { version: Number(map.v) || 0, data: JSON.parse(map.d) };
    },
    async write(key, expectedVersion, data) {
      const ok = await command([
        'EVAL', CAS_SCRIPT, 1, key,
        expectedVersion, expectedVersion + 1, JSON.stringify(data), TTL_SECONDS,
      ]);
      return Number(ok) === 1;
    },
  };
}

function memoryDriver() {
  // Module scope survives warm invocations of a single instance. Deliberately
  // not clustered — the fallback exists for local development.
  const cells = new Map();
  const sweep = () => {
    const now = Date.now();
    for (const [key, cell] of cells) if (cell.expires < now) cells.delete(key);
  };
  // Both sides clone. The Redis driver serialises through JSON, so callers get a
  // private copy there; without cloning here, an in-place mutation would reach
  // stored state without passing the version check and the two drivers would
  // behave differently under contention.
  return {
    name: 'memory',
    async read(key) {
      sweep();
      const cell = cells.get(key);
      return cell
        ? { version: cell.version, data: structuredClone(cell.data) }
        : { version: 0, data: null };
    },
    async write(key, expectedVersion, data) {
      sweep();
      const cell = cells.get(key);
      const current = cell ? cell.version : 0;
      if (current !== expectedVersion) return false;
      cells.set(key, {
        version: expectedVersion + 1,
        data: structuredClone(data),
        expires: Date.now() + TTL_SECONDS * 1000,
      });
      return true;
    },
  };
}

const url = firstEnv(URL_KEYS);
const token = firstEnv(TOKEN_KEYS);

export const store = url && token ? redisDriver(url, token) : memoryDriver();
export const isPersistent = store.name === 'redis';

const keyFor = (roomId) => `nvp:room:${roomId}`;

export function readRoom(roomId) {
  return store.read(keyFor(roomId));
}

/** @returns {boolean} false when someone else wrote first — read again and retry. */
export function writeRoom(roomId, expectedVersion, data) {
  return store.write(keyFor(roomId), expectedVersion, data);
}

/**
 * Read, mutate, write — retrying from a fresh read whenever we lose a race.
 * `mutate` may throw an ApiError to reject the action.
 */
export async function updateRoom(roomId, mutate, attempts = 6) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { version, data } = await readRoom(roomId);
    const result = await mutate(data, version);
    if (result === undefined) return { version, data };
    const committed = await writeRoom(roomId, version, result);
    if (committed) return { version: version + 1, data: result };
    await new Promise((resolve) => setTimeout(resolve, 25 + attempt * 40));
  }
  const error = new Error('The room was busy. Try that again.');
  error.status = 409;
  throw error;
}
