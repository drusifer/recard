import { deckLists } from './decks/rtgDeck.js';
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
 * Gin Rummy briefly declared a real `discard`-kind `piles` entry (a D53
 * follow-up); removed again per direct user request - the game doesn't
 * use a discard pile, so nothing should auto-create one. It falls back
 * to the generic shared Table zone, same as War/Hearts.
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
/**
 * A player's own chip stack (direct user request: "chips in the poker").
 *
 * `perPlayer`, not one shared bank: in real poker every player has their
 * own stack, and a single shared pile makes "whose chips are these"
 * unanswerable the moment two people take from it. `perPlayer` also
 * means it lands at each player's own seat through the same placement
 * every personal pile already gets - no layout entry needed, unlike a
 * shared pile.
 *
 * No declared `spread`: stacking is `ChipPile.defaultSpread` now, a
 * property of the KIND rather than something every chip preset has to
 * remember to repeat.
 *
 * Shared by both poker presets rather than written twice - they differ
 * in how many cards are dealt, not in what chips a player sits down
 * with.
 */
const POKER_CHIPS = [
  { kind: 'chip', ownerId: 'perPlayer', count: 1, name: 'Chips', deckType: 'chips', deckList: 'poker-stack' },
];

const SIMPLE_LAYOUT = {
  // *nit (direct user request): "give the deck panel more room for when
  // the deck gets big". A full deck's stack draws five depth layers
  // below its top card, and the Table Zone's own height left the deck
  // panel only ~12px clear of the bottom - fine at 50 cards, crowded the
  // moment a preset deals fewer or a deck grows. The extra height is
  // headroom for the panel, not for more piles.
  'table-zone': { x: 110, y: 290, w: 650, h: 190 },
  score: { x: 780, y: 290, w: 180, h: 190 },
};


/**
 * All fifteen Recard the Gathering decks that sit on the table (US-83).
 * Derived from the compiled catalog rather than hand-listed, so adding a
 * deck to `content/rtg/decks/` puts it on the table automatically
 * instead of silently going missing. `rtg-mono-white` (Dawnbreak Legion)
 * used to be excluded here and special-cased as the always-present
 * default Deck pile instead - direct user request removed that default
 * entirely ("no more unconditional presets, everything must be in the
 * preset config"), so it's now just the fifteenth peer in this same
 * list, no different from the other fourteen.
 */
// Direct user request: "all piles must be in a zone, and all zones and
// piles must have a name" - the fifteen table decks below each declare
// this same `zoneId` (rather than defaulting to a standalone Zone per
// deck, one per pile, D55's usual fallback), so they render together as
// one titled "Decks" Zone instead of fifteen separately-headed ones.
const RTG_DECKS_ZONE_ID = 'rtg-decks';

const RTG_TABLE_DECKS = deckLists()
  .map((deck) => ({ kind: 'deck', ownerId: null, count: 1, deckList: deck.id, name: deck.name, id: deck.id, zoneId: RTG_DECKS_ZONE_ID }));

/**
 * Filters a preset's declared `piles` down to only the CHOSEN deck
 * choices (US-110, direct user request: "add deck selection to the
 * start menu if the game yaml has multiple decks... we don't need all
 * the decks in every game"). Pure and DOM-free, same reasoning as every
 * other host-form-adjacent helper (`identity.js`'s session memory,
 * `panelLayout.js`) - the host form itself just reads checked
 * checkboxes and calls this.
 *
 * A pile that ISN'T one of the preset's own declared `deckChoices`
 * (battlefield/discard/exile/stack/tokens, for RtG) passes through
 * UNCONDITIONALLY - only a pile whose id names an actual deck choice is
 * gated by the chosen set. `chosenIds: null` means "no selection was
 * made" (either the preset offers no choices at all, or the host form
 * hasn't rendered one yet) and returns every declared pile unchanged -
 * the same "no behavior change until a preset actually uses this"
 * shape every additive `GameConfig` field in this file already follows.
 *
 * @param {{piles?: object[], deckChoices?: {id: string, name: string}[]}} preset
 * @param {string[]|null} chosenIds
 * @returns {object[]}
 */
export function filterDeckChoicePiles(preset, chosenIds) {
  if (!chosenIds || !preset.deckChoices?.length) return preset.piles ?? [];
  const choiceIds = new Set(preset.deckChoices.map((d) => d.id));
  return (preset.piles ?? []).filter((p) => !choiceIds.has(p.id) || chosenIds.includes(p.id));
}

export const PRESETS = [
  {
    name: 'War',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 26,
    tableZone: true,
    layout: SIMPLE_LAYOUT,
  },
  {
    name: 'Gin Rummy',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 10,
    tableZone: true,
    // *nit (direct user request): no discard pile - this game doesn't
    // use one. The generic shared Table zone covers whatever ad hoc
    // table-side play this preset needs, same as War/Hearts below.
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
      'zone-1787614371244-0.5141461779167045': { w: 52.263806179055486, h: 38.220969491322386, x: 40.305122386871695, y: 63.50230059805833 },
      'zone-1787672543726-0.8023572234786502': { w: 619.175354, h: 399.166687, x: 314.335968, y: 843.402809 },
      deck: { w: 263.9757385253906, h: 201.55816650390625, x: 45.4296875, y: 482.03125762939453 },
      'zone-1787672554751-0.3855307837355365': { x: 402.0573425292969, y: 178.07294464111328 },
      'zone-1787672543726-0.8160163792174508': { w: 272.5347137451172, h: 182.4349365234375, x: 41.332427978515625, y: 279.5529556274414 },
      score: { w: 160, h: 119.6832275390625, x: 194.6953125, y: 427.171875 },
      'hand:pk-1787672554750-dz30ba1hyo': { x: 647.8255615234375, y: 53.32465362548828 },
      'hand:RLBX7D': { w: 268.1466979980469, h: 217.96876525878906, x: 335.5295104980469, y: 1008.6545791625977 },
      'table-zone': { w: 929.875, h: 164.89453125, x: 88.19921875, y: 186.6796875 },
      'player-RLBX7D': { w: 583.6762084960938, h: 383.2855529785156, x: 136.7664794921875, y: 853.9930801391602 },
      'player-pk-1787672554750-dz30ba1hyo': { w: 696.558228, h: 286.896683, x: 243.007843, y: 51.918404 },
      'player-pk-1787691970079-p54pp88bbve': { x: 470.2691345214844, y: 61.076393127441406 },
      'player-ESGSR3': { x: 407.5911560058594, y: 932.0920791625977 },
      'player-pk-1787769037434-ya2k37s60i': { x: 336.6796875, y: -17.44140625 },
      'player-WUX6BS': { x: 322.94921875, y: 353.49609375 },
      'score-pk-1787769037434-ya2k37s60i': { x: 708.546875, y: 7.921875 },
      'player-pk-1787792998068-ba0xc1cksnn': { x: 222.1171875, y: 19.390625 },
      'player-VKWECT': { x: 367.60546875, y: 317.05859375 },
      'score-pk-1787792998068-ba0xc1cksnn': { w: 160, h: 90.98828125 },
      'player-N7D39S': { x: 380.1015625, y: 360.1015625 },
      'score-pk-1787797411912-a9cuh3ytdcu': { x: 585.62109375, y: 8.54296875 },
      'player-pk-1787797411912-a9cuh3ytdcu': { x: 350.16796875, y: 9.4921875 },
    },
  },
  {
    name: 'Hearts',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 13,
    tableZone: true,
    layout: SIMPLE_LAYOUT,
  },
  {
    name: 'Poker — 5 Card Draw',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 5,
    tableZone: true,
    piles: POKER_CHIPS,
    layout: SIMPLE_LAYOUT,
  },
  {
    name: "Texas Hold'em",
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 2,
    tableZone: true,
    piles: POKER_CHIPS,
    layout: SIMPLE_LAYOUT,
  },
  {
    name: 'Pinochle',
    type: 'pinochle',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 12,
    tableZone: true,
    layout: SIMPLE_LAYOUT,
  },
  // Sprint pileObjects (US-105): the demonstration that a Pileable which
  // is not a card reaches a real table. A pile pre-stocked through the
  // SAME `deckType`/`deckList` path a deck uses (D81), so `state.js` is
  // untouched by this feature entirely.
  //
  // Deliberately plain: chips here have no denomination and no pot,
  // because the user was asked and ruled that out of scope. This preset
  // is a table with chips ON it, not a betting game - naming it after a
  // real poker variant would promise rules that do not exist.
  {
    name: 'Chips & Tokens',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 5,
    tableZone: true,
    piles: [
      // Named and stacked per Smith's `*user test` findings: unnamed,
      // both supplies read as "Pile" with no way to tell them apart;
      // unstacked, 40 chips spanned the table and read as a layout
      // fault rather than a feature.
      { kind: 'chip', ownerId: null, count: 1, name: 'Chips', deckType: 'chips', deckList: 'standard-chips' },
      // US-112: was `kind: 'plain'` with an explicit `spread: 0.75`
      // override, same reasoning/fix as RtG's own token supply - see
      // that entry's comment.
      { kind: 'token', ownerId: null, count: 1, name: 'Tokens', deckType: 'chips', deckList: 'standard-tokens' },
    ],
  },
  {
    name: 'Solitaire',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 0,
    tableZone: true,
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
    tableZone: true,
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
  {
    // Recard the Gathering (US-83, D81). The capability-exercise preset:
    // a fictitious Magic-like game that pushes the Pile/Zone/Deck/Action
    // model into new territory without the table simulation changing.
    //
    // TABLE SIMULATOR, NOT A RULES ENGINE (the sprint's framing call):
    // the engine models zones, tapping (`rotate`), life (`ScoreZone`)
    // and card movement. Players enforce mana costs, the stack, combat
    // and timing - exactly as the Solitaire preset is "not a full
    // solitaire engine".
    //
    // No default Deck/Table pile (`tableZone: false`, direct user
    // request - "no more unconditional presets, everything must be in
    // the preset config") and no auto-dealt opening hand
    // (`cardsPerPlayer: 0`) to go with it: a player picks a deck from
    // the "Decks" Zone below and draws their own opening hand from it,
    // same as drawing any other card. Life totals start at 20 by
    // convention; the Score panel's own +/-1/+/-10 controls (which
    // already exist) are what track them, so no new mechanism is needed.
    name: 'Recard the Gathering',
    type: 'rtg',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 0,
    tableZone: false,
    zones: [{ id: RTG_DECKS_ZONE_ID, name: 'Decks' }],
    // US-110 (direct user request): "we don't need all the decks in
    // every game" - the host form offers a checkbox per catalog deck
    // and `filterDeckChoicePiles` keeps only the chosen ones at table
    // creation. Matched against `piles` below by id (every
    // `RTG_TABLE_DECKS` entry's own id IS its deck id, `configuredZoneId`'s
    // declared-id path). `colors`/`signatureCard` (direct follow-up
    // request: "use an image from one of the powerful cards in each
    // deck and show the deck colors") pass straight through from
    // `deckLists()` unchanged - the picker's own business, not
    // re-derived here.
    deckChoices: deckLists().map((deck) => ({ id: deck.id, name: deck.name, colors: deck.colors, signatureCard: deck.signatureCard })),
    piles: [
      // Fifteen decks, pre-stocked and face-down on the table, so
      // players can pick a deck by drawing from it.
      ...RTG_TABLE_DECKS,
      // The standard MTG zones each player owns. `hand` already exists
      // for every player; library is the shared deck piles above.
      { kind: 'battlefield', ownerId: 'perPlayer', count: 1 },
      { kind: 'discard', ownerId: 'perPlayer', count: 1 },
      { kind: 'exile', ownerId: 'perPlayer', count: 1 },
      // One shared stack - spells wait here to resolve, LIFO.
      { kind: 'stack', ownerId: null, count: 1 },
      // Direct user request: "tokens in rtg". SHARED, unlike poker's
      // per-player chips - an MTG token isn't owned in advance, it's
      // created onto the battlefield by whoever needs one, so a common
      // supply matches how they're actually used. `standard-tokens`
      // (+1/-1/!) was modelled on this vocabulary in the first place.
      // US-112: was `kind: 'plain'` (a token supply rendered as one
      // overlapping row, like a hand of cards, with its own explicit
      // `spread: 0.75` override to compensate) - `TokenPile`'s own
      // `defaultSpread` (0.963, matching `ChipPile`'s tight stack) makes
      // that override unnecessary, so it's dropped rather than left to
      // fight the new kind's better default.
      { kind: 'token', ownerId: null, count: 1, id: 'rtg-tokens', name: 'Tokens', deckType: 'chips', deckList: 'standard-tokens' },
    ],
    // NOTE (flagged, not solved): fifteen deck piles plus two players'
    // zones is a LOT of panels - Smith raised exactly this as Gate-1
    // condition C3. Grouping all fifteen table decks into one "Decks"
    // Zone (below) collapses that into a single panel; still worth a
    // real UX pass on the table as a whole.
    //
    // *nit (direct user request, "fix panel and deck sizing for the
    // larger rtg cards"): the Decks zone's box was captured back when
    // 15 deck-stack panels fit in 2 columns/376px tall - a face-down
    // RtG deck also renders its `.card-rtg` back at RtG's wider card
    // size (D76), which grows every deck panel wide enough that only 2
    // fit per row, needing ~1055px of real content height the box never
    // grew to hold. `overflow-y: auto` (`wirePanelLayout`) hid the
    // symptom as a scrollbar rather than visible clipping, but SCORES'
    // own captured position (`x:590`) sat WELL INSIDE the Decks zone's
    // own box either way - a real, visible overlap, confirmed by
    // measuring both elements' live bounding rects, not by eyeballing a
    // screenshot. Re-measured empirically (grew the zone step by step
    // in a live browser until `scrollHeight === clientHeight`): 1400px
    // wide fits 4 panels per row without adding a useless 5th column
    // (going wider never reduced the row count further), and 570px
    // tall is exactly enough for the resulting 4 rows. SCORES/STACK/
    // TOKENS moved to a column starting at x:1460, clear of the wider
    // Decks zone. No `table-zone` entry - `tableZone: false` above
    // means nothing ever renders there.
    layout: {
      score: { x: 1460, y: 16, w: 250, h: 120 },
      [RTG_DECKS_ZONE_ID]: { x: 30, y: 16, w: 1400, h: 570 },
      stack: { x: 1460, y: 156, w: 250, h: 130 },
      // Placed explicitly rather than left to land wherever: Smith's
      // Gate-1 condition C3 on the RtG sprint was that this is already
      // the most crowded table the app builds. Sits under the stack,
      // in the same right-hand column, clear of the Decks zone.
      'rtg-tokens': { x: 1460, y: 306, w: 250, h: 120 },
    },
  },
];
