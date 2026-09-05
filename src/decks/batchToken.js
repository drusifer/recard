/**
 * A short, unique-per-call token for namespacing the ids a deck build
 * produces (D108).
 *
 * Exists because two builds of the same list must not hand out the same
 * ids: `assertCardsConserved` (D88) treats the ids in play as a closed
 * set, and the RtG preset builds fifteen decks that share basic lands
 * while a `perPlayer` chip stack builds the same list once per player.
 *
 * `crypto.randomUUID()` is GUARDED, not called directly — it exists only
 * in a secure context, so over plain HTTP on a LAN address (exactly how
 * this app is played: one machine hosts, others join by IP) it is
 * undefined and throws `crypto.randomUUID is not a function`. Two
 * callers in this codebase already guard it this way
 * (`state.js`'s `randomPileId`, `identity.js`'s `newPlayerKey`); these
 * deck builders called it bare and broke Create Table for every preset
 * with a chip supply. The guard is the convention here, and the reason
 * for it is the deployment model, not paranoia.
 *
 * Uniqueness is all that is required — never unpredictability. Nothing
 * about a card's identity is a secret.
 */
export function batchToken() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
