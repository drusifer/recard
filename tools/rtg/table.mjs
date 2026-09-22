// US-127/D151: the bot hears the table.
//
// Recard has no turn and no priority: nothing tells a player "it is
// your move" or "you may respond". So the bot learns both from table
// talk (D138) - and when the table says nothing but the state moved in
// a way that might involve it, it ASKS out loud rather than guessing or
// freezing. A bot that is stuck must never be silently stuck.

/** What a talk line tells the bot about the turn. Announcements are
 *  ordinary sentences - people talk, they do not emit events - so this
 *  reads intent from what was said, not from a payload. */
export function readAnnouncement(entry, me) {
  const text = (entry.text ?? '').toLowerCase();
  if (entry.name === me) return null; // the bot's own narration is not news
  // "It is now my turn" stays a simple phrase match: it is the opponent
  // announcing their OWN turn starting, which is exactly as explicit as
  // a person can be. The reverse - has THEIR turn ended, so mine can
  // start - is not something a phrase can settle (US-127 follow-up):
  // that is `turnOrder.mjs`'s judgment over the board and this same log.
  if (/\bmy turn\b|\buntap|\bi draw\b/.test(text)) return { is_mine: false, phase: 'their-turn', attackers: [] };
  if (/\battack/.test(text)) return { is_mine: false, phase: 'combat', attackers: attackersIn(entry) };
  if (/\bno attack|\bdone\b|\bnothing\b/.test(text)) return { attackers: [] };
  return null;
}

/** Named attackers if the speaker gave them (a bot will, in `data`), or
 *  a single unnamed attacker so the defender still gets to block. */
function attackersIn(entry) {
  const named = entry.data?.attackers;
  return Array.isArray(named) && named.length > 0 ? named : ['an attacker'];
}

/**
 * Has the table gone quiet in a way that should worry the bot? True
 * when the state changed, nobody said anything since, and the bot
 * cannot tell whether it is involved.
 */
export function shouldAskTable({ lastStateChangeAt, lastTalkAt, turnKnown, now, quietMs = 8000 }) {
  if (turnKnown) return false;
  if (lastStateChangeAt === null) return false;
  if (lastTalkAt !== null && lastTalkAt >= lastStateChangeAt) return false;
  return now - lastStateChangeAt >= quietMs;
}

/** What the bot says when it cannot tell. Plain words, because a person
 *  has to answer it. */
export const WHOSE_TURN = 'Sorry - whose turn is it, and is anything attacking me?';

/** Reads a yes/no out of what the table said back. `null` when the
 *  answer does not settle it, which the caller treats as "no answer"
 *  rather than as a no. */
export function readAnswer(entry) {
  const text = (entry.text ?? '').toLowerCase();
  // Negatives FIRST: "you can't" contains "you can", and a bot that
  // reads a refusal as permission is worse than one that asks again.
  if (/\b(no|nope|nah|can't|cannot|don't|do not|not allowed|illegal|isn't|is not)\b/.test(text)) return false;
  if (/\b(yes|yep|yeah|sure|go ahead|you can|allowed|legal|fine)\b/.test(text)) return true;
  return null;
}

/**
 * Turns a changing SEQUENCE (an id, a seq number - never a timestamp)
 * into a "when did this last actually change" timestamp. Separated out
 * because the naive version - comparing the new value straight against
 * a stored timestamp - compares a small int to a large one and is
 * never equal, so it "changes" every call. Found live (US-127 follow-
 * up): `lastStateChangeAt` was reset every poll tick because it was
 * being compared directly against `view.lastTouch.seq`.
 */
export function trackChange(seen, seq, now) {
  if (seq === undefined || seq === seen.seq) return seen;
  return { seq, changedAt: now };
}
