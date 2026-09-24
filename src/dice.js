/**
 * Dice, rolled in table talk: "/roll [N]d[S] [xR]". N dice of S sides,
 * rolled R times - each part optional, defaulting to one six-sided die
 * rolled once ("/roll", "/roll 2d6", "/roll d20", "/roll 2d6 x3").
 *
 * The HOST rolls, when it stamps a talk line (D138), so a result is
 * produced by the table and never claimed by whoever asked. Anyone who
 * can talk can roll - a person, the MCP harness, a Jev bot.
 */

export const DICE_LIMITS = {
  dice: { min: 1, max: 20 },
  sides: { min: 2, max: 1000 },
  rolls: { min: 1, max: 10 },
};

const DEFAULTS = { dice: 1, sides: 6, rolls: 1 };
const USAGE = 'use /roll [dice]d[sides] [x rolls], e.g. /roll 2d6 x3';
const DICE_AND_SIDES = /^(\d*)d(\d+)$/;
const COUNT = /^\d+$/;
const TIMES = /^x(\d+)$/;

/**
 * What a "/roll ..." line asks for, `{ error }` when it asks for
 * something out of range or unreadable, or `null` when the line is not a
 * roll at all.
 * @param {string} text
 * @returns {{ dice: number, sides: number, rolls: number }|{ error: string }|null}
 */
export function parseRoll(text) {
  const [command, ...parts] = String(text ?? '').trim().toLowerCase().split(/\s+/);
  if (command !== '/roll') return null;
  const asked = { ...DEFAULTS };
  for (const part of parts) {
    const both = part.match(DICE_AND_SIDES);
    const times = part.match(TIMES);
    if (both) Object.assign(asked, { dice: both[1] === '' ? DEFAULTS.dice : Number(both[1]), sides: Number(both[2]) });
    else if (COUNT.test(part)) asked.dice = Number(part);
    else if (times) asked.rolls = Number(times[1]);
    else return { error: USAGE };
  }
  for (const [part, { min, max }] of Object.entries(DICE_LIMITS)) {
    if (asked[part] < min || asked[part] > max) return { error: `${part} must be ${min} to ${max} - ${USAGE}` };
  }
  return asked;
}

/**
 * One value per die per roll, from `random` (a [0, 1) source).
 * @returns {number[][]}
 */
export function rollDice({ dice, sides, rolls }, random = Math.random) {
  return Array.from({ length: rolls }, () => Array.from({ length: dice }, () => 1 + Math.floor(random() * sides)));
}

/**
 * The talk line the host posts for `text`, or `null` when `text` is not
 * a roll. A roll is shown in words for people and carried as numbers in
 * `data` for machines.
 * @param {string} text
 * @param {() => number} [random]
 * @param {number} [maxLength] longer text shows totals only
 * @returns {{ text: string, data: object }|null}
 */
export function rollTalk(text, random = Math.random, maxLength = Infinity) {
  const asked = parseRoll(text);
  if (asked === null) return null;
  if (asked.error) return { text: `${text.trim()} - not rolled: ${asked.error}`, data: { kind: 'dice-error' } };
  const results = rollDice(asked, random);
  const totals = results.map((values) => values.reduce((sum, value) => sum + value, 0));
  const shown = results.map((values, index) => (values.length === 1 ? String(values[0]) : `${values.join(' + ')} = ${totals[index]}`));
  const times = asked.rolls === 1 ? '' : ` x${asked.rolls}`;
  const full = `rolled ${asked.dice}d${asked.sides}${times}: ${shown.join(' | ')}`;
  // Too long to read in full: the totals, with every die still in `data`.
  const shownText = full.length <= maxLength ? full : `rolled ${asked.dice}d${asked.sides}${times} (totals): ${totals.join(' | ')}`;
  return {
    text: shownText,
    data: { kind: 'dice', ...asked, results, totals },
  };
}
