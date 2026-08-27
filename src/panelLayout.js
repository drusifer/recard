/**
 * Panel positions/sizes as PURELY LOCAL, per-browser preference -
 * reversed from an earlier pass that made this replicated,
 * host-authoritative game state (`state.layout`, MOVE_PANEL/
 * RESIZE_PANEL). Direct user request: every table starts from the same
 * computed default arrangement, and each viewer's own adjustments are
 * theirs alone - never sent over the network, never part of a
 * save/restore snapshot. `storage` is injected (same `{getItem,
 * setItem}` shape `persistence.js` takes) so this is testable without a
 * browser.
 *
 * *nit (2026-08-26) history: a same-day pass briefly removed
 * `savePanelPosition`/pointer-drag entirely ("remove pointer-based
 * panel behavior"), then a DIRECT USER CORRECTION restored it: "zone
 * movement is still broken, it was working great until you broke it -
 * Zones can be moved anywhere on the table." The "remove pointer-
 * based" ask turned out to be about the CARD hover-popup ("cards are
 * Movable not Actionable"), not Zone positioning - Zones genuinely
 * need free, anywhere-on-the-table placement, which only a real
 * pointer-drag (continuous position tracking) can give; Piles instead
 * use native HTML5 drag for their own, different capability
 * (reparent/reorder between discrete targets) - two different
 * entities, two different Movable mechanisms, not one shared one.
 */
export const PANEL_LAYOUT_KEY = 'recard:panel-layout:v1';

/** Never let a corrupt or hostile storage break rendering - absence (or
 * garbage) just means "nothing adjusted yet", same as an empty table. */
export function loadPanelLayout(storage) {
  try {
    const raw = storage.getItem(PANEL_LAYOUT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveEntry(storage, id, patch) {
  const layout = loadPanelLayout(storage);
  layout[id] = { ...layout[id], ...patch };
  try {
    storage.setItem(PANEL_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    /* private mode / quota - the drag/resize itself already applied
       visually; losing the persisted preference is not worth throwing. */
  }
}

export function savePanelPosition(storage, id, x, y) {
  saveEntry(storage, id, { x, y });
}

export function savePanelSize(storage, id, w, h) {
  saveEntry(storage, id, { w, h });
}

/**
 * UX follow-up (direct user request): "update the preset to use this
 * layout" - a preset MAY declare a starting arrangement for its own
 * SHARED, deterministically-id'd panels (`table-zone`/`score`/a
 * Solitaire foundation-N, cascade-N, etc - never a per-player one, since
 * `player-<ownerId>`/`hand:<ownerId>` keys depend on a connection id no
 * preset can know ahead of time). Applied wholesale, one id at a time -
 * the preset's own entry REPLACES whatever this browser already had
 * stored for that same id (same "explicit choice wins" reasoning
 * `saveEntry`'s per-id merge already uses, just for every field at once
 * instead of a patch), while every OTHER id already in storage (a
 * different game's arrangement, this browser's own past customizing)
 * is left untouched.
 */
export function applyPresetLayout(storage, layout) {
  if (!layout) return;
  const current = loadPanelLayout(storage);
  const merged = { ...current, ...layout };
  try {
    storage.setItem(PANEL_LAYOUT_KEY, JSON.stringify(merged));
  } catch {
    /* private mode / quota - same "not worth throwing" call saveEntry already makes. */
  }
}
