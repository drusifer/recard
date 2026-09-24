/**
 * US-120/D138: table talk - lines players say to each other that the
 * game protocol does not encode (a bot's knock announcement, "your
 * turn"). Not game state: never reduced, persisted or redacted. The host
 * stamps each line with the sender's identity and a sequence number and
 * relays it to everyone, so every peer's log has the same order.
 */

import { rollTalk } from './dice.js';

export const MAX_TALK_TEXT = 500;

/**
 * @param {string} text
 * @param {unknown} [data] optional JSON for machines (a bot's knock details)
 * @returns {{ type: 'talk', text: string, data?: unknown }}
 */
export function makeTalkMessage(text, data) {
  const trimmed = String(text ?? '').trim().slice(0, MAX_TALK_TEXT);
  if (!trimmed) throw new Error('Table talk: refusing an empty line');
  return data === undefined ? { type: 'talk', text: trimmed } : { type: 'talk', text: trimmed, data };
}

/**
 * @typedef {{ seq: number, at: number, from: string, name: string, text: string, data?: unknown }} TalkEntry
 */

/**
 * A bounded log. The host adds unstamped entries (it assigns `seq`/`at`);
 * a guest adds the host's stamped entries as they arrive.
 * @param {{ limit?: number, now?: () => number }} [options]
 */
export function createTalkLog({ limit = 100, now = Date.now } = {}) {
  let entries = [];
  let seq = 0;
  return {
    /**
     * @param {Omit<TalkEntry, 'seq'|'at'> & Partial<Pick<TalkEntry, 'seq'|'at'>>} entry
     * @returns {TalkEntry}
     */
    add(entry) {
      const stamped = { ...entry, seq: entry.seq ?? ++seq, at: entry.at ?? now() };
      entries = [...entries, stamped].slice(-limit);
      return stamped;
    },
    entries: () => [...entries],
  };
}

/**
 * What the host actually posts for a line it is stamping. A "/roll"
 * line becomes the host's own roll (src/dice.js), and dice data a sender
 * tries to send is dropped - a roll is produced by the table, never
 * claimed by a player.
 * @param {{ type: 'talk', text: string, data?: unknown }} line
 * @param {() => number} [random]
 */
export function hostLine(line, random = Math.random) {
  const rolled = rollTalk(line.text, random, MAX_TALK_TEXT);
  if (rolled) return { type: 'talk', text: rolled.text, data: rolled.data };
  if (line.data?.kind === 'dice' || line.data?.kind === 'dice-error') {
    const { data: _claimed, ...honest } = line;
    return honest;
  }
  return line;
}
