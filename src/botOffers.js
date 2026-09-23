/**
 * US-122/D143: what the table knows about Jev players that are running.
 * A Jev player announces itself on table talk (`jev-ready`) when it sits
 * down, so the "Add Jev bot" control exists exactly while one is there
 * to answer - the control's presence is evidence, not configuration.
 * Pure: the talk log and the roster in, what to offer out.
 */

/**
@typedef {{ name: string, description: string }} OfferedStrategy
*/
/**
@typedef {{ from: string, name: string, games: string[], strategies: OfferedStrategy[] }} BotOffer
*/

/**
 * The live offers: the newest `jev-ready` from each sender that is
 * still CONNECTED. A Jev player that left takes its offer with it -
 * nothing can answer a request addressed to it.
 * @param {{ from: string, name: string, data?: unknown }[]} talk
 * @param {{ id: string, connection: string }[]} players
 * @returns {BotOffer[]}
 */
export function botOffers(talk, players) {
  const connected = new Set(players.filter((p) => p.connection === 'connected').map((p) => p.id));
  const bySender = new Map();
  for (const entry of talk) {
    const { data } = entry;
    if (data?.kind !== 'jev-ready' || !connected.has(entry.from)) continue;
    bySender.set(entry.from, {
      from: entry.from,
      name: entry.name,
      games: data.games ?? [],
      strategies: (data.strategies ?? []).filter((s) => s?.name),
    });
  }
  return bySender.values().filter((offer) => offer.strategies.length > 0).toArray();
}

/**
 * The answer to `requestId`, or `null` while it is still in flight -
 * what turns the control's "asking…" state into "done" or the reason
 * it failed (Smith, Gate 1 condition 3).
 * @returns {{ ok: boolean, error?: string }|null}
 */
export function spawnResult(talk, requestId) {
  for (const { data } of talk.toReversed()) {
    if (data?.kind === 'spawn-bot-result' && data.requestId === requestId) {
      return { ok: data.ok === true, ...(data.error && { error: data.error }) };
    }
  }
  return null;
}

/**
 * The talk line that asks for a bot: readable text for the people at
 * the table, structured `data` for the Jev player that answers.
 */
export function spawnRequestLine({ game, strategy, requestId }) {
  return {
    text: `Add a ${strategy} bot to the game, please.`,
    data: { kind: 'spawn-bot', game, strategy, requestId },
  };
}
