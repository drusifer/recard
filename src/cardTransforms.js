/**
 * Single-card, in-place reducer transforms (FLIP, ROTATE) - both are the
 * same shape underneath: find the pile the card is CURRENTLY in, ask
 * that pile whether it offers this specific verb right now, throw if
 * not, else mutate. `requireCanRemove` is the shared authorization half
 * (also used by `state.js`'s `transferCard`, which does NOT fit this
 * shape - it moves a card between two piles rather than mutating it in
 * place, so it keeps its own `apply`).
 *
 * `canRemove` is state-DEPENDENT, not a structural/schema property of
 * the card - the same physical card is rotatable on the table and not
 * in a hand, so this can never be pushed earlier to a deserialization-
 * time check. The pile a card is CURRENTLY in has to be consulted at
 * dispatch time, which is exactly what `pile.canRemove` already does
 * (`Pile.js`) - this module only removes the copy-pasted throw/dispatch
 * around that call, it does not change what's authorized.
 */
export function requireCanRemove(pile, card, viewerId, verb) {
  if (!pile.canRemove(card, viewerId, verb)) {
    throw new Error(`Player ${viewerId} is not authorized to ${verb} ${card.id}`);
  }
}

/**
 * `verb` may be a fixed string (ROTATE always checks 'rotate') or a
 * function of the card (FLIP checks 'reveal' or 'conceal' depending on
 * the card's CURRENT `faceUp`) - resolved before authorization, so the
 * check and the mutation always agree on which verb just happened.
 */
export function cardTransform({ verb, mutate }) {
  return (pile, card, viewerId) => {
    const resolvedVerb = typeof verb === 'function' ? verb(card) : verb;
    requireCanRemove(pile, card, viewerId, resolvedVerb);
    return mutate(card);
  };
}

export const rotateCard = cardTransform({
  verb: 'rotate',
  mutate: (card) => ({ ...card, orientation: card.orientation === 'landscape' ? 'portrait' : 'landscape' }),
});

/**
 * A card with no `faceUp` field at all (a deck's cards never pass
 * through anything that sets one) counts as face-down, so the first
 * flip reveals it - `!== true`'s complement, matching `Pile.showsFace`'s
 * own reading of the same absent field.
 */
export const flipCard = cardTransform({
  verb: (card) => (card.faceUp === true ? 'conceal' : 'reveal'),
  mutate: (card) => ({ ...card, faceUp: card.faceUp !== true }),
});
