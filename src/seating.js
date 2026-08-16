/**
 * Pure, client-side seat geometry (D18, US-26). No DOM/network
 * dependency, same reasoning as handOrder.js (D14) - keeping this in
 * its own module makes the actual math unit-testable directly, instead
 * of only verifiable indirectly through DOM position assertions in the
 * e2e suite.
 */

/**
 * Rotates `players` so the viewer is seated first (bottom of the
 * table), everyone else keeping their existing relative order around
 * the rest. Pure per-viewer presentation - every client computes its
 * own rotation from the same shared roster, no synchronization needed.
 * @param {{id: string}[]} players
 * @param {string} viewerId
 * @returns {{id: string}[]}
 */
export function seatedOrder(players, viewerId) {
  const idx = players.findIndex((p) => p.id === viewerId);
  if (idx <= 0) return players;
  return [...players.slice(idx), ...players.slice(0, idx)];
}

/**
 * Position (as a % of the table surface) for seat `index` out of
 * `count` total seats, at the given `radius` (% from center). Index 0
 * is always the bottom-center seat - callers pass a player list already
 * rotated via `seatedOrder` so the viewer's own seat lands here
 * regardless of join order.
 * @param {number} index
 * @param {number} count
 * @param {number} [radius] defaults to 42 (stays inside the surface,
 *   under the 50% edge); a smaller radius places content (e.g. personal
 *   zones) toward the center instead of the edge.
 * @returns {{leftPct: number, topPct: number}}
 */
export function seatPosition(index, count, radius = 42) {
  const angle = (2 * Math.PI * index) / count;
  return { leftPct: 50 + radius * Math.sin(angle), topPct: 50 + radius * Math.cos(angle) };
}
