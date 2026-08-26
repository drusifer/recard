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
}
