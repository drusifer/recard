// US-133/D160, cluster 4d: the table's zone layout - group the piles by the
// Zone they belong to and render one `<zone-panel>` per group, seating each
// player's own Zone in front of them - moved out of `ui.js` unchanged. A plain
// module: `main.js` calls `renderZones`; the zone itself is `<zone-panel>`
// (cluster 3), which `ui.js` (loaded by node tests) could not import.
import { ZONE_TYPES } from './zones/zoneTypes.js';

/**
 * D55 (Sprint 23): Zone is a real, independently-declared entity -
 * `zoneRecords` (`state.zones`, `viewFor`'s `zones`) is the real
 * registry a pile's own `zoneId` points into, and each record's own
 * `type` (`'shared'`/`'perPlayer'`, `src/zones/zoneTypes.js`) drives
 * its default class/position - the same one-module-per-type dispatch
 * `PILE_TYPES` already uses for Piles, instead of `ui.js` branching on
 * whether `ownerId` happens to be truthy. This function has zero
 * opinion about which Zone a pile starts in or how it got there
 * (`state.js`'s `GameConfig.zones`/`buildPiles`/`MOVE_PILE` own that
 * entirely) - it just groups `piles` by `zoneId` and renders one
 * generic `<zone-panel>` per group.
 *
 * A `perPlayer`-type Zone renders "in front of" its owner's seat by
 * default (its own type module's `defaultPosition`); a `shared`-type
 * Zone defaults to normal flex-wrap flow (`#zones`'s own CSS). Either
 * kind switches to an absolutely-positioned, plain top-left
 * `panel-moved` panel the first time it's dragged/resized
 * (`wirePanelLayout`, `opts.layout` - a LOCAL, per-browser preference,
 * `panelLayout.js`, not replicated game state).
 *
 * `seatedPlayers` must be in the same seat order used to render the
 * roster (viewer first, D18), so a personal Zone lands at the SAME
 * seat its owner's roster entry is drawn at; one with no seated owner
 * (shouldn't happen) is skipped defensively.
 */
/**
 * One Zone group's own render (US-107, cognitive-complexity extraction
 * from `renderZones` - unchanged, including its skip-defensively `return`
 * where the loop used to `continue`).
 *
 * `zoneId`/`record` is a validated reference (`state.js`'s `buildPiles`
 * throws at table-creation time on anything that isn't) - every group
 * here has a real record, no defensive fallback needed.
 */
function renderOneZone(zoneId, pilesInZone, piles, zoneRecords, seatedPlayers, container, options) {
  const record = zoneRecords.find((z) => z.id === zoneId);
  const zoneType = ZONE_TYPES[record.type];

  let seatIndex = -1;
  if (record.ownerId) {
    seatIndex = seatedPlayers.findIndex((p) => p.id === record.ownerId);
    if (seatIndex === -1) return; // owner not in the current roster (shouldn't happen) - skip defensively
  }

  const zoneElement = document.createElement('zone-panel');
  container.append(zoneElement);

  if (!record.ownerId) {
    // *nit fix (direct user request, "don't hide zone headings
    // ever"): previously suppressed for a single-pile zone (the
    // reasoning being "the lone pile's own heading already says the
    // same thing") - reversed. The suppression is exactly what made
    // an ungrouped pile (`MOVE_PILE`'s own "drop on open table space"
    // case, `zoneId` freshly minted to the pile's own id) look
    // parentless: no visible Zone heading at all, only the pile's -
    // indistinguishable from a pile that was never grouped into a
    // real Zone at all. Always render it now, `record.name` as-is.
    zoneElement.render(record.id, record.name, pilesInZone, piles, options);
    return;
  }

  const ownerName = options.resolveOwnerName?.(record.ownerId) ?? record.ownerId;
  zoneElement.render(record.id, ownerName, pilesInZone, piles, options);
  // US-121/D142: a bot's thought bubble belongs on its SEAT - which is
  // this panel, since the in-game roster ring was retired. The
  // decisions come from the talk log (`decisionsBySpeaker`); which
  // bubble is open is client-local state `main.js` holds across the
  // re-render every broadcast causes.
  const thoughts = options.thoughts?.get(record.ownerId);
  if (thoughts?.decisions.length) {
    const bubble = document.createElement('thought-bubble');
    bubble.dataset.who = ownerName;
    bubble.dataset.playerId = record.ownerId;
    zoneElement.append(bubble);
    bubble.render({ decisions: thoughts.decisions, open: options.openThoughtId === record.ownerId });
  }
  // AFTER `.render()`, not before - `renderZonePanel`'s own first
  // line (`zoneEl.className = 'zone'`) would otherwise wipe this
  // class out.
  if (zoneType.className) zoneElement.classList.add(zoneType.className);
  // `wirePanelLayout` (called inside `render` above) only ever sets
  // `left`/`top` once a REAL stored position exists - a player zone
  // with none yet still needs its ring-position default, same as it
  // always has.
  if (!zoneElement.classList.contains('panel-moved')) {
    const pos = zoneType.defaultPosition(seatIndex, seatedPlayers.length);
    if (pos) {
      zoneElement.style.left = `${pos.leftPct}%`;
      zoneElement.style.top = `${pos.topPct}%`;
    }
  }
}

export function renderZones(container, piles, seatedPlayers, zoneRecords, options = {}) {
  container.replaceChildren();

  const byZoneId = new Map();
  for (const pile of piles) {
    if (!byZoneId.has(pile.zoneId)) byZoneId.set(pile.zoneId, []);
    byZoneId.get(pile.zoneId).push(pile);
  }

  for (const [zoneId, pilesInZone] of byZoneId) {
    renderOneZone(zoneId, pilesInZone, piles, zoneRecords, seatedPlayers, container, options);
  }
}
