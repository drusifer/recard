/**
 * US-150/D175: inviting a listening Jev game master to a table by name,
 * from table talk ("/invite patch"). A table code is the host's PeerJS
 * id; a game master gets one the same way, derived from its name - so
 * the host can dial it with no lobby and no registry.
 *
 * Pure, and shared: the browser app (the host dials and reports) and the
 * Node CLI (`tools/jevGameMaster.mjs` listens) both import this, so the
 * address and the wire messages can't drift between the two sides.
 */

/**
 * A spoken name maps to exactly one address, whatever its capitalisation (C3).
 */
const NAME = /^[a-z0-9-]{1,32}$/;
const ADDRESS_PREFIX = 'recard-gm-';
const COMMAND = '/invite';
const USAGE = 'use /invite <game master name>, e.g. /invite patch';

/**
 * No answer to an invite within this long is reported as `no-answer` (C2).
 */
export const INVITE_ANSWER_MS = 15_000;
/**
 * An accepted game master that has not said `jev-ready` within this long
 * is reported as `never-arrived` - its join's 3 tries of 20s (harness `joinTable`), plus a
 * headless browser starting on a small box like a Pi.
 */
export const INVITE_ARRIVAL_MS = 90_000;

/**
 * Host -> game master, over a DataConnection to its address.
 */
export const INVITE_MESSAGE = 'gm-invite';
/**
 * Game master -> host, before it goes to join.
 */
export const ACCEPTED_MESSAGE = 'gm-invite-accepted';
/**
 * The `data.kind` of every host-posted invite status line in talk.
 */
export const STATUS_KIND = 'gm-invite-status';

/**
 * The canonical (lowercased) name, or `null` when it can't be one.
 * @param {unknown} name
 * @returns {string|null}
 */
export function gameMasterName(name) {
  if (typeof name !== 'string') return null;
  const lowered = name.toLowerCase();
  return NAME.test(lowered) ? lowered : null;
}

/**
 * @param {string} name
 * @returns {string} the PeerJS id a game master of that name listens on
 */
export function gameMasterAddress(name) {
  const canonical = gameMasterName(name);
  if (!canonical) throw new Error(`not a game master name: ${JSON.stringify(name)}`);
  return ADDRESS_PREFIX + canonical;
}

/**
 * What a talk line asks for: `{ name }` to invite, `{ usage }` when it is
 * an "/invite" that names nobody usable, or `null` when it is not an
 * invite at all.
 * @param {string} text
 * @returns {{ name: string }|{ usage: string }|null}
 */
export function parseInvite(text) {
  const line = text.trim();
  if (!line.startsWith(COMMAND)) return null;
  const rest = line.slice(COMMAND.length);
  if (rest !== '' && !/^\s/.test(rest)) return null; // "/invitepatch" is not an invite
  const name = gameMasterName(rest.trim());
  return name ? { name } : { usage: USAGE };
}

const STATUS_TEXT = {
  inviting: (name) => `inviting ${name}...`,
  accepted: (name) => `${name} is on its way`,
  'no-answer': (name) => `no game master named ${name} answered - is it running with --name ${name}?`,
  'never-arrived': (name) => `${name} accepted but never joined - is it running the same Recard version as this table?`,
};

/**
 * The line everyone at the table reads for an invite status (Gate 2:
 * a failure names its likely cause and the next step).
 * @param {'inviting'|'accepted'|'no-answer'|'never-arrived'} status
 * @param {string} name
 */
export function inviteStatusText(status, name) {
  const text = STATUS_TEXT[status];
  if (!text) throw new Error(`unknown invite status: ${status}`);
  return text(name);
}

/**
 * Whether a game master of this name has said `jev-ready` since `afterSeq`
 * - its arrival. An earlier one is a previous visit, not this invite.
 * @param {{ seq: number, name?: string, data?: { kind?: string } }[]} talk
 * @param {string} name canonical name
 * @param {number} afterSeq
 */
export function hasArrived(talk, name, afterSeq) {
  return talk.some((entry) => entry.seq > afterSeq && entry.data?.kind === 'jev-ready' && gameMasterName(entry.name) === name);
}

/**
 * One invite, start to finish (D175), with everything that touches the
 * network or the clock passed in - the host wires the real ones. Posts
 * `inviting` at once (C1), then `no-answer` or `accepted`; once accepted,
 * `never-arrived` if `arrived()` is still false at the arrival bound.
 * @param {{
 *   post: (status: string) => void,
 *   dial: (answerMs: number) => Promise<'accepted'|'no-answer'>,
 *   arrived: () => boolean,
 *   timings: { answerMs: number, arrivalMs: number },
 *   clock: { setTimeout: (fn: () => void, ms: number) => unknown },
 * }} parameters
 */
export async function runInvite({ post, dial, arrived, timings, clock }) {
  post('inviting');
  const answer = await dial(timings.answerMs);
  post(answer);
  if (answer !== 'accepted') return;
  clock.setTimeout(() => {
    if (!arrived()) post('never-arrived');
  }, timings.arrivalMs);
}
