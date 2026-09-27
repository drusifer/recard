import { componentFor } from '../pileActions.js';
import { pileDragFromDrop } from '../dragDrop.js';
import { wirePanelLayout } from '../panelInteraction.js';

/**
 * US-133/D160, cluster 3: `<zone-panel>` owns what a ZONE is. It used to be
 * a thin adapter over `renderZonePanel` in `ui.js`; that body is now its
 * `render`, and move/resize is the plain `panelInteraction.js` it wires once
 * for the whole zone ("Piles move with their containing Zone").
 *
 * Renders the bordered/padded/positioned box, one title bar (or none, for
 * the common single-pile case), and every Pile it holds as its own
 * component (`componentFor(kind)`: `<pile-panel>`, `<fan-pile>`,
 * `<deck-stack>`). One generic element handles all three shapes
 * `renderZones` (`ui.js`) builds - a standalone shared zone, the grouped
 * Table Zone, each player's own Zone - varying only in the `piles` list and
 * `title` passed to `.render(...)`.
 */
export class ZonePanelElement extends HTMLElement {
  /**
   * UX follow-up (direct user request): "zone is one thing, pile is
   * another." Renders a ZONE: the bordered/padded/positioned box, ONE
   * title bar (`title` - the ZONE'S OWN name, distinct from any pile
   * inside it - `null` for the common single-pile case, where the lone
   * pile's own heading doubles as the drag handle instead of adding a
   * redundant second one), and every Pile it holds as its own
   * `<pile-panel>` child (`piles`, always a non-empty array - even a
   * "plain" shared zone like a CREATE_ZONE'd one or a Solitaire
   * foundation is a Zone holding exactly one Pile now, not a Zone/Pile
   * hybrid). `id` keys `opts.layout` (`panelLayout.js`) - the STABLE
   * identity of the zone element Zone, independent of which/how many piles it holds.
   *
   * Move/resize (`wirePanelLayout`) is wired EXACTLY ONCE, here, for the
   * whole Zone - "Piles move with their containing Zone." A Pile
   * (`renderPile`, above) never wires its own.
   */
  render(id, title, piles, allPiles, options) {
    this.replaceChildren();
    this.className = 'zone';
    // The Zone's own stable identity (`opts.layout` key) - distinct from
    // any one pile's own `data-pile-id` (`renderPile`), since a Zone can
    // hold several piles and so has no single pile id of its own.
    this.dataset.groupId = id;

    // *nit fix (direct user request, "don't hide zone headings ever"):
    // previously conditional on `title` being truthy - a standalone
    // 1-pile zone's heading was suppressed on the reasoning that the
    // lone pile's own title already said the same thing. Reversed: every
    // Zone renders its own heading now, unconditionally, consistent
    // regardless of pile count or whether it has a name yet - the zone element is
    // also the pointer-drag handle (`wirePanelLayout`'s own comment has
    // the full "zones need free positioning" reasoning).
    const heading = document.createElement('header-actions');
    this.append(heading);
    // US-71 (D62): `remove` offered on every Zone with its own heading
    // EXCEPT the Table Zone - the one exemption checkable here without
    // new plumbing (a fixed, known id); everything else the reducer
    // itself is the real gate for (preset-declared, non-empty), same
    // "offer generically, reducer authorizes" discipline every other
    // action in the zone element table already follows (D43).
    const zoneActionIds = id === 'table-zone' ? [] : ['remove'];
    heading.render(title, zoneActionIds, {
      headingClass: 'panel-title',
      // *nit (2026-08-26): rename affordance, any player.
      rawName: title,
      onRename: options.onRenameZone ? (name) => options.onRenameZone(id, name) : undefined,
      onAction: (actionId) => { if (actionId === 'remove') options.onRemoveZone?.(id); },
      // *nit (direct user request, "don't enable X unless empty"): same
      // Nielsen #5 reasoning as the pile-level `remove`/`changePileType`
      // disabling (`Pile.disabledActions`) - REMOVE_ZONE is empty-only
      // at the reducer (D62) too; a Zone is "empty" when it has no
      // piles left in it, `piles` (the zone element function's own param) already
      // says exactly that.
      disabled: piles.length > 0 ? ['remove'] : [],
    });
    const dragHandle = heading;

    const body = document.createElement('div');
    body.className = 'zone-body';
    this.append(body);

    // (bloop: piles/zones/cards are all Movable) - a card dropped on the
    // Zone's own EMPTY space (not onto any pile inside it) spawns a
    // brand-new pile here, seeded with that card. Wired on `body`, not
    // `zoneEl` itself - `zoneEl` also contains the heading/pile-panel
    // children, and a drop landing on one of THOSE is handled by that
    // pile's own listener (`renderPileShell`, which now stops
    // propagation so it never also reaches the zone element one).
    // (bloop) also handles a dragged PILE dropped here - reparenting it
    // into THIS zone as a sibling (Smith's Gate 1 ruling, D55: always a
    // sibling, never a merge). `renderPileShell`'s own per-pile drop
    // handler ignores a pile-drag-token and lets it bubble up here
    // unhandled (rather than misreading it as a card id) - a pile
    // reparents into the ZONE it lands in, not specifically the other
    // pile pixel it happened to land on top of.
    if (options.onDropCardOnZone || options.onMovePile) {
      // D35 note (unchanged reasoning): real browsers don't expose
      // `dataTransfer` values during `dragover`, only `.types` - so the
      // pile-action/pile-drag/card distinction only happens at DROP time,
      // same as every other drop target in the zone element file. `dragover` always
      // just previews "something droppable" unconditionally.
      body.addEventListener('dragover', (event) => {
        event.preventDefault();
        // `the zone element` (`.zone`), not `body` (`.zone-body`) - matches the
        // existing `.zone.drag-over` CSS rule (Phase 72's task.md AC:
        // "reuses the drag-over highlight"); toggling it on `body` alone
        // wouldn't match either that rule or `.pile-section.drag-over`,
        // so nothing would actually render.
        this.classList.add('drag-over');
      });
      body.addEventListener('dragleave', (event) => {
        if (event.target === body) this.classList.remove('drag-over');
      });
      body.addEventListener('drop', (event) => {
        event.preventDefault();
        this.classList.remove('drag-over');
        // Stop here, whichever branch below actually applies - otherwise
        // the zone element would ALSO bubble to `#zones`'s own "drop on open table
        // space ungroups" handler (`main.js`), double-dispatching a
        // reparent-into-the zone element-zone AND an ungroup for the same drop.
        event.stopPropagation();
        const pileId = pileDragFromDrop(event.dataTransfer);
        if (pileId) { options.onMovePile?.(pileId, id); return; }
        const pileableId = event.dataTransfer.getData('text/plain');
        if (pileableId) options.onDropCardOnZone?.(pileableId, id);
      });
    }

    // UX follow-up (direct user request): "a Deck is a specific kind of
    // Pile... it is not a Zone at all" / "pile-panel and header-actions
    // should be internalized in the fan-pile webcomponent, same for all
    // Pile type components" - which ELEMENT renders a pile is decided
    // here, off the pile CLASS's own `static component` (D56, `componentFor`,
    // `pileActions.js`), never a `pile.kind === 'hand'` check inside any
    // one component. `<fan-pile>`/`<deck-stack>` are now fully self-
    // contained Piles (their own header+row+drop wiring, via
    // `renderPileShell`) - `<pile-panel>` is just the flat-row case's own
    // equally-thin wrapper, not a generic container the other two nest
    // inside any more.
    for (const pile of piles) {
      const element = document.createElement(componentFor(pile.kind));
      body.append(element);
      element.render(pile, allPiles, options);
    }

    // Bug fix (direct user request): a card dropped on a Zone's own empty
    // space spawns a new pile there (the `body` listener above) - but a
    // Zone whose box shrinks exactly to its piles' content (`.seat-zone`,
    // `width: max-content`) has NO empty space to land on once its one
    // pile (the hand) fills the whole body; a Table Zone only "just
    // works" because `.zone:not(.seat-zone)` flex-grows into its row's
    // leftover width for free. Confirmed live: a `.seat-zone`'s
    // `.zone-body` bounding box was pixel-identical to its lone
    // `.pile-section`'s. One reserved, always-present flex child (sized
    // to one card slot) restores real droppable space generically, for
    // every zone type - not just `.seat-zone` - so laying down a meld
    // beside a hand works the same way dropping onto the Table Zone does.
    if (options.onDropCardOnZone || options.onMovePile) {
      const gutter = document.createElement('div');
      gutter.className = 'zone-drop-gutter';
      body.append(gutter);
    }

    wirePanelLayout(this, id, dragHandle, options);
  }
}

customElements.define('zone-panel', ZonePanelElement);
