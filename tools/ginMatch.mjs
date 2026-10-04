#!/usr/bin/env node
// A full, REAL Gin Rummy game between two named strategies, scored to a
// target (standard: 100) - real table, real local WebRTC, real bot
// processes, real Jev where a strategy uses it.
//
//   bobp make gin-match A=knock-early B=jev-balanced
//   node tools/ginMatch.mjs --strategy-a knock-early --strategy-b jev-balanced
//
// `tools/gin/match.mjs`'s `playMatch()` does the real work - this is
// the thin CLI around it, same split `jevPlayer.mjs`/`jev/runner.mjs`
// already use.
import { parseArgs } from 'node:util';
import { playMatch, Interrupted, DEFAULT_TARGET, DEFAULT_MAX_HANDS } from './gin/match.mjs';

const { values: options } = parseArgs({
  options: {
    'strategy-a': { type: 'string' },
    'strategy-b': { type: 'string' },
    target: { type: 'string', default: String(DEFAULT_TARGET) },
    'max-hands': { type: 'string', default: String(DEFAULT_MAX_HANDS) },
    port: { type: 'string', default: '8240' },
    'peer-port': { type: 'string', default: '9001' },
  },
});

function fail(message) {
  process.stderr.write(`gin-match: ${message}\n`);
  process.exit(2);
}

if (!options['strategy-a'] || !options['strategy-b']) fail('pass both strategies: --strategy-a <name> --strategy-b <name>');
const note = (line) => process.stderr.write(`gin-match: ${line}\n`);

try {
  const result = await playMatch({
    strategyA: options['strategy-a'], strategyB: options['strategy-b'],
    target: Number(options.target), maxHands: Number(options['max-hands']),
    port: Number(options.port), peerPort: Number(options['peer-port']), note,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  // `playMatch` cleaned up already (`Interrupted` is only ever thrown
  // after its own shutdown finished) - 130 is the real exit code, not
  // a generic failure.
  if (error instanceof Interrupted) process.exit(130);
  fail(error.message);
}
