// D159: how to stand up a table for a game - data, like the rest of a game.
//
//   games/<game>/table.yaml
//     preset       the table preset the host picks             (required)
//     players      default seats: names from the game's players
//     deal         cards each seat is dealt; leave out to deal nothing
//     score        starting score each seat is set to (life, in RtG)
//     steps        decisions each bot's run may take (passed on as --steps)
//     opening      what the host says once two or more are seated
//       say        lines said once
//       each_seat  lines said per seat; {name} is that seat's name
//     seat_args    per seat, in seating order: extra flags for that bot
//
// Every mistake is refused here naming the file and the path in it, with
// the nearest good name when there is one (D154).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { unknown } from './machine.mjs';

const KEYS = ['preset', 'players', 'deal', 'score', 'steps', 'opening', 'seat_args'];
const OPENING_KEYS = ['say', 'each_seat'];

/**
 * @param {string} text YAML
 * @param {{ file: string, players: string[] }} options `players`: the names this game has
 */
export function parseTable(text, { file, players }) {
  const fail = (where, message) => { throw new Error(`${file}: ${where}: ${message}`); };
  const config = YAML.parse(text);
  if (config === null || typeof config !== 'object' || Array.isArray(config)) fail('(top)', 'a table file is a map');
  for (const key of Object.keys(config)) {
    if (!KEYS.includes(key)) fail(key, unknown('key', key, KEYS));
  }
  if (typeof config.preset !== 'string' || config.preset === '') fail('preset', 'a table file needs `preset`: the table preset to host');

  const whole = (where, value, min) => {
    if (value === undefined) return null;
    const bound = min > -Infinity ? ` >= ${min}` : '';
    if (!Number.isSafeInteger(value) || value < min) fail(where, `must be a whole number${bound}, not ${JSON.stringify(value)}`);
    return value;
  };

  const named = config.players ?? [];
  if (!Array.isArray(named)) fail('players', 'must be a list of player names');
  for (const [index, name] of named.entries()) {
    if (!players.includes(name)) fail(`players[${index}]`, unknown('player', name, players));
  }

  return {
    preset: config.preset,
    players: named,
    deal: whole('deal', config.deal, 0),
    score: whole('score', config.score, -Infinity),
    steps: whole('steps', config.steps, 1),
    opening: openingOf(config.opening, fail),
    seat_args: seatArgumentsOf(config.seat_args, fail),
  };
}

function openingOf(opening, fail) {
  if (opening === undefined) return { say: [], each_seat: [] };
  if (opening === null || typeof opening !== 'object' || Array.isArray(opening)) fail('opening', 'must be a map with `say` and/or `each_seat`');
  for (const key of Object.keys(opening)) {
    if (!OPENING_KEYS.includes(key)) fail(`opening.${key}`, unknown('key', key, OPENING_KEYS));
  }
  const lines = (key) => {
    const list = opening[key] ?? [];
    if (!Array.isArray(list)) fail(`opening.${key}`, 'must be a list of text');
    for (const [index, line] of list.entries()) {
      if (typeof line !== 'string') fail(`opening.${key}[${index}]`, 'must be text');
    }
    return list;
  };
  return { say: lines('say'), each_seat: lines('each_seat') };
}

function seatArgumentsOf(seatArguments, fail) {
  if (seatArguments === undefined) return [];
  if (!Array.isArray(seatArguments)) fail('seat_args', 'must be a list, one map of flags per seat');
  for (const [index, flags] of seatArguments.entries()) {
    if (flags === null || typeof flags !== 'object' || Array.isArray(flags)) fail(`seat_args[${index}]`, 'must be a map of flag: value');
    for (const [flag, value] of Object.entries(flags)) {
      if (typeof value !== 'string' && typeof value !== 'number') fail(`seat_args[${index}].${flag}`, 'must be text or a number');
    }
  }
  return seatArguments;
}

/**
 * Loads a table file from disk. Errors name it as the author knows it
 * (`games/<game>/table.yaml`, relative to where the tool was started),
 * like every other game-file error (D154), whatever path it was found by.
 * @param {string} file
 * @param {{ players: string[] }} options
 */
export function loadTable(file, { players }) {
  const shown = path.relative(process.cwd(), file);
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new Error(`${shown}: no such file - a game needs a table file to host a table (see tools/jev/tableFile.mjs for what goes in it)`);
  }
  return parseTable(text, { file: shown, players });
}
