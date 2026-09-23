// US-122/D143: adding a Jev bot from the table. The app cannot start a
// process, so the already-running Jev player is asked over the table's
// own talk channel (D138): it announces what it can play, watches for
// `spawn-bot` requests, and answers each with a `spawn-bot-result`.
//
// This module is the pure half - which requests are still unanswered,
// and whether one can be honoured. `tools/jev/runner.mjs` does the
// spawning and the talking.

/** @typedef {{ requestId: string, game: string, strategy: string }} SpawnRequest */

/**
 * Requests in `talk` that nobody has answered yet. A request already
 * answered IN THE LOG is skipped as well as one this supervisor
 * handled itself, so two Jev players at the same table don't both
 * spawn the same bot.
 * @param {{ data?: unknown }[]} talk
 * @param {Set<string>} handled request ids this supervisor already answered
 * @returns {SpawnRequest[]}
 */
export function pendingSpawnRequests(talk, handled) {
  const answered = new Set(talk.map((e) => (e.data?.kind === 'spawn-bot-result' ? e.data.requestId : null)).filter(Boolean));
  const seen = new Set();
  const pending = [];
  for (const { data } of talk) {
    if (data?.kind !== 'spawn-bot' || !data.requestId || !data.strategy) continue;
    if (handled.has(data.requestId) || answered.has(data.requestId) || seen.has(data.requestId)) continue;
    seen.add(data.requestId);
    pending.push({ requestId: data.requestId, game: data.game, strategy: data.strategy });
  }
  return pending;
}

/**
 * Quits in `talk` this bot still has to act on. Addressed either to
 * everyone (no `target`) or to one bot by the name it sits under.
 *
 * Unlike a spawn request, an answer already in the log does NOT excuse
 * this bot: "everyone leave" means everyone, and each bot answers for
 * itself. Only its own `handled` set stops it acting twice.
 * @param {{ data?: unknown }[]} talk
 * @param {Set<string>} handled request ids this bot already answered
 * @param {string} selfName the name this bot is seated under
 * @returns {{ requestId: string, target: string|null }[]}
 */
export function pendingQuits(talk, handled, selfName) {
  const mine = [];
  const seen = new Set();
  for (const { data } of talk) {
    if (data?.kind !== 'quit' || !data.requestId) continue;
    if (data.target && data.target !== selfName) continue;
    if (handled.has(data.requestId) || seen.has(data.requestId)) continue;
    seen.add(data.requestId);
    mine.push({ requestId: data.requestId, target: data.target ?? null });
  }
  return mine;
}

/**
 * Why this request cannot be honoured, in words the requester will see
 * at the table - or `null` when it can. Checked HERE rather than left
 * to the child process, so the person who pressed the button gets the
 * reason instead of a bot that quietly exits 2.
 * @param {{ game: string, strategy: string }} request
 * @param {{ games: string[], strategies: Record<string, { usesJev: boolean }>, env: Record<string, string|undefined> }} context
 * @returns {string|null}
 */
export function spawnRefusal({ game, strategy }, { games, strategies, env }) {
  if (!games.includes(game)) return `I can only play ${games.join(', ')}, not "${game}"`;
  const chosen = strategies[strategy];
  if (!chosen) return `unknown strategy "${strategy}" - I can play: ${Object.keys(strategies).join(', ')}`;
  if (chosen.usesJev && !env.TYPESAFE_API_KEY) return `${strategy} asks Jev for judgments, and TYPESAFE_API_KEY is not set where I am running`;
  return null;
}

/**
 * What a Jev player says when it sits down, so the table can offer
 * "Add Jev bot" at all (the control's presence is evidence that a
 * player is running) and name each strategy with its own description
 * rather than a bare identifier (Smith, Gate 2 condition b).
 * @param {{ game: string, strategies: Record<string, { name: string, description: string }> }} options
 */
export function readyAnnouncement({ game, strategies }) {
  const listed = Object.values(strategies).map(({ name, description }) => ({ name, description }));
  return {
    text: `Jev player here - I can deal in another ${game} bot on request.`,
    data: { kind: 'jev-ready', games: [game], strategies: listed },
  };
}
