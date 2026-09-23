// US-128/D153: what a Jev player does when a judgment does not convince
// it. ONE shape for every such judgment - a move's constraint (RtG), a
// Choice below its file's floor (Gin), whose turn it is (RtG, D152) -
// so a game picks a policy rather than writing a third path. The D152
// stall was exactly that: turn detection had its own weaker path that
// never asked again.

/**
 * How far from certain a Noul may be and still decide anything.
 */
export const UNSURE = 0.35;

/**
 * A Noul read as a verdict: `yes` at or above `1 - unsure`, `no` at or
 * below `unsure`, and `unsure` in between - the band a policy resolves.
 * @param {number} noul
 * @returns {'yes'|'no'|'unsure'}
 */
export function verdictOf(noul, unsure = UNSURE) {
  if (noul >= 1 - unsure) return 'yes';
  if (noul <= unsure) return 'no';
  return 'unsure';
}

/**
 * @typedef {{ accepted: boolean, answered: boolean|null, why: string|null }} Resolution
 * @typedef {{ resolve: (question: string) => Promise<Resolution> }} EscalationPolicy
 */

/**
 * Put ONE yes/no question to the table and abide by the answer (D151).
 * Only a clear yes is accepted: silence is not consent.
 * @param {(question: string) => Promise<boolean|null>} [ask]
 *   resolves what the table said, `null` when nobody answered
 * @returns {EscalationPolicy}
 */
export function askTable(ask) {
  return {
    async resolve(question) {
      const told = ask ? await ask(question) : null;
      if (told === true) return { accepted: true, answered: true, why: null };
      return { accepted: false, answered: told, why: told === null ? 'nobody answered' : 'the table said no' };
    },
  };
}

/**
 * Never accept an unconvinced judgment and ask nobody: the caller plays
 * its stated fallback (Gin, D150 - "the FILE says how sure is sure
 * enough").
 * @returns {EscalationPolicy}
 */
export function floorFallback() {
  return {
    async resolve() {
      return { accepted: false, answered: null, why: 'below the confidence floor' };
    },
  };
}
