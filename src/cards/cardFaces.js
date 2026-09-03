/**
 * The card-face registry (D76, US-80) — `card.face` dispatches here
 * instead of `cardElement` branching on card shape.
 *
 * Same registry-dispatch pattern as `PILE_TYPES` (D42), `ZONE_TYPES`
 * (D55/D56), `DECK_TYPES` (D47) and `ACTIONS` (D44): a new card face is
 * one new module and one new entry.
 *
 * WHY THIS EXISTS AT ALL
 * `cardElement` hardcoded rank/suit/JOKER. A Recard the Gathering card
 * needs a name, mana cost, art, type line, rules text and power /
 * toughness — nothing rank/suit can express. Branching on card shape
 * inside `cardElement` is precisely what would have rotted the table
 * simulation, which the user's brief said must not change. A registry
 * keeps `cardElement` a thin dispatcher and keeps every existing
 * preset's rendering literally the same code path it always used.
 *
 * A face renders CONTENT ONLY. The card shell (`<button class="card">`,
 * its `dataset.pileableId`, and every drag/click/rotate behaviour bound to
 * it) stays in `ui.js` and is identical for all faces — that's what
 * makes a new face incapable of breaking table interaction.
 */
import { StandardCardFace } from './StandardCardFace.js';
import { RtgCardFace } from './RtgCardFace.js';

export const CARD_FACES = {
  standard: StandardCardFace,
  rtg: RtgCardFace,
};

export { typeLine } from './RtgCardFace.js';

/**
 * Which face renders this card.
 *
 * Defaults to `standard` when `face` is absent — every card in every
 * preset that predates this registry has no `face` field, so the
 * default is what guarantees they render exactly as before. An
 * UNKNOWN face also falls back rather than throwing: a card from some
 * future deck type should degrade to something renderable instead of
 * blanking the table.
 *
 * @param {{face?: string}} card
 */
export function faceFor(card) {
  return CARD_FACES[card?.face] ?? CARD_FACES.standard;
}
