// US-151/D176: ICE servers for the game master's headless pages, minted
// from Cloudflare Realtime TURN. A pod with only public-internet egress
// has no direct WebRTC path to a LAN browser (mDNS host candidates, no
// router hairpin) or to a player behind CGNAT, so every connection it
// makes is relayed (`iceTransportPolicy: 'relay'`). Players' browsers
// are unchanged.
//
// Set neither env variable and nothing here runs: no Cloudflare call, no
// relay, exactly the behaviour from before.

export const TURN_ENV = { keyId: 'CLOUDFLARE_TURN_KEY_ID', token: 'CLOUDFLARE_TURN_KEY_API_TOKEN' };
export const TURN_TTL_SECONDS = 86_400;
const REFRESH_FRACTION = 0.8;
const RETRY_MS = 60_000;
// Cloudflare's own docs: browsers block port 53 and time out on it.
const PORT_53 = /:53(\?|$)/;

/**
 * `{ keyId, token }` from `environment`, `null` when neither is set. Only one set
 * is a mistake, and the error names the missing one.
 */
export function turnKeyFromEnvironment(environment) {
  const keyId = environment[TURN_ENV.keyId];
  const token = environment[TURN_ENV.token];
  if (!keyId && !token) return null;
  if (!keyId || !token) throw new Error(`TURN relay needs both ${TURN_ENV.keyId} and ${TURN_ENV.token} - ${keyId ? TURN_ENV.token : TURN_ENV.keyId} is not set`);
  return { keyId, token };
}

/**
 * Asks Cloudflare for a fresh set of ICE servers good for `ttl` seconds.
 */
export async function mintIceServers({ keyId, token, ttl = TURN_TTL_SECONDS, fetch = globalThis.fetch }) {
  const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl }),
  });
  if (!response.ok) {
    const answer = await response.text();
    throw new Error(`Cloudflare TURN refused credentials (${response.status}): ${answer.trim()}`);
  }
  const { iceServers } = await response.json();
  return [iceServers].flat().map((server) => ({ ...server, urls: [server.urls].flat().filter((url) => !PORT_53.test(url)) }));
}

/**
 * Mints a set now (rejecting if Cloudflare refuses, so a bad key fails at
 * startup) and refreshes it at 80% of its TTL. A failed refresh keeps the
 * current set, which is still valid, and retries in a minute.
 * Resolves `{ config(), onRefresh(listener), stop() }`.
 */
export async function startTurnRelay({ key, fetch, setTimeout = globalThis.setTimeout, clearTimeout = globalThis.clearTimeout, onError = () => {} }) {
  const mint = () => mintIceServers({ ...key, fetch });
  let iceServers = await mint();
  const listeners = new Set();
  const config = () => ({ iceServers, iceTransportPolicy: 'relay' });
  let timer;
  const schedule = (delay) => {
    timer = setTimeout(refresh, delay);
    timer.unref?.();
  };
  async function refresh() {
    try {
      iceServers = await mint();
    } catch (error) {
      onError(error);
      schedule(RETRY_MS);
      return;
    }
    for (const listener of listeners) listener(config());
    schedule(TURN_TTL_SECONDS * 1000 * REFRESH_FRACTION);
  }
  schedule(TURN_TTL_SECONDS * 1000 * REFRESH_FRACTION);
  return {
    config,
    onRefresh: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop: () => clearTimeout(timer),
  };
}

const shared = { relay: undefined };
/**
 * This process's relay, started from `process.env` on first use; `null`
 * when the env sets none. Per process on purpose (D176): a child per
 * invite, and each bot, inherits the env and mints its own fresh set.
 */
export function sharedTurnRelay() {
  shared.relay ??= (async () => {
    const key = turnKeyFromEnvironment(process.env);
    if (!key) return null;
    return startTurnRelay({ key, onError: (error) => process.stderr.write(`turn relay: refresh failed, keeping the current credentials: ${error.message}\n`) });
  })();
  return shared.relay;
}
