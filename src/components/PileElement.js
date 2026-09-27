// US-133/D160, cluster 4b: what EVERY pile component shares - the pile's own
// section (its count badge, its title bar, its drop wiring, its action
// controls) and the Split/Pickup picker mode - as one base class, so the four
// pile components differ only in the ROW they put inside it.
//
// This is the template method the four components used to imitate by each
// repeating the same split-picker check and calling a shared function with a
// callback. Now `render` is written once; a subclass supplies `buildRow`.
// The base is abstract: it is not registered as an element itself.
import { pileLevelActions, disabledPileActionsFor } from '../pileActions.js';
import { MAX_SPREAD, MIN_SPREAD } from '../piles/Pile.js';
import { PILE_TYPES, convertibleKindsFor, pileKindLabel, pileInstanceFor } from '../piles/pileTypes.js';
import { effectiveSpread, cardElement } from '../pileCards.js';
import { clearPileDragOver, performPileDrop, pileDragFromDrop, showPileDragOver } from '../dragDrop.js';

/**
 * UX follow-up (direct user request): "pile-panel and header-actions
 * should be internalized in the fan-pile webcomponent... same for all
 * Pile type components." A specialized row shape (`<fan-pile>`,
 * `<deck-stack>`) is a COMPLETE Pile on its own now, not a "row"
 * `renderPile` wraps with a separately-built header - each one calls
 * this shell directly against itself. `renderPileShell` is what's
 * actually shared: the "Actionable" title bar (`<header-actions>`,
 * pile-level actions), the addressability (`data-pile-id`/`data-kind`),
 * and the drop-target wiring every Pile needs REGARDLESS of how its
 * cards are drawn - `buildRow(container)` is the one thing that
 * differs, building whatever content sits below the header and
 * returning the element drop hit-testing should measure against.
 *
 * Never draws a Zone's own box (border/padding/background) and never
 * wires its own move/resize - a Pile always lives inside a Zone
 * (`renderZonePanel`, below), which owns both of those exactly once for
 * everything inside it.
 */
function renderPileShell(container, pile, allPiles, options, buildRow) {
  container.replaceChildren();
  container.className = 'pile-section';
  container.dataset.pileId = pile.id; // D25: addressable as a drop target
  // D45/D53: the kind travels with the element so the touch-drag path
  // (which only has the DOM node, not the view object, at drop time)
  // can resolve its own drop-target geometry too - see
  // touchTargetAt/attachTouchDrag.
  container.dataset.kind = pile.kind;

  // D95 (direct user request: "make card counts a feature for all
  // Piles... upper left corner... like a badge") - universal now, no
  // per-kind opt-in: every pile gets the same corner-stamped count,
  // here in `renderPileShell` because it's the ONE function every pile
  // component (`<pile-panel>`/`<fan-pile>`/`<deck-stack>`) actually
  // funnels through - one append, not three copies. Absolutely
  // positioned (`.pile-count-badge`, style.css) against `.pile-section`
  // itself, not any one card - the same corner regardless of whether
  // the pile renders as a flat row, a fan, or a stack. `pile.count ??
  // pile.cards.length` matches every other place a possibly-redacted
  // pile's true size is read (a hidden `deck` pile's view carries
  // `count` explicitly; every other kind's is just its real array).
  const countBadge = document.createElement('span');
  countBadge.className = 'pile-count-badge';
  // *nit: what the badge SAYS is the pile kind's own business now - a
  // chip tray stamps its total value, everything else its count.
  countBadge.textContent = (PILE_TYPES[pile.kind] ?? PILE_TYPES.plain).badge(pile);
  container.append(countBadge);

  // UX follow-up (direct user request): "like zones, Piles are
  // Actionable and should have a title bar with action buttons for
  // that pile type" - every pile's own heading is a real
  // `<header-actions>` now (the same builder the deck's own title bar
  // already used), not a plain text div. `pileLevelActions(pile.kind,
  // ...)` returns `[]` for every kind with nothing pile-level to offer
  // (plain/discard/foundation/cascade/rankAdjacent today), so this is a
  // pure superset of the old plain-text heading for those - no visual
  // change unless a kind actually has pile-level actions.
  //
  // D91: `sortRank`/`sortSuit` used to be filtered out here - they'd
  // offered from `handPile.pileActions` since D14 with nothing behind
  // them (D14's own client-only `handOrder.js` overlay had no home left
  // once a hand became a real state-level pile). `SORT_PILE` (state.js)
  // is that real reducer action now, so the buttons are a real
  // affordance and no longer need hiding.
  const heading = document.createElement('header-actions');
  container.append(heading);
  heading.render(
    // *nit (2026-08-26), direct user request: the card count no longer
    // appears in a pile's own title text ("Deck (32)" -> "Deck") - D95
    // (below, `renderPileShell`'s own corner-badge append) is where
    // every pile's count actually shows now, not the title.
    pile.name,
    pileLevelActions(pile.kind, {
      // *fix (queued 2026-09-10, "All players have access to all pile
      // actions no matter what"): `isOwner`/`isHost`/`isShared` used to
      // gate which actions a pile OFFERED per viewer - removed along
      // with the pile classes' own gates that read them.
      // US-62 (Sprint 23): hide/show are mutually exclusive, keyed off
      // the pile's OWN current orientation (`Pile`/`DiscardPile`'s
      // `orientationActions`) - needs the actual cards, not just counts.
      cards: pile.cards,
    })
      // Found live while smoke-testing Phase 84 (US-71/D62): `remove`
      // is a KIND-level offer (`Pile.pileActions`), but the default
      // Table pile (`id: 'table'`) is exempt from REMOVE_PILE by ID,
      // not kind - offering the button there would be a guaranteed
      // confirm-then-fail (Gate 1/Gate 2's whole point was avoiding
      // exactly this). Same known-id exemption `renderZonePanel`
      // already hardcodes for the Table Zone, just for its pile
      // counterpart.
      .filter((id) => !(id === 'remove' && pile.id === 'table')),
    {
      // `pile-title`, not `panel-title` - visually/semantically distinct
      // from a Zone's own heading class, and the selector
      // `.pile-title[draggable="true"]`'s cursor affordance (style.css)
      // keys off it specifically.
      headingClass: 'pile-title',
      draggable: true,
      // UX follow-up (direct user request): "a Deck is a specific kind
      // of Pile" - which of ITS OWN offered actions are disabled (Deal,
      // at zero cards) is now read polymorphically per pile type
      // (`disabledPileActionsFor`), not a `pile.kind === 'deck'` check
      // hardcoded here.
      disabled: disabledPileActionsFor(pile.kind, pile.count ?? pile.cards.length, { cards: pile.cards }),
      // US-61 (Sprint 23), Smith's ruling (Phase 70): `take` confirms
      // unconditionally EXCEPT a 1-card pile, where it's identical in
      // effect to that card's own un-confirmed single-card `pickup`.
      // `remove` (direct user request, 2026-08-27): "it's already empty
      // so stop asking" - `disabledPileActionsFor` only ever ENABLES
      // this button when the pile is already empty, so the confirm was
      // asking about a consequence (losing cards) that can't happen.
      noConfirm: [...((pile.cards?.length ?? pile.count) === 1 ? ['take'] : []), 'remove'],
      onAction: (id, value) => options.onPileAction?.(pile.id, id, value),
      // *nit (direct user request): "a menu for the change pile action
      // and give me an indication of the currently selected pile type" -
      // `changePileType`'s current value (this pile's own `kind`) and
      // its full choice list (`CHANGE_PILE_TYPE_KINDS`, D87: every
      // registered kind, symmetrically - any pile can become any other
      // kind, deck/hand included on both ends now) live here, not in
      // `ACTION_SPECS` - the spec only knows this action IS an enum
      // (`enum: true`), never which pile it's rendering for.
      enumOptions: {
        changePileType: {
          value: pile.kind,
          // *fix (direct user request): "dont show non-chip piletypes in
          // the menu" - the choices are the PILE'S own, not every kind
          // that exists (`convertibleKindsFor`, D87 unchanged for cards).
          choices: convertibleKindsFor(pile.kind).map((kind) => ({ value: kind, label: pileKindLabel(kind) })),
        },
      },
      // Tighten/Loosen slider (2026-09-13): `spread`'s current value and
      // bounds, the RangeAction sibling of `changePileType`'s enumOptions
      // above - `ACTION_SPECS.spread` only knows this action IS a range
      // (`range: true`), never which pile or pile KIND it's rendering
      // for (the ceiling is per-kind, `Pile.js`'s own `maxSpread`).
      rangeOptions: {
        spread: {
          value: effectiveSpread(pile),
          min: MIN_SPREAD,
          max: PILE_TYPES[pile.kind]?.maxSpread ?? MAX_SPREAD,
        },
      },
      // *nit (2026-08-26): rename affordance, any player.
      rawName: pile.name,
      onRename: options.onRenamePile ? (name) => options.onRenamePile(pile.id, name) : undefined,
      // *nit (2026-08-26), direct user request: "All Movables can be
      // drag/drop" - every pile's title is a drag source now (was
      // gated to `isReparentable` kinds only). A non-reparentable kind
      // (hand/foundation/cascade/rankAdjacent - deck reversed by a
      // later *nit, see DeckPile.js) still can't change ZONES (the
      // drop handler below rejects that, matching `MOVE_PILE`'s own
      // game-rule eligibility) but CAN still be dropped onto another
      // pile to merge (below) - that's never a game-rule concern.
      pileDraggable: Boolean(options.onMovePile) || Boolean(options.onMergePile),
      pileId: pile.id,
    },
  );

  const row = buildRow(container);

  if (options.onDropCard) {
    container.addEventListener('dragover', (event) => {
      event.preventDefault();
      showPileDragOver(container, row, { x: event.clientX, y: event.clientY }, pile.kind);
    });
    container.addEventListener('dragleave', () => clearPileDragOver(container));
    container.addEventListener('drop', (event) => {
      event.preventDefault();
      // (direct user request) - "all piles can be dropped into any other
      // pile... cards added to the target, dropped pile removed once
      // empty." Direct user correction: "remove the weird zone
      // distinction, KISS" - ANY pile dropped directly onto another pile
      // merges, full stop, no same-zone/cross-zone split. A drop onto a
      // pile in a DIFFERENT zone used to bubble up to the containing
      // Zone's own drop handler (`onMovePile` - reparent as a sibling
      // there) - that reparent-as-sibling behavior still exists for a
      // pile dropped on a zone's own EMPTY space (Smith's Gate 1 ruling,
      // D55, unchanged), but landing directly ON another pile always
      // merges now, `stopPropagation()`'d here so it no longer reaches
      // that handler.
      const draggedPileId = pileDragFromDrop(event.dataTransfer);
      if (draggedPileId) {
        if (draggedPileId === pile.id) return;
        event.stopPropagation();
        options.onMergePile?.(draggedPileId, pile.id);
        return;
      }
      // An ordinary card drop DOES belong to this specific pile - stop
      // it here so the Zone's own drop handler doesn't ALSO fire and
      // spawn a redundant new pile for the same drop.
      event.stopPropagation();
      performPileDrop(container, row, pile.id, event.dataTransfer.getData('text/plain'),
        { x: event.clientX, y: event.clientY }, options.onDropCard, pile.kind);
    });
  }
}

/**
 * The FLAT row shape (`componentFor(kind) === 'pile-panel'` - every kind
 * except a hand's fan or a deck's stack) - `<pile-panel>`'s own thin
 * wrapper around `renderPileShell`, same shape `<fan-pile>`/
 * `<deck-stack>` now have for their own row shapes.
 */
/**
 * The Split picker (D91, direct user request: "we're missing... split
 * pile" - `SPLIT_PILE` (state.js) has been a real, tested reducer
 * action since long before this; there was simply never a way to
 * trigger it, on the standing "no false affordance" discipline
 * (`Pile.pileActions`'s own comment). Spec: raise the cards into a
 * tight fan and KEEP them raised until toggled off; hovering
 * highlights the nearest gap between cards, with guide marks at the
 * 25/50/75% marks along the row; clicking that gap commits.
 *
 * D92 (direct user request: "split should always fan the pile to allow
 * the guided picker" - deck included, no instant-shortcut carve-out):
 * called from `<deck-stack>` (`DeckStack.js`) exactly the same way
 * `<pile-panel>` calls it - a deck's card array is real and full in
 * the view (D84, "TOTAL PERMISSIVE" - the DATA was never redacted),
 * `DeckPile.showsFace` (always `false`) is what keeps the fan showing
 * real backs, not real faces, for a pile whose whole point is staying
 * hidden. No pile-kind branch here at all - the picker doesn't know or
 * care that a deck is any different from any other pile.
 *
 * Every card renders inert (`disabled: true`) while picking - the
 * normal drag/click affordances would fight the hover-to-choose-a-gap
 * gesture this row exists for. `pileInstanceFor`'s `showsFace` still
 * decides face-vs-back per card (same rule as the normal row) - picking
 * a split point is not a special "peek" mode.
 */
function renderSplitPicker(container, pile, options) {
  // `fan-row` reuses the exact raise (`--raise-base`, below) and
  // overlap-margin rules the hand's own fan already established (
  // `.fan-row .middle-card`/`.fan-row .middle-card + .middle-card`,
  // style.css) - a tight fan is a tight fan, no reason to duplicate the
  // formula for a second row shape.
  const row = document.createElement('div');
  row.className = 'card-row split-picker-row fan-row';
  // Same single source as any other row - the picker fans the pile it is
  // splitting, at that pile's own spread, not at a duplicated constant.
  row.style.setProperty('--pile-spread', String(effectiveSpread(pile)));
  container.append(row);

  const pileInstance = pileInstanceFor(pile, options.viewerId);
  const wrappers = pile.cards.map((card, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'middle-card split-picker-card';
    // A shallow rotate+raise per card, pivoting off-center - just
    // enough to read as "lifted into a fan", not the full hand-fan
    // curve (`renderPileCards`' own `--raise-base`, a wider spread
    // that would push a long pile off the panel).
    const center = (pile.cards.length - 1) / 2;
    const offset = index - center;
    wrapper.style.setProperty('--raise-base', `rotate(${offset * 3}deg) translateY(${-4 - Math.abs(offset) * 1.5}px)`);
    const isBack = !pileInstance.showsFace(card, options.viewerId);
    wrapper.append(cardElement(card, { disabled: true, back: isBack }));
    row.append(wrapper);
    return wrapper;
  });

  // Anchored to `row` itself, not `container` (the whole pile-section,
  // header included) - a real bug caught before the user ever hit it
  // live: `container`'s own height spans the title bar too, so a guide
  // positioned against IT stretched from behind the header down through
  // the cards, reading as a stray line with no relationship to what was
  // under the pointer. `row` is exactly the cards' own box.
  const guides = document.createElement('div');
  guides.className = 'split-picker-guides';
  for (const pct of [25, 50, 75]) {
    const guide = document.createElement('div');
    guide.className = 'split-picker-guide';
    guide.style.left = `${pct}%`;
    guides.append(guide);
  }
  row.append(guides);

  const highlight = document.createElement('div');
  highlight.className = 'split-picker-highlight';
  highlight.hidden = true;
  row.append(highlight);

  // The x-coordinate of gap `index` (`cards[0..index)` stay, `cards
  // [index..]` move - the same convention `splitPileAt`, state.js,
  // uses) - the midpoint between the card just before it and the card
  // just after, in viewport coordinates so it can be compared straight
  // against a pointer event's own `clientX`.
  function gapX(index) {
    const before = wrappers[index - 1].getBoundingClientRect();
    const after = wrappers[index].getBoundingClientRect();
    return (before.right + after.left) / 2;
  }

  function nearestGap(clientX) {
    let nearest = 1;
    let nearestDistance = Infinity;
    for (let index = 1; index < wrappers.length; index++) {
      const distance = Math.abs(clientX - gapX(index));
      if (distance < nearestDistance) { nearestDistance = distance; nearest = index; }
    }
    return nearest;
  }

  if (wrappers.length >= 2) {
    row.addEventListener('pointermove', (event) => {
      const index = nearestGap(event.clientX);
      const rowRect = row.getBoundingClientRect();
      highlight.hidden = false;
      highlight.style.left = `${gapX(index) - rowRect.left}px`;
      highlight.dataset.index = String(index);
    });
    row.addEventListener('pointerleave', () => { highlight.hidden = true; });
    row.addEventListener('click', () => {
      if (highlight.hidden) return;
      options.onSplitCommit?.(Number(highlight.dataset.index));
    });
  }

  return row;
}


export class PileElement extends HTMLElement {
  /**
   * @param {object} pile the pile's view
   * @param {object[]} allPiles every pile (drop targets, move destinations)
   * @param {object} options the table's callbacks and view state
   */
  render(pile, allPiles, options) {
    // D91-follow-up: a pile toggled into Split/Pickup picking mode
    // (`options.splitPicker`, set by `main.js`'s local-only UI state -
    // this never reaches the reducer until a gap is actually clicked)
    // renders the picker row instead of the normal row. Nothing else about
    // the shell (heading/actions/drop wiring) changes.
    const buildRow = options.splitPicker?.pileId === pile.id
      ? (container) => renderSplitPicker(container, pile, options)
      : (container) => this.buildRow(container, pile, allPiles, options);
    renderPileShell(this, pile, allPiles, options, buildRow);
  }

  /**
   * The row this kind of pile puts inside the shell: a subclass overrides
   * `buildRow(container, pile, allPiles, options)`, appends it to
   * `container` and returns it (the shell wires drops onto what it returns).
   * @abstract
   */
  buildRow() {
    throw new Error(`${this.localName} must implement buildRow`);
  }
}
