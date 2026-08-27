/**
 * Static, client-side game presets (US-15, ARCHITECTURE.md D10). Purely
 * a convenience lookup that prefills the existing deck-config (US-3) and
 * cards-per-player (US-4) fields — no server/state concept, and no
 * enforcement: the host can still change any value before dealing.
 *
 * D49 (Sprint 19): `type` is optional (`'standard'` when absent -
 * every preset above War already relies on that default, unchanged).
 * `allowsPlayerZones` is supported by this same schema (a preset MAY
 * set it) but deliberately not assigned to any preset below - which
 * real games "should" disallow player-added zones is a genuine game-
 * design judgment call this project has no researched basis for making
 * per-preset, and guessing would be exactly the "asserted rather than
 * verified" mistake this project's own retros warn against. The field
 * exists and is wired end-to-end (proven by a direct `state.gameConfig`
 * test, not a preset), ready for whenever a real preset actually needs
 * it.
 *
 * D53 (Sprint 22): `piles` (renamed from `zones` - D55, that name now
 * belongs to the real Zone-entity list a preset can separately declare)
 * is the same "supported, sparingly used" shape as `allowsPlayerZones`
 * above - `[{kind, ownerId: 'perPlayer'|null, count, zoneId?}]`,
 * additive, defaulting to `[]` when absent (every preset above
 * Solitaire relies on that default unchanged). Solitaire/Spit are the
 * first presets that need a declared starting table (real Pile kinds
 * beyond deck/hand a player would otherwise have to Add Zone manually,
 * N times, before playing at all) - `cardsPerPlayer: 0` on both since
 * neither game deals into a traditional hand; the table itself IS the
 * starting layout. Auto-dealing INTO that layout (Klondike's 28-card
 * triangle deal) is deliberately not built - these presets exist to
 * validate the Pile/Zone primitives (D53), not to be a full solitaire
 * engine; the host draws/moves cards into place same as any other game.
 *
 * Gin Rummy also declares `piles` (a single real `discard`-kind pile) -
 * direct user follow-up to D53: replaces the generic shared Table zone
 * that used to stand in for a discard pile with the real thing, now
 * that a declared pile is one line instead of a manual Add Zone click.
 * One system, not two - no preset keeps relying on the generic zone
 * where a real Pile kind now fits.
 *
 * D53 audit follow-up (retired, not left as dead weight): `usesMiddle`
 * used to flag presets depending on the middle-zone privacy mechanics
 * (D7/D8) landing - grepped `main.js`/`ui.js` and found no reader
 * anywhere; that gate's whole reason for existing (D7/D8 not shipped
 * yet) ended in Sprint 2, over 20 sprints ago. Deleted rather than kept
 * as an always-unread field every preset had to carry.
 */
/**
 * UX follow-up (direct user request): "update the preset to use this
 * layout... and preset the layouts for the other games too. That should
 * fix the overlapping issues." A preset MAY seed this browser's local
 * panel arrangement (`panelLayout.js`'s own `{id: {x,y,w,h}}` shape,
 * applied by `applyPresetLayout` the moment its table is created) - but
 * ONLY for a preset's SHARED, deterministically-id'd panels
 * (`table-zone`/`score`, or a Solitaire foundation-N/cascade-N). A
 * per-player panel (`player-<ownerId>`/`hand:<ownerId>`) can never be
 * declared here - that id depends on a connection id no preset can know
 * ahead of time, seated-ring math (`seating.js`) is what actually
 * positions those, same as always.
 *
 * NOTE (flagged, not a universal fix): these are FIXED PIXEL
 * coordinates, calibrated against a real ~1086x576 table-surface (a
 * 1280x800 browser window, 2 seated players) - the exact same kind of
 * one-viewport snapshot a player's own drag-to-move already produces
 * (`panelLayout.js`'s whole design). They read well at that size and
 * the desktop breakpoints near it; a much narrower/wider surface (a
 * phone width, or many more seated players spreading the ring further)
 * is NOT guaranteed collision-free - percentage-based per-seat anchor
 * geometry would be the real, viewport-independent fix, and is still a
 * separate, un-started item (see neo.docs/state.md).
 */

/**
Evenly spaces `ids` in one horizontal row, all the same `w`/`h`.
*/
function row(ids, { x: startX, y, w, h, gap }) {
  return Object.fromEntries(ids.map((id, index) => [id, { x: startX + index * (w + gap), y, w, h }]));
}

// Deck+Table(+Discard) group, and the viewer's own score - the only two
// panels every non-Solitaire/Spit preset ever has to place. Centered in
// the gap a 2-player ring's top/bottom seats leave open (seats measured
// at roughly y139-279 and y437-580 in the calibration surface above).
const SIMPLE_LAYOUT = {
  'table-zone': { x: 110, y: 290, w: 650, h: 160 },
  score: { x: 780, y: 290, w: 180, h: 160 },
};

export const PRESETS = [
  {
    name: 'War',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 26,
    layout: SIMPLE_LAYOUT,
  },
  {
    name: 'Gin Rummy',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 10,
    // D53 follow-up: a real discard pile, declared - not the generic
    // shared Table zone standing in for one (which is all this preset
    // had before Sprint 22's Pile/Zone framework existed to do better).
    // `zoneId: 'table-zone'` (D55, direct user request - "layout is
    // declarative now"): the discard pile joins the Table Zone
    // explicitly, by declaration - not by `ui.js` or `state.js`
    // inferring it from `kind: 'discard'`. Matches this preset's own
    // captured `layout` blob below, which has no separate 'discard'
    // entry because it was captured with the discard grouped in.
    piles: [{ kind: 'discard', ownerId: null, count: 1, zoneId: 'table-zone' }],
    // Direct user request: captured from an actual arranged table
    // (devtools -> `recard:panel-layout:v1`) rather than calibrated
    // like the other presets' below - kept verbatim, including several
    // entries (random `zone-*` ids, `hand:*`/`player-*` keyed to that
    // session's own connection ids) that can never match a fresh game's
    // ids and are simply inert here, same as they'd be in any browser's
    // own accumulated local storage.
    layout: {
      'zone-1787670038402-0.9010174863170234': { w: 30.483140821752396, h: 17.99974719913367, x: 980.12158203125, y: 156.0330047607422 },
      table: { w: 940.9288024902344, h: 350.4601287841797, x: 120.3515625, y: 454.2404556274414 },
      'zone-1787663760489-0.09149022111065175': { w: 36.33726852858775, h: 17.545108227736648, x: 51.28277651473354, y: 11.72023012693309 },
      'zone-1787670038402-0.2629345589587625': { w: 487.968796, h: 127.671886, x: 61.080688, y: 167.617218 },
      'zone-1787614397561-0.5513049884546531': { x: 47.42170000318735, y: 25.587802773915048 },
      'zone-1787614371244-0.5730961717906486': { w: 17.320217382901074, h: 7.673292614934287 },
      'zone-1787614371244-0.5141461779167045': { x: 40.305122386871695, y: 63.50230059805833, w: 52.263806179055486, h: 38.220969491322386 },
      'zone-1787672543726-0.8023572234786502': { x: 314.335968, y: 843.402809, w: 619.175354, h: 399.166687 },
      deck: { x: 45.4296875, y: 482.03125762939453, w: 263.9757385253906, h: 201.55816650390625 },
      'zone-1787672554751-0.3855307837355365': { x: 402.0573425292969, y: 178.07294464111328 },
      'zone-1787672543726-0.8160163792174508': { x: 41.332427978515625, y: 279.5529556274414, w: 272.5347137451172, h: 182.4349365234375 },
      score: { x: 146.210968, y: 945.876747, w: 160, h: 119.683228 },
      'hand:pk-1787672554750-dz30ba1hyo': { x: 647.8255615234375, y: 53.32465362548828 },
      'hand:RLBX7D': { x: 335.5295104980469, y: 1008.6545791625977, w: 268.1466979980469, h: 217.96876525878906 },
      'table-zone': { x: 213.415802, y: 387.660622, w: 993.463623, h: 387.087738 },
      'player-RLBX7D': { x: 136.7664794921875, y: 853.9930801391602, w: 583.6762084960938, h: 383.2855529785156 },
      'player-pk-1787672554750-dz30ba1hyo': { x: 243.007843, y: 51.918404, w: 696.558228, h: 286.896683 },
      'player-pk-1787691970079-p54pp88bbve': { x: 470.2691345214844, y: 61.076393127441406 },
      'player-ESGSR3': { x: 407.5911560058594, y: 932.0920791625977 },
    },
  },
  {
    name: 'Hearts',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 13,
    layout: SIMPLE_LAYOUT,
  },
  {
    name: 'Poker — 5 Card Draw',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 5,
    layout: SIMPLE_LAYOUT,
  },
  {
    name: "Texas Hold'em",
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 2,
    layout: SIMPLE_LAYOUT,
  },
  {
    name: 'Pinochle',
    type: 'pinochle',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 12,
    layout: SIMPLE_LAYOUT,
  },
  {
    name: 'Solitaire',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 0,
    piles: [
      { kind: 'foundation', ownerId: null, count: 4 },
      { kind: 'cascade', ownerId: null, count: 7 },
    ],
    // Solitaire is solo by nature (`cardsPerPlayer: 0` - the table IS
    // the starting layout, US-56/57's own AC), so there is no seat ring
    // sharing the surface to dodge - the whole thing is free for a
    // foundations-row-above-cascades-row grid, matching a real
    // Klondike-style spread.
    layout: {
      ...row(['foundation-1', 'foundation-2', 'foundation-3', 'foundation-4'],
        { x: 100, y: 70, w: 160, h: 140, gap: 20 }),
      ...row(['cascade-1', 'cascade-2', 'cascade-3', 'cascade-4', 'cascade-5', 'cascade-6', 'cascade-7'],
        { x: 60, y: 250, w: 140, h: 240, gap: 10 }),
      'table-zone': { x: 60, y: 520, w: 300, h: 220 },
      score: { x: 900, y: 520, w: 160, h: 120 },
    },
  },
  {
    name: 'Spit',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 0,
    piles: [
      { kind: 'rankAdjacent', ownerId: null, count: 2 },
      { kind: 'cascade', ownerId: 'perPlayer', count: 1 },
    ],
    // The 2 shared rankAdjacent piles sit dead center (Spit's own real-
    // time "pile" the whole game revolves around) - each player's own
    // stock (`cascade-1-<ownerId>`) can't be declared here (D53's
    // per-player ids aren't known ahead of a real join), so it's left to
    // the same seated-ring placement every personal zone already gets.
    layout: {
      ...row(['rankAdjacent-1', 'rankAdjacent-2'], { x: 380, y: 260, w: 150, h: 220, gap: 30 }),
      'table-zone': { x: 60, y: 60, w: 280, h: 150 },
      score: { x: 900, y: 60, w: 160, h: 120 },
    },
  },
];
