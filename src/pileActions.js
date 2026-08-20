/**
 * What a card in a given Pile can *do*, and where it can go (D23/D25).
 *
 * Pure and DOM-free, like `seating.js` (D18), `handOrder.js` (D14) and
 * `dropTarget.js` (US-32/33): the rules are the interesting part, and
 * they're only directly testable if they aren't tangled up in rendering.
 *
 * Before this, "which controls does this card get" was re-derived inline
 * at each render site with its own ad-hoc conditions, and "where may it
 * go" lived separately in the Move-to dropdown. One table means the
 * hover affordances, the drop-target highlighting and the reducer's own
 * authorization can't drift apart - they all read the same source.
 *
 * NOTE: this decides what to *offer*. It deliberately does not replace
 * the reducer's authorization checks (state.js) - the host still
 * validates every action it receives, exactly as before. This is the
 * presentation half; the reducer remains the source of truth.
 */

/**
 * Every action a card can carry, and what kind of destination it needs.
 * `target: null` means it happens in place, with no destination to pick.
 */
export const ACTIONS = {
  play: { label: 'Play', target: 'zone', from: 'hand' },
  draw: { label: 'Draw', target: 'hand', from: 'deck' },
  pickup: { label: 'Pick up', target: 'hand', from: 'zone' },
  move: { label: 'Move', target: 'zone', from: 'zone' },
  reveal: { label: 'Turn over', target: null, from: 'zone' },
};

/**
 * The actions a card in `pile` could offer, before per-card visibility
 * and ownership are taken into account.
 * @param {{kind: 'deck'|'hand'|'zone'}} pile
 */
export function actionsForPileKind(kind) {
  switch (kind) {
    case 'deck':
      return ['draw'];
    case 'hand':
      return ['play'];
    case 'zone':
      return ['reveal', 'pickup', 'move'];
    default:
      return [];
  }
}

/**
 * The actions actually offered for one card, applying the same
 * visibility/ownership rules the reducer enforces (D7/D12):
 * - a face-down card can be turned over by anyone if it's unowned, or by
 *   its owner; never by a non-owner.
 * - only a face-up card can be picked up.
 * - a still-hidden card can only be moved by its owner.
 *
 * @param {{kind: string}} pile the pile the card is currently in
 * @param {{faceUp?: boolean, faceDown?: boolean, owner?: string|null}} card
 *   a card as it appears in a *view* (so it may be redacted).
 * @param {string} viewerId
 * @returns {string[]} action ids, in the order they should be offered.
 */
export function actionsForCard(pile, card, viewerId) {
  const possible = actionsForPileKind(pile.kind);
  if (pile.kind !== 'zone') {
    // A hand pile only offers its own owner anything.
    if (pile.kind === 'hand' && pile.ownerId !== viewerId) return [];
    return possible;
  }

  // In a view, a card the viewer may not see arrives redacted as
  // `{faceDown: true}` with no `faceUp` field - treat both spellings.
  const hidden = card.faceDown === true || card.faceUp === false;
  const owned = card.owner != null;
  const mine = card.owner === viewerId;

  return possible.filter((action) => {
    if (action === 'reveal') return hidden && (!owned || mine);
    if (action === 'pickup') return !hidden;
    // Move mirrors MOVE_CARD's own rule exactly: a still-hidden card is
    // movable only by its owner; anything visible, or face-down but
    // unowned ("put or take is open to all", US-19), is movable by all.
    if (action === 'move') return !hidden || !owned || mine;
    return false;
  });
}

/**
 * Which of `piles` can receive `action` - i.e. what should light up as a
 * drop target once the user picks that action.
 *
 * @param {string} action
 * @param {{id: string, kind: string, ownerId: string|null}[]} piles
 * @param {{viewerId: string, fromPileId?: string}} ctx
 * @returns {string[]} pile ids
 */
export function targetsForAction(action, piles, { viewerId, fromPileId } = {}) {
  const spec = ACTIONS[action];
  if (!spec || spec.target === null) return [];

  return piles
    .filter((pile) => {
      if (spec.target === 'hand') return pile.kind === 'hand' && pile.ownerId === viewerId;
      if (spec.target === 'zone') {
        if (pile.kind !== 'zone') return false;
        // Moving a card to the pile it's already in is a no-op offer, so
        // don't light it up. Playing from hand has no such exclusion.
        return action === 'move' ? pile.id !== fromPileId : true;
      }
      return false;
    })
    .map((pile) => pile.id);
}

/**
 * Pile-LEVEL actions (D29) — deliberately a separate table from
 * `ACTIONS` above, because they answer a different question.
 *
 * `ACTIONS`/`actionsForCard` answer *"what can this CARD do"*: they act
 * on the card under the cursor and are offered on that card, in the
 * hover row. Dealing does not act on the hovered card at all — it acts on
 * the whole pile. Folding it into the card table would offer an
 * irreversible action on every back in the deck stack, reachable by
 * passing a cursor over a card, one row from the harmless Draw (Smith
 * Gate 1). Two questions, two tables, two rendering mechanisms.
 *
 * `destructive` is not decoration: it drives the confirm and the danger
 * styling. Reshuffle & deal ends the round for everyone, and the players
 * whose hands it clears never see the control that did it.
 */
export const PILE_ACTIONS = {
  deal: {
    label: 'Deal',
    destructive: false,
    hint: 'Deal from the deck as it stands, without disturbing anyone\'s existing cards.',
  },
  reshuffleDeal: {
    label: 'Reshuffle & deal',
    destructive: true,
    hint: 'Gather every card back, reshuffle, and deal a fresh hand to each player.',
  },
};

/**
 * The pile-level actions `kind` offers this viewer.
 *
 * Host-only, exactly as dealing already is — this story moves the
 * control, it does not widen who may use it.
 *
 * @param {'deck'|'hand'|'zone'} kind
 * @param {{isHost: boolean}} ctx
 * @returns {string[]} action ids
 */
export function pileLevelActions(kind, { isHost } = {}) {
  if (kind !== 'deck' || !isHost) return [];
  return ['deal', 'reshuffleDeal'];
}
