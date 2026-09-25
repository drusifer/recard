// D159: what happens at a table once everyone is seated, and how each bot
// is started - both worked out from the table file (`tableFile.mjs`), as
// plain data, so none of it needs a browser to test.

/**
 * The host's steps, in order: deal, a starting score per seat, then the
 * opening. The opening only makes sense with someone to open against, so
 * a lone seat skips it.
 * @param {{ deal: number|null, score: number|null, opening: { say: string[], each_seat: string[] } }} table
 *   the table file's values, with any command-line override already laid over them
 * @param {{ seated: { id: string, name: string }[], deckId: string }} state
 * @returns {({ act: object } | { say: string })[]}
 */
export function setupSteps(table, { seated, deckId }) {
  const steps = [];
  if (table.deal > 0) steps.push({ act: { type: 'DEAL', pileId: deckId, cardsPerPlayer: table.deal } });
  if (table.score !== null) {
    for (const seat of seated) steps.push({ act: { type: 'SET_SCORE', targetPlayerId: seat.id, value: table.score } });
  }
  if (seated.length > 1) {
    for (const line of table.opening.say) steps.push({ say: line });
    for (const seat of seated) {
      for (const line of table.opening.each_seat) steps.push({ say: line.replaceAll('{name}', () => seat.name) });
    }
  }
  return steps;
}

/**
 * The command-line flags that start one bot with `jevPlayer.mjs`: the
 * game, its player, the table, the deck everyone draws from, the game's
 * own step limit when it has one, then that seat's own flags.
 * @param {{ game: string, strategy: string, code: string, baseUrl: string, deckId: string,
 *   table: { steps: number|null, seat_args: object[] }, seat: number }} input
 * @returns {string[]}
 */
export function botArguments({ game, strategy, code, baseUrl, deckId, table, seat }) {
  const flags = ['--game', game, '--strategy', strategy, '--code', code, '--url', baseUrl, '--deck', deckId];
  if (table.steps !== null) flags.push('--steps', String(table.steps));
  const seatFlags = Object.entries(table.seat_args[seat] ?? {});
  for (const [flag, value] of seatFlags) flags.push(`--${flag}`, String(value));
  return flags;
}
