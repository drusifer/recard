/**
 * Stable player identity across reconnects (US-38, D27).
 *
 * A PeerJS id is an *address*, not an identity: guests get a fresh one
 * every time they connect, so hands keyed by it are orphaned the moment
 * anyone refreshes. The host therefore issues each player a `playerKey`
 * once, the client stores it, and presents it when it comes back. The
 * key is the identity; the peer id is only where that identity is
 * currently reachable.
 *
 * Pure and DOM-free so the reconnect rules are directly testable - the
 * same reasoning as `seating.js`, `pileActions.js` and `persistence.js`.
 *
 * **Threat model, stated rather than implied:** a `playerKey` is a
 * bearer token. Anyone who obtains one can claim that seat and see that
 * hand. That matches what the PRD already promises for a same-room
 * game - privacy is "reasonable effort, not a security guarantee"
 * (US-5) - and is no weaker than the existing model, where anyone with
 * the table code can join. It is *not* suitable if this ever becomes a
 * remote/public product.
 */

export const CLIENT_KEY_STORAGE = 'recard:player-key';

export function newPlayerKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `pk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Decides who a connecting peer *is*.
 *
 * @param {string|null|undefined} presentedKey the key the client sent, if any
 * @param {{id: string}[]} knownPlayers players already in game state
 * @param {Map<string,string>} peerToKey live peerId -> playerKey bindings
 * @returns {{playerKey: string, returning: boolean}}
 */
export function resolvePlayer(presentedKey, knownPlayers, peerToKey) {
  const known = presentedKey && knownPlayers.some((p) => p.id === presentedKey);
  if (!known) return { playerKey: newPlayerKey(), returning: false };

  // Refuse to hand a seat to a second peer while the first is still on
  // it: two tabs sharing one key would otherwise both claim the hand,
  // and the roster would flip between them. The newcomer gets a fresh
  // identity instead of silently hijacking a live player.
  const isAlreadyLive = [...peerToKey.values()].includes(presentedKey);
  if (isAlreadyLive) return { playerKey: newPlayerKey(), returning: false };

  return { playerKey: presentedKey, returning: true };
}

/**
The peer id currently bound to a player, or null if they're away.
*/
export function peerFor(playerKey, peerToKey) {
  for (const [peerId, key] of peerToKey) if (key === playerKey) return peerId;
  return null;
}

// --- Remembering the table you were in (US-39) --------------------------
// The playerKey says *who* you are; this says *where* you were. Together
// they're enough for a reload to rejoin the game in progress instead of
// dropping you back on an empty form.

export const CLIENT_SESSION_STORAGE = 'recard:last-session';

/**
@param {{code: string, name: string}} session
*/
export function rememberSession(storage, session) {
  try {
    storage.setItem(CLIENT_SESSION_STORAGE, JSON.stringify({ ...session, at: Date.now() }));
  } catch {
    // Private mode / quota - remembering is a convenience, never required.
  }
}

/**
@returns {{code: string, name: string}|null}
*/
export function recallSession(storage) {
  try {
    const raw = storage.getItem(CLIENT_SESSION_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Only trust a well-formed record: a half-written or hand-edited blob
    // should mean "no memory", never a broken auto-rejoin loop.
    if (!parsed || typeof parsed.code !== 'string' || typeof parsed.name !== 'string') return null;
    return { code: parsed.code, name: parsed.name };
  } catch {
    return null;
  }
}

export function forgetSession(storage) {
  try {
    storage.removeItem(CLIENT_SESSION_STORAGE);
  } catch {
    // Nothing to do.
  }
}
