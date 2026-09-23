// US-125/D147, promoted by US-128/D153: the one rule every game's Jev
// files live by. A question file is static - it refers to state by
// path, never by value - because an instruction that names a card or
// carries a number has put a VALUE in the question, where it can drift
// from the state that holds the same value by path. Each game's own
// loader (Gin's strategies, RtG's game file) decides WHICH prose to
// check; this decides what is allowed in it.

const RANKS = '(?:ace|jack|queen|king|[2-9]|10)';
const CARD_NAMED = new RegExp(String.raw`\b${RANKS} of (?:clubs|diamonds|hearts|spades)\b`, 'i');
const NUMBER = /(?<![\w.[])\d+(?![\w\]])/;

/**
 * Why this instruction may not ship, or `null` when it is fine. Text
 * inside backticks is a state path, so it is exempt - `candidates[0]`
 * is a reference, not a value.
 * @param {string} instructions
 */
export function checkInstruction(instructions) {
  const prose = instructions.replaceAll(/`[^`]*`/g, ' ');
  if (CARD_NAMED.test(prose)) return 'names a card in the question; put the card in state and refer to it by path';
  if (NUMBER.test(prose)) return 'carries a number in the question; put the number in state and refer to it by path';
  return null;
}

/**
 * Throws on the first piece of prose that carries a literal, naming
 * where it is so the author can find it.
 * @param {Iterable<[string, string]>} prose `[where, text]` pairs
 */
export function rejectLiterals(prose) {
  for (const [where, text] of prose) {
    const complaint = checkInstruction(text);
    if (complaint) throw new Error(`${where} ${complaint}`);
  }
}

/**
 * The value at `path` in `state`, or `undefined`. Supports the two
 * forms the question files use: `me.deadwood` and `candidates[0].card`.
 */
export function resolvePath(state, path) {
  let value = state;
  for (const part of path.split('.')) {
    if (value === undefined || value === null) return;
    const indexed = part.match(/^([^[]+)\[(\d+)\]$/);
    value = indexed ? value[indexed[1]]?.[Number(indexed[2])] : value[part];
  }
  return value;
}
