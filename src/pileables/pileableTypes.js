/**
 * The Pileable registry (D107) - `record.pileableType` dispatches here.
 * Same
 * shape as `PILE_TYPES`/`ZONE_TYPES`/`DECK_TYPES`/`CARD_FACES`: a new
 * kind of thing in a pile is one new module and one new entry.
 */
import { CardPileable } from './CardPileable.js';
import { ChipPileable } from './ChipPileable.js';
import { TokenPileable } from './TokenPileable.js';

export const PILEABLE_TYPES = { card: CardPileable, chip: ChipPileable, token: TokenPileable };

export { Pileable } from './Pileable.js';

/**
 * A live instance for a plain record.
 *
 * NOT called `type`. An RtG card already HAS a `type` field - its MTG
 * type line, "Creature"/"Land" - so a `type` discriminator would have
 * silently overwritten it on all 132 of them, which is exactly the
 * breakage Smith's Gate 2 required be structurally impossible. Found by
 * Phase 97's own test run, which is what that phase exists for.
 *
 * An absent or unknown `pileableType` resolves to `card`, the same defensive
 * default `faceFor` makes for an absent `face`. That is not a
 * compatibility shim - no old code path is kept alive beside a new one,
 * there is one path with a default - and it means a record built
 * anywhere, or arriving from a future version, degrades to something
 * renderable instead of blanking the table.
 */
export function pileableFor(record) {
  const PileableClass = PILEABLE_TYPES[record?.pileableType] ?? PILEABLE_TYPES.card;
  return new PileableClass(record ?? {});
}

/**
 * Which of these pileables survive a round `RESET` - everything that is
 * not a card (*fix: "reshuffle and redeal... all the chips disappear").
 */
export function survivorsOfReset(cards = []) {
  return cards.filter((card) => (PILEABLE_TYPES[card?.pileableType] ?? PILEABLE_TYPES.card).survivesReset);
}

/**
 * The pile kind this pileable belongs in, or `undefined` if it belongs
 * anywhere (*nit: "drops in chipstacks should add the chips to the
 * existing piles"). See `Pileable.homePileKind`.
 */
export function homePileKindFor(record) {
  return (PILEABLE_TYPES[record?.pileableType] ?? PILEABLE_TYPES.card).homePileKind;
}

/**
 * The sort actions a pile offers for the things it holds (US-104).
 * The INTERSECTION across a mixed pile: an action offered there must be
 * meaningful for everything in it, or it would reorder something by an
 * attribute it hasn't got. An empty pile offers none.
 *
 * Reads `sortActions` off a real INSTANCE (`pileableFor`), not the
 * class's static field directly - US-113 gave `CardPileable` an
 * instance-level override (an RtG-faced card sorts by colour/type, a
 * standard one by rank/suit), and only an instance can tell those two
 * apart. `ChipPileable`/`TokenPileable` have no such variance, so
 * `instance.sortActions` for them is simply the static default
 * (`static sortActions` lives on the CLASS, unreachable via an instance
 * unless something defines an instance-level property - `pileableFor`'s
 * constructed instance never does for those two, so this would read
 * `undefined` without the fallback below).
 */
export function sortActionsFor(records = []) {
  if (records.length === 0) return [];
  const lists = records.map((record) => {
    const PileableClass = PILEABLE_TYPES[record?.pileableType] ?? PILEABLE_TYPES.card;
    return pileableFor(record).sortActions ?? PileableClass.sortActions;
  });
  return lists[0].filter((action) => lists.every((list) => list.includes(action)));
}
