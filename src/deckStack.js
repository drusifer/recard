// US-133/D160, cluster 4c: the deck's stack - the face-down card, its depth,
// and the host's deal controls - moved out of `ui.js` unchanged. Not a
// component of its own: `<deck-stack>` (a `PileElement`) draws it for a
// pile, and `main.js` draws it directly for the pre-game deck preview
// (`#host-deck-area`), which is not a pile at all. Touches `document` only
// when called.
import { pileLevelActions } from './pileActions.js';
import { cardBackElement } from './pileCards.js';
import { attachTouchDrag } from './dragDrop.js';

/**
 * Renders the draw deck as a small face-down stack with a count badge
 * (US-20) instead of just a text counter, plus (when relevant) the
 * always-visible Deal count input - purely presentational, draw
 * mechanics (US-7) are unchanged.
 *
 * UX follow-up (direct user request): "a Deck is a specific kind of
 * Pile... it is not a Zone at all" - this is now ONLY the deck's row
 * content (the stack + count input), the same role `<fan-pile>` plays
 * for a hand - the heading (title + Draw/Deal/Reshuffle/Shuffle/Split
 * buttons) is built generically by `<pile-panel>` now, via
 * `pileLevelActions('deck', ...)`, same as any other pile's heading.
 * Used both as `<deck-stack>`'s row inside `<pile-panel>` (`opts.isHost`
 * set) and directly by the pre-game preview screen (`#host-deck-area`,
 * no opts - no host controls exist on that screen at all).
 */
/**
 * How many decorative layers sit under the deck's top card - purely a
 * visual sense of thickness, capped so a 52-card deck doesn't render 51
 * elements nobody can see. One layer per ~8 cards reads as "thick",
 * "half", "nearly gone" without anyone counting them.
 */
function deckDepth(count) {
  return Math.min(5, Math.floor((count - 1) / 8));
}

export function renderDeckStack(container, count, options = {}) {
  container.replaceChildren();
  // `classList.add`, not `className =` - `#host-deck-area` (the pre-game
  // preview screen) already carries `.deck-area` from static markup and
  // must keep it; `<deck-stack>` (inside `<pile-panel>`) starts with none,
  // so adding is equivalent to setting there.
  container.classList.add('deck-area-row');

  // D29: the stack and the controls are SIBLINGS. The empty-deck
  // short-circuit below therefore hides the cards only - it used to hide
  // the whole container, which would have taken the deal controls with it
  // exactly when a host most needs them (Smith Gate 1 blocker). The fix
  // is the structure, not a special case inside it.
  const stack = document.createElement('div');
  stack.className = 'deck-stack';
  if (count > 0) {
    // D66/D67, direct user correction: "I should only see 1 card" -
    // was up to 3 purely decorative stacked backs; now exactly one
    // real card element, same as any other pile ever renders for a
    // single card. `options.topCard` (D67: `viewFor` now exposes a
    // hidden pile's own top card, redacted to `{id, faceDown: true}`)
    // carries the real id this needs to be a genuine drag source -
    // absent on the pre-game preview screen (`#host-deck-area`, no
    // game running yet), which stays a plain inert visual exactly as
    // before.
    // *nit (direct user request): "show the stacking for the deck of
    // cards. right now it looks like there's only 1 card there."
    //
    // This REVERSES D66/D67, which removed decorative backs on an
    // earlier direct correction ("I should only see 1 card"). Both are
    // recorded because the reason differs: that removal was about there
    // being three DRAGGABLE cards where one card should be; these layers
    // are inert (`pointer-events: none`, `aria-hidden`) and exist only
    // to give the deck depth. Exactly one real, draggable card still
    // sits on top, which is the part that correction was protecting.
    //
    // Depth scales with the deck so a thick one looks thick and the last
    // few cards visibly thin out - the count badge says the number, this
    // says "a lot" or "nearly gone" at a glance.
    // *nit: the box has to grow with the stack, or a full deck's lowest
    // layers are clipped ("a full deck needs a little more room then an
    // empty one"). Set from the real layer count so it shrinks back too.
    const depth = deckDepth(count);
    stack.style.setProperty('--deck-depth', `calc(${depth} * var(--stack-step))`);
    stack.style.setProperty('--deck-drift', `calc(${depth} * var(--stack-step-x))`);
    for (let layer = depth; layer > 0; layer--) {
      const shim = document.createElement('div');
      shim.className = 'deck-stack-layer';
      shim.style.setProperty('--layer', String(layer));
      shim.setAttribute('aria-hidden', 'true');
      stack.append(shim);
    }
    const back = cardBackElement(options.topCard);
    back.classList.add('deck-stack-card');
    stack.append(back);
    // D95 (direct user request: "make card counts a feature for all
    // Piles... like a badge"): every real pile now gets a universal
    // corner badge from `PileElement` itself - `<deck-stack>`'s OWN
    // badge here would double up with it. `options.pileId` is only ever
    // set by `DeckStackElement` (a real pile, wrapped in
    // `PileElement`); the pre-game preview screen (`#host-deck-area`)
    // calls this directly with no `pileId` and no `PileElement`
    // wrapper at all, so it still needs this one to show anything.
    if (!options.pileId) {
      const badge = document.createElement('span');
      badge.className = 'deck-count-badge';
      badge.textContent = count;
      stack.append(badge);
    }
    // D67, direct user correction ("drop isn't triggering an action
    // it's moving cards around... use the same mechanism as all the
    // other piles, this is a generic pile behavior for all piles"):
    // wired exactly like `renderPileCards`'s own per-card drag - a
    // real card id in `dataTransfer`, the same `onDropCard`/
    // `onCardDrag`/`attachTouchDrag` plumbing every other pile's cards
    // already use. No new mechanism, no pile-specific special case -
    // dropping this wherever it lands dispatches the ordinary MOVE/
    // PICKUP/MOVE path (`dropCardOnPile`, main.js) unchanged, because
    // it now carries a real, findable card id.
    if (options.topCard && options.onDropCard) {
      back.draggable = true;
      back.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', options.topCard.id);
      });
      back.addEventListener('drag', (event) => options.onCardDrag?.(options.topCard, event.clientX, event.clientY));
      back.addEventListener('dragend', () => options.onCardDrag?.(null, 0, 0));
      attachTouchDrag(back, options.topCard, {
        onDropCard: options.onDropCard,
        onCardDrag: options.onCardDrag,
        onCardLift: options.onCardLift,
      });
    }
  } else {
    const empty = document.createElement('div');
    empty.className = 'deck-empty';
    empty.textContent = 'Deck empty';
    stack.append(empty);
  }
  container.append(stack);

  // Deal's count input stays persistent/always-visible - unchanged from
  // D52. UX follow-up (direct user request): "just make the split action
  // always split in half" - no count input for split any more, it's a
  // one-click action like every other deck action now.
  // *fix (queued 2026-09-10, "All players have access to all pile
  // actions no matter what"): `deal`/`reshuffleDeal` are no longer
  // host-only, so this input shows for every viewer now.
  const actions = pileLevelActions('deck', {});
  if (actions.includes('deal') || actions.includes('reshuffleDeal')) {
    container.append(pileCountInput({
      value: options.dealCount ?? 1, onChange: options.onDealCountChange,
      min: 1, max: 20, ariaLabel: 'Cards to deal each player', inputId: 'deck-deal-count',
    }));
  }
}

/** D52: a small, always-visible number input for a pile-level action's
 * count setting (Deal's cards-per-player) - see `renderDeck`'s own
 * comment for why this lives outside the radial menu now. UX follow-up:
 * Split no longer has one - it always splits into 2, no count to set. */
function pileCountInput({ value, onChange, min, max, ariaLabel, inputId }) {
  const input = document.createElement('input');
  input.type = 'number';
  input.min = String(min ?? 1);
  input.max = String(max ?? 20);
  input.value = String(value ?? min ?? 1);
  input.className = 'pile-anchor-count';
  if (inputId) input.id = inputId;
  input.setAttribute('aria-label', ariaLabel ?? 'Count');
  input.addEventListener('input', () => onChange?.(Number(input.value)));
  return input;
}
