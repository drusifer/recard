// US-127/D151, promoted by US-128/D153: a Jev player hears the table.
//
// Recard has no turn and no priority: nothing tells a player "it is
// your move" or "you may respond". So a bot learns both from table
// talk (D138) - and when the table says nothing but the state moved in
// a way that might involve it, it ASKS out loud rather than guessing or
// freezing. A bot that is stuck must never be silently stuck. Nothing
// here knows a game: each game's own words stay with that game.

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Puts ONE yes/no question to the table and listens for the answer
 * itself - reading only what anyone else said AFTER the question. It
 * must listen on its own: a bot asks from the middle of a decision, so
 * nothing else is reading the talk log while it waits (US-128: the RtG
 * player's ask could never hear a reply for exactly that reason).
 * @param {{ peer: { talk: () => Promise<object[]>, say: (text: string) => Promise<void> },
 *   name: string, question: string, timeoutMs?: number, pollMs?: number }} options
 * @returns {Promise<boolean|null>} the answer, or `null` when nobody settled it
 */
export async function askPeer({ peer, name, question, timeoutMs = 20_000, pollMs = 500 }) {
  const earlier = await peer.talk();
  const before = earlier.length;
  await peer.say(question);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const talk = await peer.talk();
    const since = talk.slice(before).filter((entry) => entry.name !== name);
    const answer = since.map((entry) => readAnswer(entry)).find((each) => each !== null);
    if (answer !== undefined) return answer;
    if (Date.now() >= deadline) return null;
    await sleep(pollMs);
  }
}
