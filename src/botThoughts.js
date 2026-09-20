/**
 * US-121/D142: a bot's thinking, as the table already has it. Every
 * decision is a talk line with a `bot-decision` payload (D142), so the
 * bubble's history is the talk log filtered by speaker - not a second
 * store, and bounded by the log's own cap.
 */

/**
 * Every bot's decisions, newest LAST, keyed by the speaker's identity.
 * @param {{ from: string, name: string, data?: unknown }[]} talk
 * @returns {Map<string, { name: string, decisions: object[] }>}
 */
export function decisionsBySpeaker(talk) {
  const bySpeaker = new Map();
  for (const entry of talk) {
    if (entry.data?.kind !== 'bot-decision') continue;
    const found = bySpeaker.get(entry.from) ?? { name: entry.name, decisions: [] };
    found.name = entry.name;
    found.decisions.push({ seq: entry.seq, text: entry.text, ...entry.data });
    bySpeaker.set(entry.from, found);
  }
  return bySpeaker;
}

/**
 * What the collapsed bubble says: the latest move, in the few words the
 * bot itself used. `null` when this speaker has decided nothing yet -
 * a bot with no decisions shows no bubble at all (US-121 AC6).
 */
export function latestThought(decisions) {
  return decisions?.length ? decisions.at(-1).text : null;
}
