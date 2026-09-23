// US-127/D151: what RtG's table talk says about the turn - RtG's own
// words ("attack", "untap"). Hearing the table in general (a yes/no, a
// quiet table, a changed state) is game-agnostic and lives in
// `tools/jev/table.mjs` (US-128).

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
  // that is the `their_turn_is_over` judgment in games/rtg/turn.yaml.
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
