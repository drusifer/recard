/**
 * Host-only save/restore of the authoritative game state (D26, US-37).
 *
 * Pure functions over an injected storage object (`{getItem, setItem,
 * removeItem}`) rather than reaching for `localStorage` directly, so the
 * whole module unit-tests against a plain Map with no browser - same
 * reasoning as `seating.js`, `dropTarget.js` and `pileActions.js`.
 *
 * Only the host ever calls this. Guests hold a redacted view (D3/D7) and
 * have nothing worth persisting.
 */

/** Bump when the snapshot shape changes; older blobs are then discarded. */
export const SNAPSHOT_VERSION = 2; // 2 = hands included (D31); v1 blobs have none and are discarded

export const STORAGE_KEY = 'recard:host-state:v1';

/**
 * Builds the object that gets written to disk.
 *
 * **Hand piles ARE written now (D31), reversing D26.** D26 stripped them
 * for a reason that was correct at the time: hands were keyed by a
 * PeerJS id guests regenerated on every join, so a restored hand
 * belonged to nobody. D27 replaced that with a client-held `playerKey`
 * presented on reconnect, so the premise is gone - and following D26's
 * letter after its reason expired would mean restoring a game to empty
 * hands, which is not restoring a game.
 *
 * Restoration is by `playerKey` only, never by name (a Sprint 6 table
 * genuinely had two players called "Drew"). Hand piles already carry
 * `ownerId`, `ownerId` is already a `playerKey`, and `resolvePlayer`
 * already refuses an unknown key someone else's seat - so there is no
 * new matching logic here, only the absence of a filter.
 *
 * **The cost, stated rather than implied:** hands now land on disk in
 * the host's own browser profile. That is a real reduction in a property
 * this project advertised, and the README and the restore prompt change
 * with it. It is a change of degree - the snapshot already kept the
 * deck's full remaining order, which breaks a game just as thoroughly -
 * but "already partly true" is not a licence to leave the docs wrong.
 */
export function snapshot(state, code, hostName) {
  return {
    version: SNAPSHOT_VERSION,
    savedAt: Date.now(),
    code: code ?? null,
    hostName: hostName ?? null,
    deckConfig: state.deckConfig,
    // D46: optional, additive - an OLDER snapshot restored after this
    // field existed simply won't have it, and `state.js`'s CREATE_ZONE
    // guard already treats a missing `gameConfig` as "allowed" (its
    // actual prior behavior), so no SNAPSHOT_VERSION bump is needed -
    // unlike D31's hands, absence here isn't a semantic gap to disallow.
    gameConfig: state.gameConfig,
    piles: state.piles,
    players: state.players,
    scores: state.scores,
    passed: state.passed,
  };
}

/**
 * Writes a snapshot. Storage can legitimately fail - Safari private
 * mode, a full quota, a blocked third-party context - and none of those
 * are worth interrupting a game over, so failures are swallowed and
 * reported rather than thrown.
 * @returns {boolean} whether it was actually written.
 */
export function save(storage, state, code, hostName) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshot(state, code, hostName)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads a snapshot back.
 *
 * Never throws and never half-restores: anything missing, unreadable,
 * from another version, or structurally wrong comes back as
 * `{ok: false, reason}` so the caller can start a clean table and say
 * why.
 *
 * @returns {{ok: true, state: object, code: string|null, ageMs: number}
 *          |{ok: false, reason: 'empty'|'corrupt'|'version'}}
 */
export function load(storage) {
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { ok: false, reason: 'empty' };
  }
  if (!raw) return { ok: false, reason: 'empty' };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }

  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'corrupt' };
  // Version is checked before shape: a future snapshot may legitimately
  // not have `piles`, and "you saved this in a newer version" is a more
  // useful thing to say than "your save is corrupt".
  if (parsed.version !== SNAPSHOT_VERSION) return { ok: false, reason: 'version' };
  if (!Array.isArray(parsed.piles) || !Array.isArray(parsed.players)) {
    return { ok: false, reason: 'corrupt' };
  }

  const { version, savedAt, code, hostName, ...state } = parsed;
  return {
    ok: true,
    state,
    code: code ?? null,
    hostName: hostName ?? null,
    ageMs: Math.max(0, Date.now() - (savedAt ?? 0)),
  };
}

/** Forgets the save. Safe to call when storage is unavailable. */
export function clear(storage) {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do - a save we can't delete is not worth a crash.
  }
}

/** "3 minutes ago" - so the host can judge whether a save is worth restoring. */
export function describeAge(ageMs) {
  const mins = Math.floor(ageMs / 60000);
  if (mins < 1) return 'less than a minute ago';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Who the host should wait for when restoring (D33, US-45).
 *
 * NOT "everyone in the saved game". The snapshot stores `state.players`
 * verbatim, `connection` included, so a player who quit long before the
 * host reloaded is still in that list - and waiting for them waits
 * forever for someone who is never coming, so the auto-resume never
 * fires. That would be a worse dead-end than the one this replaces
 * (Smith Gate 1 blocker).
 *
 * Fails soft on a malformed snapshot: `load` already refuses corrupt
 * blobs, and this must not become the one path that throws during a
 * restore.
 *
 * @param {{players?: unknown}} snap a loaded snapshot
 * @param {string} hostKey the host's own playerKey - never waited for
 * @returns {{id: string, name: string}[]}
 */
export function expectedReturners(snap, hostKey) {
  const players = snap?.players;
  if (!Array.isArray(players)) return [];
  return players.filter((p) => p && p.id !== hostKey && p.connection === 'connected');
}
