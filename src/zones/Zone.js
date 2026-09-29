/**
 * The Zone base class (D56 - real class, was `zoneTypes.js`'s ad hoc
 * per-module dispatch of plain `{className, defaultPosition}` exports).
 * A Zone owns box/position semantics only - the cards inside it belong
 * to the Pile(s) grouped into its `zoneId` (D55's own Zone/Pile split).
 *
 * `viewerRelation` is deliberately a pure FUNCTION here, not a
 * "YouZone"/"OpponentZone" subclass pair - `state.zones` is shared,
 * replicated data (D7/D17): one record per zone regardless of who's
 * looking, and every viewer receives the identical record via
 * `viewFor`. A per-viewer class would mean picking a class for a zone
 * before knowing who's asking, which is incoherent for shared state.
 * This centralizes what was previously inline `ownerId ===
 * opts.viewerId` checks scattered through `ui.js`.
 */
import { homePileKindFor } from '../pileables/pileableTypes.js';

export class Zone {
  /** CSS class applied to this zone's element at rest, beyond the
   * shared `.zone` every zone gets. `null` for the base/shared case. */
  static className = null;

  /** Which Web Component renders this zone's content - a component
   * renders a render SHAPE, so multiple Zone classes may share one tag
   * (D56, same principle as Pile's `component`). */
  static contentComponent = 'zone-panel';

  /** Default absolute position for this zone, or `null` to leave it in
   * `#zones`'s normal flex-wrap flow until dragged. Base/shared case:
   * no default position. */
  static defaultPosition() {
    return null;
  }

  /** `'you' | 'opponent' | null` - a pure, render-time relation between
   * a zone record and the current viewer, not a data type. `null` for
   * an ownerless (shared) zone, which has no viewer relation at all. */
  static viewerRelation(zone, viewerId) {
    if (zone.ownerId == null) return null;
    return zone.ownerId === viewerId ? 'you' : 'opponent';
  }

  /**
   * The write side of a zone's own title bar: rename (double-click the
   * title) and remove (`<zone-panel>`'s own action button - never
   * offered for the Table Zone, that gate lives at the call site since
   * it is about WHICH zone, not what kind it is). Static, like every
   * other Zone method - nothing here differs per zone TYPE (`shared`
   * vs `perPlayer`), so neither `PerPlayerZone` nor `SharedZone`
   * overrides them; a future kind-specific rename/remove rule would.
   *
   * PURE, same shape as `Pile.performAction`: a descriptor (the wire
   * `action` plus which dispatch STRATEGY to send it through), not a
   * call - see that method's own doc for why.
   */
  static rename(zoneId, name) {
    return { action: { type: 'RENAME_ZONE', zoneId, name }, guard: 'alert' };
  }

  static remove(zoneId) {
    return { action: { type: 'REMOVE_ZONE', zoneId }, guard: 'alert' };
  }

  /** A pile dragged by its own title bar and dropped on this zone's
   * body reparents into it (`targetZoneId: null` would ungroup into a
   * fresh standalone Zone, D55 - not this path, which always names a
   * real target). */
  static acceptDroppedPile(pileId, zoneId) {
    return { action: { type: 'MOVE_PILE', pileId, targetZoneId: zoneId }, guard: 'alert' };
  }

  /**
   * A card dropped on a Zone's own EMPTY space (not onto one of its
   * piles - that is a pile-to-pile drop, `Pile`'s own concern) spawns a
   * brand-new pile there, seeded with that card - one atomic dispatch
   * rather than create-then-move as two, which would race a guest's
   * own relayed send against the host's broadcast of the intermediate
   * state.
   *
   * *nit (direct user request): "drops in chipstacks should add the
   * chips to the existing piles" - a pileable that names a home pile
   * kind (only chips do) joins the one already in this zone instead of
   * starting another beside it - a plain MOVE there instead of a second
   * `CREATE_PILE`; same uniform `{action, guard}` shape either way, no
   * separate "kind" the caller needs to branch on.
   *
   * `view` is the current view, passed in as DATA (not a callback) -
   * this stays pure. `undefined` when there is no source pile to find
   * (the card, or the whole view, is gone).
   */
  static acceptDroppedCard(pileableId, zoneId, view) {
    if (!view) return;
    const fromPileId = view.piles.find((p) => p.cards.some((c) => c.id === pileableId))?.id;
    if (!fromPileId) return;
    const home = homePileKindFor(view.piles.flatMap((p) => p.cards).find((c) => c.id === pileableId));
    const existing = home && view.piles.find((p) => p.kind === home && p.zoneId === zoneId);
    if (existing) return { action: { type: 'MOVE', pileableId, toPileId: existing.id }, guard: 'silent' };
    return { action: { type: 'CREATE_PILE', zoneId, fromPileId, pileableId }, guard: 'alert' };
  }
}
