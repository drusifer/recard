import { deckLists } from './decks/rtgDeck.js';
import { TABLE_CANVAS_SIZE } from './tableZoom.js';
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
  //
  // *fix (direct user request, 2026-09-17): `y` moved 290 -> 480 -
  // `lint:design`'s "Table Zone overlaps zone Bob" finding, calibrated
  // against a 7-card test hand.
  //
  // *fix (direct user request, 2026-09-18): 480 -> 550, and
  // `TABLE_CANVAS_SIZE.height` 950 -> 1050 (`tableZoom.js`) - the
  // preset-sweep addition to `lint:design` (`tests/designLint.check.
  // mjs`) exercises each preset's OWN real `cardsPerPlayer`, not a
  // fixed 7, and Hearts' real 13-card hand measured 240.6 local units
  // tall (vs 7 cards' ~206) - tall enough to leave 480 only ~11px of
  // real clearance, not the margin it looked like at 7 cards. This is
  // the shared layout every SIMPLE_LAYOUT preset EXCEPT War uses (War's
  // own 26-card hand is a real outlier - see its own dedicated
  // `layout`/`tableCanvasSize` below, not squeezed in here). The
  // top-seat's own zone (`seating.js`'s `seatPosition`, personal-zone
  // radius 26) anchors at 24% of canvas height and grows DOWNWARD only
  // (`.seat-zone`'s `translate(-50%, 0%)`, never centered vertically) -
  // at 13 cards it spans roughly local y [252, 493]. `y: 550` clears
  // that with ~57px to spare, while still finishing (550+190=740) ~58px
  // before the bottom seat's own span starts (0.76*1050=798). Re-verify
  // with `npm run lint:design` before ever changing `TABLE_CANVAS_SIZE`,
  // this position, or the personal-zone radius independently of the
  // other two - they're one piece of geometry, not three.
  'table-zone': { x: 110, y: 550, w: 650, h: 190 },
  score: { x: 780, y: 550, w: 180, h: 190 },
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
    // *fix (direct user request, 2026-09-18): a real outlier among the
    // SIMPLE_LAYOUT presets - War deals HALF a deck to each player (26
    // cards), measured at 393.4 local units tall vs Hearts' worst-case
    // 240.6 at 13. Squeezing that into `SIMPLE_LAYOUT`'s shared 1050-
    // tall canvas would have meant either a cramped shared row or
    // widening the canvas for every OTHER preset that doesn't need it.
    // Its own canvas (1280x1300) and a lower table-zone/score row
    // (`y: 750`, clear of the top seat's ~705-unit-tall zone by ~45px
    // and the bottom seat's own span - starting at 0.76*1300=988 - by
    // ~48px) are calibrated for THIS preset's own real hand size.
    tableCanvasSize: { width: 1280, height: 1300 },
    layout: {
      'table-zone': { x: 110, y: 750, w: 650, h: 190 },
      score: { x: 780, y: 750, w: 180, h: 190 },
    },
  },
  {
    name: 'Gin Rummy',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 10,
    // D141 (US-124): Gin is two-handed - a third person at the table
    // watches. The only capacity limit in the app; every other preset
    // leaves it unset and seats everyone.
    playerLimit: 2,
    tableZone: true,
    // *nit (direct user request): no discard pile - this game doesn't
    // use one. The generic shared Table zone covers whatever ad hoc
    // table-side play this preset needs, same as War/Hearts below.
    //
    // *fix (direct user request, 2026-09-18: "neatly organized table
    // zones" for every preset): this used to be a raw DevTools capture
    // (`recard:panel-layout:v1`) from one real arranged table - kept
    // "verbatim" including a dozen entries keyed to that session's own
    // now-meaningless connection ids (`hand:pk-...`, `player-VKWECT`,
    // etc.) and even a stray `y: 1008`/`y: 932` well outside any
    // reasonable table height. None of that was ever organized, just
    // frozen - replaced with `SIMPLE_LAYOUT`, the same clean, verified-
    // overlap-free table-zone/score placement War/Hearts/Poker/Pinochle
    // already use (this game needs nothing beyond those two panels).
    //
    // *fix (direct user request, 2026-09-19: "make the zone a little
    // bigger"): SIMPLE_LAYOUT's rows, with the Table Zone 110 wider (and
    // Score shifted right to match) - a whole hand's discards, tightened
    // below, then fit beside the Deck on one row instead of wrapping out
    // of the zone's box. Gin is 2 players, so nothing sits beside it.
    layout: {
      'table-zone': { ...SIMPLE_LAYOUT['table-zone'], x: 60, w: 760 },
      score: { ...SIMPLE_LAYOUT.score, x: 840 },
    },
    // Direct user request (2026-09-19): discards pile up on the Table
    // pile all hand - laid side by side, a long hand's ~20 outgrew the
    // Table Zone and wrapped out of sight below it. Overlapped, each card
    // still shows its rank corner (`lint:design` fills it with 30, about
    // the most a hand can leave: the stock is 32, dead at 2).
    tableSpread: 0.7,
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
      // fault rather than a feature. Explicit `id`s (2026-09-18, direct
      // user request: "neatly organized table zones" for every preset)
      // so `layout` below can place them - this preset had NO layout at
      // all before, leaving both supplies to whatever `#zones`' default
      // flex-wrap happened to do alongside the Table Zone.
      { kind: 'chip', ownerId: null, count: 1, id: 'chips-supply', name: 'Chips', deckType: 'chips', deckList: 'standard-chips' },
      // US-112: was `kind: 'plain'` with an explicit `spread: 0.75`
      // override, same reasoning/fix as RtG's own token supply - see
      // that entry's comment.
      { kind: 'token', ownerId: null, count: 1, id: 'tokens-supply', name: 'Tokens', deckType: 'chips', deckList: 'standard-tokens' },
    ],
    // Same `table-zone`/`score` placement as `SIMPLE_LAYOUT` (verified
    // clear of the seat ring), with the two supplies filling the
    // remaining width to the right of Score - verified clear of both
    // the ring and each other by `lint:design`'s per-preset sweep
    // (`tests/designLint.check.mjs`). `w: 176` on both supplies matches
    // `.pile-section`'s own `min-width: 11rem` (style.css) exactly - an
    // earlier `w: 145` here was silently widened to 176 by that floor
    // at render time, eating the gap meant to keep them apart and
    // overlapping by ~10px. A wider `TABLE_CANVAS_SIZE.width` (1450,
    // not the shared 1280 default) is what makes room for both at
    // their real rendered width beside Score without crowding it.
    tableCanvasSize: { width: 1450, height: TABLE_CANVAS_SIZE.height },
    layout: {
      'table-zone': SIMPLE_LAYOUT['table-zone'],
      score: SIMPLE_LAYOUT.score,
      'chips-supply': { x: 980, y: 550, w: 176, h: 190 },
      'tokens-supply': { x: 1176, y: 550, w: 176, h: 190 },
    },
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
    // Solitaire is solo BY DESIGN (`cardsPerPlayer: 0` - the table IS
    // the starting layout, US-56/57's own AC) - but nothing actually
    // PREVENTS a second player joining this preset's table today, and
    // their own (empty) hand still claims a seat-ring position like
    // any other player's. Accepted, not solved (same category as
    // Recard the Gathering's own known exception below): a real fix is
    // disallowing extra players on a solo preset, a GameConfig
    // capability this project doesn't have. `KNOWN_EXCEPTIONS` in
    // `tests/designLint.check.mjs`'s preset sweep names both.
    //
    // *fix (direct user request, 2026-09-18: "reasonable zoom level ...
    // for all the presets"): this layout's own footprint is well short
    // of the shared default `TABLE_CANVAS_SIZE` (1280x1050, sized for a
    // 2-seat ring this solo preset doesn't design around) - fit-zooming
    // a smaller footprint into the default canvas would leave it
    // looking tiny with a lot of dead margin. A tighter, preset-
    // specific canvas (D134) reads at a more reasonable size.
    //
    // *fix (same date): every column below widened to `w: 176` -
    // `.pile-section`'s own `min-width: 11rem` (style.css) silently
    // widened the old `w: 140`/`160` columns at render time, eating
    // into gaps meant to keep adjacent cascades apart and causing a
    // real, live overlap `lint:design`'s new preset sweep caught
    // (Cascade 1 overlapping Cascade 2, and so on down the row).
    // `tableCanvasSize.width` grown to fit the now-wider row.
    tableCanvasSize: { width: 1450, height: 800 },
    layout: {
      ...row(['foundation-1', 'foundation-2', 'foundation-3', 'foundation-4'],
        { x: 100, y: 70, w: 176, h: 140, gap: 20 }),
      ...row(['cascade-1', 'cascade-2', 'cascade-3', 'cascade-4', 'cascade-5', 'cascade-6', 'cascade-7'],
        { x: 60, y: 250, w: 176, h: 240, gap: 14 }),
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
    //
    // *fix (direct user request, 2026-09-18): the old `y: 60` row sat
    // only 18 local units clear of the top seat's own zone - real
    // card-count variance could tip that into an overlap `lint:design`
    // wouldn't catch until it actually happened live. Moved onto the
    // SAME verified-safe row `SIMPLE_LAYOUT` uses (`y: 550`, clear of
    // both seats' zones by a real margin), laid out side by side
    // instead of stacked so nothing needs the vertical room this row
    // doesn't have. `w: 176` on every column (was 150/160) matches
    // `.pile-section`'s own `min-width: 11rem` (style.css) - the
    // narrower declared widths were silently widened to 176 at render
    // time, closing the gaps meant to keep RankAdjacent 1/2 apart and
    // causing a real overlap `lint:design`'s preset sweep caught.
    layout: {
      'table-zone': { x: 60, y: 550, w: 300, h: 190 },
      'rankAdjacent-1': { x: 400, y: 550, w: 176, h: 190 },
      'rankAdjacent-2': { x: 596, y: 550, w: 176, h: 190 },
      score: { x: 900, y: 550, w: 176, h: 190 },
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
    // *fix (direct user report): "rtg deck pile's cards too small and
    // don't match the top card" - an MTG card needs more room than a
    // pip card, but a fixed `.card-rtg`-only override left every OTHER
    // card-sized element (the deck stack's depth layers, its outer box)
    // still reading the standard `--card-w`/`--card-h`, so they drifted
    // out of sync with the real card. Direct user correction: don't
    // special-case RtG - this is a GAME parameter (every card at THIS
    // table is the same size) that reconfigures the shared `--card-w`/
    // `--card-h` tokens themselves (`ui.js`'s `applyCardSize`, wired
    // through `gameConfig.cardSize` in `main.js`), so every existing
    // `--card-w`/`--card-h`-based rule picks it up automatically. A
    // preset that omits `cardSize` (every one but this) leaves the
    // stylesheet's own default in place.
    cardSize: { w: '4.4rem', h: '6.1rem' },
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
      // Direct user request: "organize my lands by color, each color
      // stacked vertically, overlapped so it's easy to count/tap/untap"
      // - a real MTG battlefield has no such split, but this app's own
      // `battlefield` pile is already just "wherever a player drops
      // permanents", not a rules-enforced zone, so a second, purely
      // organizational pile for lands specifically costs nothing rule-
      // wise. Players move lands here themselves (fully permissive
      // drag-and-drop, same as everywhere else) - nothing routes a cast
      // land here automatically.
      { kind: 'lands', ownerId: 'perPlayer', count: 1 },
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
    // *fix attempt (direct user request, 2026-09-18: "reasonable zoom
    // level and neatly organized table zones" for every preset) - tried
    // and explicitly abandoned rather than forced: fitting the Decks
    // zone's already-hard-won 1400x570 footprint into the SAME safe
    // seat-ring band every other preset uses (`y: 480`, ~240 local
    // units tall) is not achievable without either shrinking the deck
    // grid to the point it's cramped again, or growing the canvas past
    // where `TABLE_ZOOM_MIN` (0.4) can still fit it in a real viewport.
    // A per-player RtG zone (hand + battlefield + lands + discard +
    // exile, 5 piles) is also real content this project has never
    // measured against the ring, unlike every other preset here. Rather
    // than guess at numbers to chase a check this table's OWN density
    // makes structurally hard, `tableCanvasSize` below is just widened
    // (not squeezed into a "safe band") to give the existing layout
    // real breathing room, and the residual seat-ring risk is accepted
    // as the SAME known limitation Smith already flagged - a genuine
    // UX redesign (tabs, a dedicated screen, fewer overview piles), not
    // a coordinate tweak. `panelLayout.js`'s Save Layout is the
    // intended per-table workaround per direct user instruction this
    // session: "the players can organize and save their [own] presets."
    tableCanvasSize: { width: 1850, height: 950 },
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
