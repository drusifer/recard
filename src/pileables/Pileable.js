/**
 * A Pileable is a thing that can be IN a pile (D107, sprint pileObjects,
 * US-101). `Card` is the only subtype in this phase; `Chip` and `Token`
 * follow once the abstraction is known to fit.
 *
 * WHY THIS EXISTS
 * Everything a pile contained was called a "card", including in the
 * signatures a non-card object would have to travel through. The user's
 * brief asked for the honest type: "Chips/Tokens/Cards all extend it."
 * Asked directly what a Chip does that a Card cannot, the answer was
 * "nothing" - so this hierarchy exists to make the VOCABULARY true, not
 * to add behaviour, and no subclass below should be given behaviour a
 * card doesn't have without its own story and gate.
 *
 * SHAPE: the same one `src/piles/` uses, deliberately (D93). Records
 * stay PLAIN in `state.piles` - they are serialized over the wire and
 * into `localStorage` on every state send, and a class instance there
 * would have to survive a JSON round trip it has no reason to make.
 * `pileableFor(record)` (`pileableTypes.js`) constructs a live instance
 * when a question needs asking. This is the fifth registry of that shape
 * in the codebase (`PILE_TYPES` D42, `ZONE_TYPES` D55, `DECK_TYPES` D47,
 * `CARD_FACES` D76, `ACTIONS` D44) and is chosen because the project
 * already reads this way, not because a hierarchy is inherently better.
 *
 * A Pileable is a VIEW over its record, not a copy: it keeps the record's
 * own fields, so anything already reading `card.rank`/`card.faceUp`
 * keeps working through an instance too.
 */
export class Pileable {
  /**
   * Which sort actions a pile offers when it holds this kind of thing
   * (US-104, Smith Gate 1 condition B). Empty by default, and stays
   * empty for anything with no ordered attribute - an action that
   * rearranges a pile unpredictably is worse than no action at all.
   * `CardPileable` overrides it with rank/suit.
   */
  static sortActions = [];

  /**
   * The pile kind this thing BELONGS in, if it has one (*nit: "drops in
   * chipstacks should add the chips to the existing piles").
   *
   * `undefined` for a card, which belongs anywhere - dropping one on a
   * zone's empty space to start a new pile is a real, wanted gesture.
   * `ChipPileable` names `'chip'`, so a chip dropped on empty space
   * joins the tray that is already there instead of spawning yet another
   * pile beside it, which is what was actually happening on every
   * near-miss around a tray.
   *
   * A property of the THING rather than a check at the drop site: the
   * drop code asks what this pileable wants, and never learns what a
   * chip is.
   */
  static homePileKind = undefined;

  /**
   * Whether this thing survives a round `RESET` (*fix, direct user
   * report: "reshuffle and redeal... all the chips disappear").
   *
   * `false` for a card: a reset gathers every card back into a rebuilt,
   * reshuffled deck, which is the whole point of the action. `true` for
   * a chip or a token, because they are not part of the deck - a new
   * round does not confiscate anyone's money.
   *
   * A property of the THING, so `RESET` never asks what a chip is.
   */
  static survivesReset = false;

  constructor(record = {}) {
    Object.assign(this, record);
  }

  /**
   * The extra class this thing contributes to the card shell, if any.
   * The shell itself stays type-blind (Smith's Gate 1 ruling: a diff
   * that makes `cardElement` type-aware fails review) - shape and
   * colour are reached through this class plus CSS, exactly the way
   * `card-red` and `card-rtg` already are.
   */
  className() {
    return '';
  }
}
