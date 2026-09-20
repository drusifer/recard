/**
 * US-123/D144: everyone at the table gets a colour, derived - never
 * stored, never sent. Every client computes it from the replicated
 * roster, so the same person is the same colour on every screen.
 *
 * Colour is the primary "who did that" cue on a glow (D144), never the
 * only one: names stay on seats and in the roster, so the table is
 * still readable without colour vision (Smith, Gate 1 condition 4).
 */

/**
 * Eight hues, evenly spaced, at a lightness that reads on the felt in
 * both themes. More players than that simply wrap - a ninth player
 * shares the first hue rather than getting an unreadable near-duplicate.
 */
export const PLAYER_COLORS = [
  '#f2b134', '#4cb5f5', '#7bd389', '#ef6f6c',
  '#b08ee6', '#f58a4c', '#4fd1c5', '#e879b9',
];

/**
 * The colour for the person at `index` in the roster.
 * @param {number} index
 */
export function colorForIndex(index) {
  if (!Number.isInteger(index) || index < 0) return PLAYER_COLORS[0];
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

/**
 * The colour for `playerId`, given the roster it sits in. Someone not
 * on the roster (a player who has left, an id from an older snapshot)
 * has no colour - the caller shows no tint rather than inventing one.
 * @param {{id: string}[]} players
 * @param {string} playerId
 * @returns {string|null}
 */
export function colorForPlayer(players, playerId) {
  const index = players?.findIndex((p) => p.id === playerId) ?? -1;
  return index === -1 ? null : colorForIndex(index);
}
