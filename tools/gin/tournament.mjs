// A round-robin tournament over a roster of named Gin strategies - every
// real pairing plays `gamesPerPairing` real games (`tools/gin/match.mjs`'s
// `playMatch`, unchanged), sequentially (one table/browser/port-pair at a
// time, matching this project's own "serial runs only" convention - a
// parallel run would also just contend for the same local signaling
// port). Pure library, like `match.mjs` itself; the CLI is
// `tools/ginTournament.mjs`.
//
// `playMatch` is injected (defaults to the real one) so the pairing/
// standings/leaderboard LOGIC - the actual thing worth unit-testing -
// is provable without a browser, the same "inject the expensive part"
// shape `tools/jev/runner.mjs`'s `serveSpawnRequests` already uses
// (`startBot`).
import { playMatch as realPlayMatch } from './match.mjs';

const PORT_BASE = 8250;
const PEER_PORT_BASE = 9520;

/**
 * Every unique pairing in `roster`, order-independent (A vs B once,
 * never also B vs A) - `roster.length` strategies, `roster.length *
 * (roster.length - 1) / 2` pairings, the standard round-robin count.
 */
function pairingsOf(roster) {
  const pairings = [];
  for (let index = 0; index < roster.length; index++) {
    for (let index_ = index + 1; index_ < roster.length; index_++) pairings.push([roster[index], roster[index_]]);
  }
  return pairings;
}

function freshStanding() {
  return { wins: 0, losses: 0, games: 0 };
}

/**
 * @param {{ roster: string[], gamesPerPairing?: number, target?: number,
 *   maxHands?: number, note?: (line: string) => void, playMatch?: Function,
 *   specOf?: (name: string) => string|{name:string,base:string,params?:object} }} options
 *   `roster` is always plain NAMES - standings/pairings/winner-matching
 *   all key off them. `specOf` (default: identity) is the one hook
 *   `tools/gin/evolve.mjs` uses to resolve a generation's own evolved
 *   VARIANT spec for a name right before `playMatch` is actually
 *   called - `playMatch` itself always normalizes back to a plain name
 *   in its result, so nothing downstream here has to know variants
 *   exist at all.
 * @returns {Promise<{ standings: { strategy: string, wins: number, losses: number,
 *   games: number, winRate: number }[], results: object[] }>}
 */
export async function runTournament({ roster, gamesPerPairing = 1, target, maxHands, note = () => {}, playMatch = realPlayMatch, specOf = (name) => name }) {
  if (roster.length < 2) throw new Error('a tournament needs at least 2 strategies in its roster');
  if (new Set(roster).size !== roster.length) throw new Error(`roster has a duplicate strategy: ${roster.join(', ')}`);

  const standings = new Map(roster.map((strategy) => [strategy, freshStanding()]));
  const results = [];
  const pairings = pairingsOf(roster);
  let portOffset = 0;

  for (const [pairingIndex, [strategyA, strategyB]] of pairings.entries()) {
    for (let game = 1; game <= gamesPerPairing; game++) {
      note(`pairing ${pairingIndex + 1}/${pairings.length}: ${strategyA} vs ${strategyB} (game ${game}/${gamesPerPairing})`);
      const result = await playMatch({
        strategyA: specOf(strategyA), strategyB: specOf(strategyB), target, maxHands,
        port: PORT_BASE + portOffset, peerPort: PEER_PORT_BASE + portOffset, note,
      });
      portOffset += 1;
      results.push(result);

      const loser = result.winner === strategyA ? strategyB : strategyA;
      standings.get(result.winner).wins += 1;
      standings.get(result.winner).games += 1;
      standings.get(loser).losses += 1;
      standings.get(loser).games += 1;
    }
  }

  const leaderboard = [...standings]
    .map(([strategy, record]) => ({ strategy, ...record, winRate: record.games === 0 ? 0 : record.wins / record.games }))
    .toSorted((a, b) => b.winRate - a.winRate || b.wins - a.wins);

  return { standings: leaderboard, results };
}
