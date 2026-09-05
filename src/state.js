import { buildDeck, shuffle, RANKS, SUITS } from './deck.js';
import { PILE_TYPES, revivePile, pileInstanceFor } from './piles/pileTypes.js';
import { MIN_SPREAD, MAX_SPREAD } from './piles/Pile.js';
import { survivorsOfReset } from './pileables/pileableTypes.js';
import { breakInto, COLOUR_FOR_VALUE } from './pileables/ChipPileable.js';
import { batchToken } from './decks/batchToken.js';

// US-113 (direct user request: "rtg hand sorting should be by color and
// card type not suite and rank") - SORT_PILE's two RtG-specific keys.
// WUBRG is Magic's own canonical colour order; the type order puts
// Creatures first (the biggest category, and what a player scans for
// first) and Land last (never something you're choosing BETWEEN, just
// the thing at the end of the hand).
const RTG_COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'];
const RTG_TYPE_ORDER = ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Land'];

const DEFAULT_PILE_ID = 'table';
// Exported (only this one, of the three) - `RESET`'s own contract:
// whenever a preset has a table zone at all, `RESET` always rebuilds
// the preset's starting deck at this well-known id. D114: no longer
// needed by `reshuffleDeal` (that now targets whichever pile was
// clicked), but still the id a fresh `DEAL`/`startGame()` targets after
// a real restart, and what `main.js`'s deck-panel lookup reads.
export const DECK_PILE_ID = 'deck';
const TABLE_ZONE_ID = 'table-zone';

/** A player's Zone id - shared by their hand pile and any personal
 * declared pile (Spit's per-player stock, D53), one Zone per owner. */
function playerZoneId(playerId) {
  return `player-${playerId}`;
}

/**
 * D55: **Zone and Pile are different types, and Zone is a real entity**
 * (direct user request - "we need an entity for zone - so zones can
 * have names and types in the config"). A Pile is cards + behavior
 * (`kind`, `ownerId`, `cards`); a Zone is a named, typed place on the
 * table a Pile renders inside (`<zone-panel>`'s box, D54) - a Zone can
 * hold more than one Pile (the Table Zone holds Deck+Table+Discard).
 * `state.zones` is the real, independent registry of Zone records
 * (`{id, name, ownerId, type}`); every table-side pile's own `zoneId`
 * field names which Zone record it belongs to.
 *
 * `type` (`'shared'` | `'perPlayer'`) is a Zone's own DERIVED TYPE,
 * dispatched through `src/zones/zoneTypes.js`'s `ZONE_TYPES` registry -
 * the same one-module-per-type pattern `PILE_TYPES` already uses for
 * Piles (D42), instead of `ui.js` branching on whether `ownerId`
 * happens to be set. A shared Zone is declared config (`GameConfig`'s
 * own `zones` list, below); a perPlayer Zone is an intrinsic fact of
 * this app (every joined player gets one, always) created at `JOIN`,
 * never preset-declared - its concrete id/owner can't exist before a
 * real player does.
 *
 * D90 (direct user request: "the shape is Table->Zone->Pile->Card, KISS,
 * simplify... I don't want any kind of thing that conflates zones and
 * piles"): `PLAY`/`MOVE` used to carry an `action.zoneId`/
 * `toZoneId`, and a since-removed `findZoneAndCard` returned a `zoneId`
 * too - all three actually meant "which PILE" despite the name, the
 * exact collision this comment used to warn readers about. Renamed to
 * `action.pileId`/`toPileId` and `findPileAndCard`'s `pileId` - the word
 * "zone" in this file now only ever means the real Zone entity.
 *
 * **Every declared pile's `zoneId` is validated, not just accepted**
 * (`buildPiles`, below): referencing a Zone id that isn't in the
 * registry (the seeded Table Zone, plus whatever `GameConfig.zones`
 * itself declares) throws at table-creation time, a real config error,
 * not a silently-ignored typo. A pile declaration with no `zoneId` at
 * all needs no matching Zone declared ahead of time - it gets a fresh,
 * unambiguous Zone of its own, auto-registered, since "this pile, and
 * only this pile" isn't something a config author could get wrong.
 */
const TABLE_ZONE_RECORD = { id: TABLE_ZONE_ID, name: 'Table Zone', ownerId: null, type: 'shared' };

/** Adds a Zone record if `id` isn't already registered - idempotent, so
 * every pile-creation call site can call it unconditionally. */
function ensureZoneRecord(zones, id, name = null, ownerId = null, type = 'shared') {
  if (zones.some((z) => z.id === id)) return zones;
  return [...zones, { id, name, ownerId, type }];
}

/**
 * D73 follow-up (direct user request, "fix separate code paths for
 * make zone... there can be only 1"): `CREATE_ZONE` and `MOVE_PILE`'s
 * own "drop on open table space" ungroup case were two independent
 * `ensureZoneRecord` calls for the exact same real operation - "spawn
 * a fresh, standalone Zone for this pile, with the default name a
 * user-created Zone gets" - that had drifted apart (one passed
 * `'Zone'`, the other passed nothing, which is how `MOVE_PILE`'s own
 * ungrouped zones ended up with a blank heading, D73). One function
 * now, one default, both call sites route through it.
 */
function makeStandaloneZone(zones, pileId) {
  return ensureZoneRecord(zones, pileId, 'Zone');
}

/**
 * D23: **everything that holds cards is a Pile.** The draw stock, each
 * player's hand, the table, discards, sets/runs, and Split's new piles
 * are all the same shape — `{id, kind, name, ownerId, cards}` — instead
 * of the three separately-shaped top-level slices (`deck`/`hands`/
 * `zones`) this module used through v1.4.
 *
 * `kind` is the Pile *type*; the visibility *behavior* is derived from
 * it (below) rather than stored separately, so a pile can never claim a
 * type whose rules it doesn't actually follow:
 *
 * | kind    | who sees the cards            | matches the user's wording |
 * |---------|-------------------------------|----------------------------|
 * | 'deck'  | nobody (count only)           | the draw stock             |
 * | 'hand'  | only `ownerId` (count to all) | "In Hand"                  |
 * | 'plain' | per-card `{owner, faceUp}`    | "Open" / "Mixed"           |
 *
 * A `'plain'` pile (D90 - was `'zone'`, renamed to stop conflating a Pile
 * kind with the Zone entity) is the general case: each card carries its
 * own D7 `{owner, faceUp}`, so a plain pile is "open" when every card is
 * face-up and "mixed" when they differ — one mechanism covers both,
 * exactly as it has since D7, rather than needing a separate pile type
 * per case.
 *
 * D42 (Sprint 13/US-47): the table above and `redactMiddleCard` used to
 * live here as their own private table/function. They're now
 * `src/piles/*.js`'s `visibility`/`redactCard` - this module reads
 * through `PILE_TYPES[pile.kind]` instead of keeping a second,
 * parallel copy of the same rule.
 */

/**
The visibility rule a pile follows, derived from its type (D23/D42).
*/
export function pileVisibility(pile) {
  return PILE_TYPES[pile.kind]?.visibility;
}

function makePile(kind, { id, name, ownerId = null, cards = [], zoneId = null }) {
  // `makePile` itself knows NOTHING about which Zone anything defaults
  // into beyond two universal facts: an owned pile joins its owner's
  // Zone (ownership, not layout), and an undeclared pile is standalone
  // (its own id). Every other Zone assignment - the deck and default
  // Table's Table Zone membership included - is the CALLER's explicit
  // `zoneId` argument, declared at the one place each pile is actually
  // constructed (`createInitialState`, `buildPiles`) - no base-case
  // lookup table lives in this shared primitive.
  const resolvedZoneId = zoneId ?? (ownerId ? playerZoneId(ownerId) : id);
  return { id, kind, name, ownerId, cards, zoneId: resolvedZoneId };
}

/** Shared by every caller that needs a fresh, collision-free pile id
 * (`makeTableSidePile` below, `ensureHandPile`'s D87 fallback). */
function randomPileId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `pile-${Date.now()}-${Math.random()}`;
}

/**
 * D17 (generalized by D23, D45): shared pile-construction for
 * `CREATE_ZONE` and `JOIN`'s per-player configured zones (Spit's
 * per-player stock, etc). `kind` defaults to `'plain'` for `CREATE_ZONE`'s
 * own default; every other caller passes an explicit one.
 */
function makeTableSidePile(kind, name, ownerId = null, id = null, zoneId = null) {
  const resolvedId = id ?? randomPileId();
  return makePile(kind, { id: resolvedId, name, ownerId, zoneId });
}

function makeDeckPile(deckConfig, rng, zoneId) {
  // D114 (US-106): every card is stamped with the id of the deck pile it
  // was built into, so RESHUFFLE_DEAL can return a card to its origin
  // rather than whichever deck's button was clicked. Cards only - a
  // deck-kind pile could in principle build chips/tokens (`buildDeck`'s
  // own `pileableType` default), and those never take part in a reshuffle.
  const cards = shuffle(buildDeck(deckConfig), rng)
    .map((card) => (card.pileableType === 'card' ? { ...card, originPileId: DECK_PILE_ID } : card));
  return makePile('deck', { id: DECK_PILE_ID, name: 'Deck', cards, zoneId });
}

/**
 * D53 (Sprint 22): `GameConfig.piles` (renamed from `zones` - D55, that
 * name now belongs to the real Zone-entity list) declares a starting
 * table layout (e.g. Solitaire's 4 foundations + 7 cascades) so a
 * preset can build it automatically instead of the host manually
 * clicking Add Zone N times. Only the SHARED (`ownerId: null`) entries
 * build here - a `'perPlayer'` entry's count isn't knowable until a
 * player actually exists, so those build at JOIN instead (below), on
 * first join only.
 */
/** "discard", 1 -> "Discard"; "cascade", 3 of 7 -> "Cascade 3" - only
 * numbered when there's more than one, so Gin Rummy's single discard
 * pile doesn't read as "Discard 1". */
function capitalizeKind(kind) {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/**
 * *nit (direct user request): "default pile name should be 'Pile' not
 * 'Zone'" - `kind: 'plain'` (D90 - was `'zone'`) is the generic/base
 * Pile kind, but "Zone" is already this app's own word for the
 * CONTAINING entity (D55's Zone/Pile split) - naming the pile itself
 * "Zone" collided with that, which is exactly why the kind string
 * itself got renamed too. Every other kind still just capitalizes
 * (Discard, Foundation, ...).
 */
function defaultNameWord(kind) {
  return kind === 'plain' ? 'Pile' : capitalizeKind(kind);
}

function configuredZoneName(kind, index, count) {
  const word = defaultNameWord(kind);
  return count > 1 ? `${word} ${index + 1}` : word;
}

/**
 * D71 (US-74, Smith Gate 1): does `name` still look like a kind's own
 * D70 default (`configuredZoneName`'s output, numbered or not)? Used
 * by `CHANGE_PILE_TYPE` to decide whether to auto-rename on
 * conversion - a manually-chosen name never matches this and is left
 * alone.
 */
function isDefaultPileName(name, kind) {
  const word = defaultNameWord(kind);
  return name === word || new RegExp(String.raw`^${word} \d+$`).test(name);
}

/** D71: the unnumbered default for a kind, used to rename a pile on
 * conversion (Gate 1) - deliberately simpler than `configuredZoneName`,
 * which chases exact same-kind-count deduplication for a NEW pile; a
 * post-conversion rename just needs a correct-enough label (Nielsen #1),
 * not perfect numbering. */
function defaultKindName(kind) {
  return defaultNameWord(kind);
}

/** UX follow-up (direct user request - *nit "adjust the presets for
 * the new layout settings"): a configured (preset-declared) zone's id
 * is deterministic now - `kind` alone when there's only one (mirrors
 * `configuredZoneName`'s own un-numbered case), else `kind-N`, plus the
 * owning player's id for a `perPlayer` zone (needed for uniqueness -
 * every player gets their own pile of the same kind/index). Panel
 * position/size is a local, per-browser preference now
 * (`panelLayout.js`), keyed by pile id - `makeTableSidePile`'s own
 * random `crypto.randomUUID()` meant a player's arranged Solitaire
 * table (11 zones) reset to the default layout on every new game, even
 * of the exact same preset. A plain CREATE_ZONE-added zone still gets a
 * random id: it has no preset-declared "shape" to be stable ACROSS games
 * in the first place. */
function configuredZoneId(kind, index, count, ownerId = null) {
  const base = count > 1 ? `${kind}-${index + 1}` : kind;
  return ownerId ? `${base}-${ownerId}` : base;
}

/**
 * D55: a declared pile's starting `zoneId` is its OWN entry's `zoneId`
 * field when present (e.g. Gin Rummy's discard declares `zoneId:
 * 'table-zone'`) - and that id MUST already be a registered Zone
 * (`zoneRegistry`, the Table Zone plus whatever `GameConfig.zones`
 * itself declares) or this throws - never guessed from `kind`, never
 * silently accepted if it doesn't match anything real. No `zoneId`
 * declared means standalone: a fresh Zone of the pile's own, registered
 * here since a 1:1 "this exact pile, alone" relationship needs no
 * separate declaration to be unambiguous.
 */
/**
 * The parts of a declared pile that aren't its identity: its starting
 * contents (D81), and its `spread` (Smith's T102.2 finding - a chip
 * supply laid flat spans the table, so a declaration may say it stacks,
 * reusing D106 rather than adding a second layout mechanism).
 *
 * Extracted so the SHARED path (`buildPiles`) and the PER-PLAYER path
 * (`JOIN`) apply the same rules. They didn't: D81's pre-stocking only
 * ever ran in `buildPiles`, and the JOIN path destructured a declaration
 * down to `{kind, count}`, silently dropping `deckList`, `name` and
 * `spread`. A per-player chip stack was therefore always empty and
 * always called "Alice's Pile" - found by driving the real app, since
 * every reducer test passed. One helper is what makes "declared piles
 * behave the same wherever they're built" true rather than intended.
 *
 * Both fields stay absent when not declared, so every pile that predates
 * them is untouched.
 */
function applyDeclaration(pile, declaration, rng) {
  // The KIND arranges its own stock (`Pile.stock`): a deck keeps its
  // shuffle, a chip tray sorts by denomination. Shuffling first and
  // letting the kind rearrange keeps one path - the alternative was a
  // `kind === 'chip'` branch here, which is exactly what the pile
  // hierarchy exists to avoid.
  const stocked = declaration.deckList
    ? {
      ...pile,
      // D114 (US-106): same origin stamp as `makeDeckPile`, so a
      // multi-deck preset (RtG's fifteen) can tell which of its own
      // declared piles each card belongs to at reshuffle time.
      cards: (PILE_TYPES[pile.kind] ?? PILE_TYPES.plain)
        .stock(shuffle(buildDeck({ type: declaration.deckType ?? 'rtg', deckList: declaration.deckList }), rng)
          .map((card) => (card.pileableType === 'card' ? { ...card, originPileId: pile.id } : card))),
    }
    : pile;
  return declaration.spread === undefined ? stocked : { ...stocked, spread: declaration.spread };
}

/**
 * Every `GameConfig.piles` declaration with a real card `deckList`
 * (i.e. NOT a chip/token supply), keyed by the exact id its built pile
 * lands at - the same `declaredId ?? configuredZoneId(...)` derivation
 * `buildPiles` itself uses, so a lookup by a live pile's `id` finds the
 * declaration that built it. Used by `RESET` (US-109) to tell "a
 * starting deck that needs rebuilding" apart from "an ordinary declared
 * pile that just needs its cards survivor-filtered."
 */
function declaredCardDeckDeclarations(pileDeclarations) {
  const byId = new Map();
  for (const declaration of pileDeclarations) {
    if (declaration.ownerId === 'perPlayer' || !declaration.deckList) continue;
    if ((declaration.deckType ?? 'rtg') === 'chips') continue;
    const count = declaration.count ?? 1;
    for (let index = 0; index < count; index++) {
      byId.set(declaration.id ?? configuredZoneId(declaration.kind, index, count), declaration);
    }
  }
  return byId;
}

function buildPiles(pileDeclarations, zoneRegistry, rng = Math.random) {
  const piles = [];
  let zones = zoneRegistry;
  for (const declaration of pileDeclarations) {
    const { kind, ownerId, count = 1, zoneId: declaredZoneId, name: declaredName, id: declaredId } = declaration;
    if (ownerId === 'perPlayer') continue;
    for (let index = 0; index < count; index++) {
      // D81 (US-83): a declaration MAY name its own pile id. Ids are
      // otherwise derived from `kind`, which silently collides the
      // moment a preset declares several piles of the SAME kind as
      // separate entries - fifteen `deck` piles would all have become
      // one id. Additive: no declared id means the derived one, exactly
      // as before.
      const id = declaredId ?? configuredZoneId(kind, index, count);
      if (declaredZoneId && zones.every((z) => z.id !== declaredZoneId)) {
        throw new Error(`GameConfig.piles: "${id}" declares zoneId "${declaredZoneId}", but no such Zone is declared in GameConfig.zones`);
      }
      const zoneId = declaredZoneId ?? id;
      const name = declaredName ?? configuredZoneName(kind, index, count);
      const pile = makeTableSidePile(kind, name, null, id, zoneId);
      // D81 (US-83): a declared pile MAY be pre-stocked with a built
      // deck. Until now every declared pile started empty, which is
      // right for a Solitaire foundation but useless for "all fifteen
      // decks on the table" - a deck pile with no cards in it is just a
      // label. Additive: a declaration without `deckList` behaves
      // exactly as before.
      piles.push(applyDeclaration(pile, declaration, rng));
      zones = ensureZoneRecord(zones, zoneId);
    }
  }
  return { piles, zones };
}

/**
 * Host-authoritative game state. This is the single source of truth per
 * ARCHITECTURE.md D3 — only the host runs `reduce`; other clients send
 * action requests and render from the state/view messages the host sends
 * back.
 * @param {{numDecks?: number, jokers?: number}} deckConfig
 * @param {() => number} [rng]
 * @param {{allowsPlayerZones?: boolean, zones?: object[]}} [gameConfig]
 *   D46: GameConfig's first real field - a third, separate param rather
 *   than nesting `deckConfig` inside it, so every existing call site
 *   (main.js, every test) stays valid unchanged. `allowsPlayerZones`
 *   defaults `true`, matching every prior sprint's behavior exactly
 *   (CREATE_ZONE was always available before this gate existed). D53:
 *   `zones` defaults `[]`, same "additive, zero behavior change until a
 *   preset actually sets it" shape.
 */
export function createInitialState(deckConfig = {}, rng = Math.random, gameConfig = {}) {
  const pileDeclarations = gameConfig.piles ?? [];
  const zoneDeclarations = gameConfig.zones ?? [];

  // D55: the real Zone registry - the always-present Table Zone, plus
  // whatever Zone entities this game's own `GameConfig.zones` declares
  // (`{id, name, type}`). Every pile declaration's own `zoneId` (below)
  // is validated against exactly this list - nothing implicit.
  let zoneRegistry = ensureZoneRecord([], TABLE_ZONE_RECORD.id, TABLE_ZONE_RECORD.name, TABLE_ZONE_RECORD.ownerId, TABLE_ZONE_RECORD.type);
  for (const z of zoneDeclarations) zoneRegistry = ensureZoneRecord(zoneRegistry, z.id, z.name ?? null, null, z.type ?? 'shared');

  const built = buildPiles(pileDeclarations, zoneRegistry, rng);

  // Direct user request: "no more unconditional presets, everything
  // must be in the preset config" - the shared Deck pile and generic
  // Table drop-pile used to be created for every game no matter what a
  // preset declared. `tableZone` (default true - every preset before
  // this one relies on both existing, so they all now declare it
  // explicitly rather than getting it silently) makes that a real,
  // declared choice; RTG (`presets.js`) is the first preset to opt out
  // - its own "Decks" Zone (`gameConfig.zones`) replaces both.
  const hasTableZone = gameConfig.tableZone ?? true;

  return {
    deckConfig,
    gameConfig: {
      allowsPlayerZones: gameConfig.allowsPlayerZones ?? true,
      tableZone: hasTableZone,
      piles: pileDeclarations,
      zones: zoneDeclarations,
      // *fix (direct user report, "reshuffle and redeal... deals whole
      // deck"): the preset's hand size lives in the table's own config
      // now. It was only ever held in `main.js`'s `lastDealCount`,
      // seeded on the share screen - which a RESUMED table never shows,
      // so a restored game reshuffled with the FIRST preset's hand size
      // (War's 26, i.e. the whole deck between two players). Left
      // `undefined` when a preset does not set one rather than
      // defaulting, so nothing invents a hand size that was never chosen.
      cardsPerPlayer: gameConfig.cardsPerPlayer,
    },
    zones: built.zones,
    piles: [
      ...(hasTableZone ? [
        makeDeckPile(deckConfig, rng, TABLE_ZONE_ID),
        makePile('plain', { id: DEFAULT_PILE_ID, name: 'Table', zoneId: TABLE_ZONE_ID }),
      ] : []),
      ...built.piles,
    ],
    players: [],
    scores: {},
    // Set once, by the first JOIN (below) - the host always joins its own
    // table before a share code exists for anyone else to reach it (D3),
    // so "first player ever to join" and "the host" are the same fact.
    // *nit (direct user request, "remove the remaining invariants on drag
    // and drop - FULLY PERMISSIVE"): no reducer re-checks this any more
    // (SET_PILE_ORIENTATION's host-only gate was the last one) - kept as
    // a plain identity fact, not an authorization input.
    hostId: null,
  };
}

// --- Selectors (D23) -------------------------------------------------
// The reducer and its tests read piles through these rather than
// indexing `state.piles` by hand, so "which pile kind am I looking at"
// is stated once here instead of re-derived at every call site.

/**
 * The cards of the pile every preset that uses one creates at the
 * well-known starting id `DECK_PILE_ID` - a convenience reader for
 * that ONE common case (tests, the pre-deal roster preview's own card
 * count), never a claim that this is "the" deck the reducer treats
 * specially. D92 (direct user request, "THERE SHOULD BE NO CANONICAL
 * PILES"): `DRAW`/`DEAL`/`SHUFFLE_DECK` no longer call this - each
 * acts on whatever pile `action.pileId` names, same as every other
 * pile-targeted action. A deck is just a pile of cards; this id is a
 * preset's own starting layout choice, not a runtime assumption.
 */
export function deckOf(state) {
  // `?? []`: a preset that opts out of the default Deck pile (RTG's
  // own `zones`-only "Decks", `gameConfig.tableZone: false`) has no
  // pile at this id at all - an empty read, not a defensive guess.
  return state.piles.find((p) => p.id === DECK_PILE_ID)?.cards ?? [];
}

/**
One player's hand. Empty (not undefined) if they have no hand pile yet.
*/
export function handOf(state, playerId) {
  return state.piles.find((p) => p.kind === 'hand' && p.ownerId === playerId)?.cards ?? [];
}

/**
 * Every hand, keyed by player id — only for players who actually have a
 * hand pile, so this stays `{}` before any deal and again after `RESET`,
 * matching the pre-D23 `state.hands` semantics exactly.
 */
export function handsOf(state) {
  return Object.fromEntries(
    state.piles.filter((p) => p.kind === 'hand').map((p) => [p.ownerId, p.cards]),
  );
}

/** Every table-side pile (D45: plain AND discard, previously plain-only),
 * in creation order - "the piles a card can be played/moved onto." D90:
 * renamed from `pilesOf` - it has always returned Piles, never Zone
 * records, and the old name was itself an instance of the exact
 * Zone/Pile conflation this project no longer tolerates. */
export function pilesOf(state) {
  return state.piles.filter((p) => PILE_TYPES[p.kind]?.tableSide);
}

// --- Internal pile helpers -------------------------------------------

function replacePile(state, pileId, updater) {
  return { ...state, piles: state.piles.map((p) => (p.id === pileId ? updater(p) : p)) };
}

function withCards(pile, cards) {
  return { ...pile, cards };
}

function handPileId(playerId) {
  return `hand:${playerId}`;
}

/**
 * D86: the actual hand pile id for a player is no longer always the
 * canonical `handPileId(playerId)` string - `CHANGE_PILE_TYPE` can turn
 * an existing personal pile into a real `kind: 'hand'` pile, keeping its
 * OWN id (a converted pile never gets renamed to the `hand:<id>` string,
 * same "no id rewrite" precedent every other conversion follows). Every
 * write path that needs "the" hand pile for a player must resolve it by
 * `kind === 'hand' && ownerId === playerId` (matching `ensureHandPile`'s
 * own existence check) - falling back to the canonical id only when no
 * hand-kind pile exists yet (the pre-`ensureHandPile` case, or a caller
 * that hasn't ensured one). Looking it up by the raw string alone (the
 * old behavior) silently dropped cards into nothing once a converted
 * pile - with a non-canonical id - became "the" hand.
 */
function resolveHandPileId(piles, playerId) {
  return piles.find((p) => p.kind === 'hand' && p.ownerId === playerId)?.id ?? handPileId(playerId);
}

/**
 * *nit (direct user request): "a hand is just a regular pile... besides
 * that rendering difference it should behave exactly the same as all
 * other piles." A hand card now carries the SAME real per-card
 * `{owner, faceUp}` D7 every other pile's cards already do (previously
 * it carried neither - ownership was the PILE's own `ownerId`, a
 * hand-only special case) - `owner: playerId, faceUp: false` is what
 * makes the base `Pile.redactCard`/`pileableActions` (both now inherited by
 * `HandPile`, unmodified) produce the right answer with zero hand-
 * specific logic: the owner sees it (`card.owner === viewerId`),
 * nobody else does. Applied at every point a card ENTERS a hand
 * (DEAL/DRAW/PICKUP/TAKE_PILE/PICKUP_SPLIT) - previously those all
 * STRIPPED owner/faceUp/layout on the way in; now they SET owner/faceUp
 * instead (layout still strips - a hand has no adjacency rendering to
 * describe, same as before).
 */
function toHandCard(card, playerId) {
  const { layout: _layout, ...rest } = card;
  return { ...rest, owner: playerId, faceUp: false };
}

/** The inverse of `toHandCard` - strips every hand-only stamp
 * (`owner`/`faceUp`/`layout`) back to a plain deck card's shape
 * (`buildDeck`'s own `{id, rank, suit}`). Used by a fresh `DEAL` (D88)
 * to reclaim cards still sitting in a hand before re-dealing - a
 * re-deal must never destroy them, only redistribute them. */
function toDeckCard(card) {
  const { owner: _owner, faceUp: _faceUp, layout: _layout, ...rest } = card;
  return rest;
}

/**
 * Hand piles are created on demand (first deal/draw/pickup) and dropped
 * entirely by `RESET` — that's what keeps `handsOf()` empty before a
 * deal and after a reset, matching pre-D23 behavior.
 *
 * D87: `CHANGE_PILE_TYPE` can now convert a player's canonical hand pile
 * AWAY from `kind: 'hand'` while keeping its id (`hand:<playerId>`) -
 * the pile that used to BE their hand is still sitting at that id,
 * just looking like something else now. If this function still blindly
 * reused `handPileId(playerId)` for the fresh replacement hand, the
 * result would be two DIFFERENT pile objects sharing one id (the old,
 * converted one, and this new one) - every `piles.find`/`.map` keyed by
 * id would then silently corrupt one or both. Falling back to a fresh
 * `randomPileId()` whenever the canonical slot is already occupied by
 * ANYTHING (own kind irrelevant - the check above already proved it's
 * not a hand) keeps every pile id unique, always.
 */
function ensureHandPile(piles, playerId) {
  if (piles.some((p) => p.kind === 'hand' && p.ownerId === playerId)) return piles;
  const canonicalId = handPileId(playerId);
  const id = piles.some((p) => p.id === canonicalId) ? randomPileId() : canonicalId;
  return [...piles, makePile('hand', { id, name: 'Hand', ownerId: playerId })];
}

/**
 * D23: the one round-robin dealer behind `DEAL`/`DEAL_MORE`.
 *
 * *nit (direct user request): the old "exhaust the stock" mode
 * (`cardsPerDestination: null`, `options.atLeastOneEach`) existed only
 * for `SPLIT_DECK`'s round-robin split. `SPLIT_PILE`/`PICKUP_SPLIT`
 * (`splitPileAt`) replace that with a real `index` - a plain array
 * slice, not a round-robin deal - so that mode had no caller left;
 * removed rather than kept for a hypothetical future one.
 * @returns {{remaining: object[], dealt: object[][]}} `dealt[i]` is the
 *   cards for destination `i`, in deal order.
 */
function dealRoundRobin(deck, destinationCount, cardsPerDestination, describeShortfall) {
  const totalNeeded = cardsPerDestination * destinationCount;
  if (totalNeeded > deck.length) throw new Error(describeShortfall(deck.length));

  const remaining = [...deck];
  const dealt = Array.from({ length: destinationCount }, () => []);
  if (destinationCount === 0) return { remaining, dealt };

  for (let round = 0; round < cardsPerDestination && remaining.length > 0; round++) {
    for (let index = 0; index < destinationCount && remaining.length > 0; index++) {
      dealt[index].push(remaining.shift());
    }
  }
  return { remaining, dealt };
}

/**
 * *nit (direct user request): shared eligibility/geometry for
 * `SPLIT_PILE`/`PICKUP_SPLIT` - `index` is where the cut falls
 * (`cards[0..index)` stay, `cards[index..]` move), so both a real split
 * and "must be 2+ cards" fall out of the same bound check (`index` has
 * to leave at least one card on each side).
 *
 * *nit (direct user request, simplified): no more separate
 * `bulkRemovable` flag - "pileableActions are the more general case." Now
 * that `docs/ARCHITECTURE.md`'s "Core invariant" means every kind's
 * `pileableActions` is the real, generic single-card authorization (no kind
 * empties it out for its own reason any more - `DiscardPile`/`MeldPile`/
 * `ExilePile` all reuse the base `Pile` rule), reusing `canRemove`
 * for the cards being split OUT is correct again: it folds in per-card
 * VISIBILITY for free (`'move'`'s own predicate already requires
 * `!isHidden ||
 * !isOwned || isMine` - a split can't relocate a card you can't see).
 *
 * A deck's cards are still the one real exception: anonymous by
 * construction (`DeckPile.pileableActions` is always `[]` - "the deck has
 * never rendered a per-card hover row", its own comment) - open to
 * anyone, matching DRAW/DEAL/SHUFFLE_DECK's existing "no per-card owner
 * to check" model, not this per-card path.
 *
 * *nit (direct user request, "remove the remaining invariants on drag
 * and drop - FULLY PERMISSIVE"): the pile-level `ownerId` gate is gone -
 * a personal pile is no longer split-restricted to its own owner, same
 * as a single card in it (D83). `canRemove(...,'move')` is the only
 * eligibility check left, and it's structural (excludes `HandPile`), not
 * an authorization gate.
 */
function splitPileAt(pile, index, playerId) {
  if (pile.cards.length < 2) {
    throw new Error(`Cannot split pile ${pile.id}: only ${pile.cards.length} card(s)`);
  }
  if (!Number.isSafeInteger(index) || index < 1 || index >= pile.cards.length) {
    throw new Error(`Cannot split pile ${pile.id} at index ${index}: must be between 1 and ${pile.cards.length - 1}`);
  }
  if (pile.kind !== 'deck') {
    const instance = pileInstanceFor(pile, playerId);
    const moved = pile.cards.slice(index);
    if (moved.some((card) => !instance.canRemove(card, playerId, 'move'))) {
      throw new Error(`Player ${playerId} is not authorized to split pile ${pile.id}`);
    }
  }
  return { kept: pile.cards.slice(0, index), moved: pile.cards.slice(index) };
}

/**
The subset of an action describing where/how a dropped card lands (D21).
*/
function placementOf(action) {
  return { targetCardId: action.targetCardId, side: action.side, layout: action.layout };
}

/**
 * D12: card ids are globally unique (assigned once per physical card by
 * deck.js), so a card can be located across every pile without the
 * caller needing to know which one it's in. Deck and hand piles are
 * deliberately not searched — `FLIP`/`PICKUP`/`MOVE` have only
 * ever operated on table-side cards. D90: renamed from
 * `findZoneAndCard`/`{zoneId, card}` - it has only ever searched Piles
 * and returned a Pile's id, never a Zone's.
 */
function findPileAndCard(state, pileableId) {
  for (const pile of pilesOf(state)) {
    const card = pile.cards.find((c) => c.id === pileableId);
    if (card) return { pileId: pile.id, card };
  }
  return null;
}

/**
 * D43 (Sprint 14/Tranche 2 of D39): the shared shape behind
 * PICKUP/MOVE/DRAW (and PLAY, until D102 retired it) - remove one
 * card from a pile, run it through
 * pile-type dispatch on both ends, insert it into another. A new pile
 * type only has to implement `canRemove`/`removePileable`/`insertPileable`
 * (`src/piles/*.js`) to become a legal source or destination for these
 * four actions - this function, and therefore `state.js`, gains no new
 * `case` for it.
 *
 * Deliberately NOT used for FLIP (mutates a card in place, never
 * moves it - see the FLIP case, which reuses `canRemove`'s
 * read-the-offer-table pattern directly instead), SHUFFLE_DECK
 * (pile-level, no card actually changes pile), or DEAL/DEAL_MORE/
 * SPLIT_PILE/PICKUP_SPLIT (one source to one or many destinations, but
 * MANY cards in a single action - a bulk distribution, not a single-
 * card transfer; forcing any of these into this two-pile-one-card shape
 * was considered and rejected - see ARCHITECTURE.md D43).
 *
 * `action` is the action id `canRemove` authorizes against (e.g.
 * `'pickup'`) and appears in the error message on failure.
 */
function transferCard(state, { fromPileId, toPileId, pileableId, viewerId, action, placement, transform }) {
  const fromPile = state.piles.find((p) => p.id === fromPileId);
  if (!fromPile) throw new Error(`Pile ${fromPileId} does not exist`);
  const card = fromPile.cards.find((c) => c.id === pileableId);
  if (!card) throw new Error(`Card ${pileableId} is not in pile ${fromPileId}`);

  if (!pileInstanceFor(fromPile, viewerId).canRemove(card, viewerId, action)) {
    throw new Error(`Player ${viewerId} is not authorized to ${action} ${pileableId}`);
  }

  const toPile = state.piles.find((p) => p.id === toPileId);
  if (!toPile) throw new Error(`Pile ${toPileId} does not exist`);
  let movedCard = transform ? transform(card) : card;
  // *nit (real bug, found live): D83's "fully permissive drag and drop"
  // means a plain MOVE/CREATE_PILE can now target ANY hand as a
  // destination (`docs/ARCHITECTURE.md`'s Core invariant, `HandPile.
  // pileableActions` offering `'move'` to a non-owner) - neither action's
  // own `transform` knows anything about hands. Without this, a card
  // "stolen" via plain MOVE kept its OLD owner/faceUp, landing in
  // the new hand pile but redacted as if it still belonged to whoever
  // it was taken from - invisible even to the player who just took it.
  // Applying `toHandCard` here, once, generically, for ANY transfer
  // landing in a hand (whichever action drove it) is what actually
  // makes "a hand is just a regular pile" and "fully permissive drag-
  // and-drop" compose correctly together, instead of only working for
  // the handful of actions (DRAW/PICKUP) that happened to remember to
  // stamp it themselves.
  if (toPile.kind === 'hand') movedCard = toHandCard(movedCard, toPile.ownerId);
  // D102 (*nit, "get rid of the Play card action... that's old kruft"):
  // the exact mirror of the line above, and the reason the `play` verb
  // could be retired outright. A card LEAVING a hand for the table is
  // public, face-up - that was never a property of a verb, it's the
  // property of the transition, the same way hand-stamping is. It used
  // to live in PLAY's own `transform` (plus a duplicate of the same
  // branch in CREATE_PILE), which is why a hand needed its own private
  // action string at all: `'move'` couldn't carry it. Written here
  // once, generically, `MOVE` does everything PLAY did and the
  // verb has no remaining job.
  //
  // Ordering matters: hand -> hand (a reorder, or handing a card to
  // another player) takes the branch ABOVE and never reaches this one,
  // so a reordered hand card still never picks up owner/faceUp fields
  // it isn't supposed to carry. That was PLAY's `isReorder` special
  // case; here it falls out of the structure instead of being checked.
  else if (fromPile.kind === 'hand') movedCard = { ...movedCard, owner: null, faceUp: true };

  // D53: the destination pile gets a real say in whether it accepts the
  // card, not just whether it exists. Every pre-Sprint-22 kind accepts
  // unconditionally (zero behavior change) - `foundation`/`cascade`/
  // `rankAdjacent` are the first real callers.
  if (!revivePile(toPile).canAccept(movedCard)) {
    throw new Error(`Pile ${toPileId} cannot accept card ${pileableId}`);
  }

  // Two passes, remove-then-insert, exactly like the pre-D43 PLAY/
  // MOVE code did: this is what makes fromPileId === toPileId (a
  // same-zone reorder) work correctly without a special case - the
  // second pass inserts into the pile the first pass already removed
  // the card from.
  const withoutCard = state.piles.map((p) => (p.id === fromPileId ? revivePile(p).removePileable(pileableId) : p));
  const piles = withoutCard.map((p) => (p.id === toPileId ? revivePile(p).insertPileable(movedCard, placement) : p));
  return { ...state, piles };
}

// --- Action registry (D44) --------------------------------------------
// `reduce()` used to be one large `switch (action.type)`, exactly the
// shape D42/D43 just replaced for `pile.kind` - so it gets the same
// prescription. Unlike Pile types (a multi-method contract: visibility/
// resolveDropTarget/canAccept/pileableActions/canRemove/removePileable/
// insertPileable), an action
// type shares only ONE thing across every kind - "take state + this
// action, return new state" - so this is the plain Command pattern
// (one `apply(state, action)` per entry), not a second `src/piles/`-
// shaped module family. Kept as one object literal IN this file, not
// split into `src/actions/*.js`: every handler closes over this
// module's private helpers (`transferCard`, `findPileAndCard`,
// `ensureHandPile`, `dealRoundRobin`, `DECK_PILE_ID`, ...) - exporting
// all of them just to satisfy separate files would leak internals
// nothing else should touch, and importing them back INTO those files
// from `state.js` would be circular (this module would import the
// registry, which would import from this module). Real per-file
// extraction makes sense specifically if/when D38's GameConfig
// framework needs per-game PLUGGABLE actions - not before; this file
// already has the isolation that matters (unit-tested as a whole,
// same as before this change).
const ACTIONS = {
  JOIN(state, action) {
    // UX follow-up (direct user request): the D17 auto-created personal
    // zone is retired - a player's seat is their hand pile now (D42's
    // `handPile`, `tableSide: true` as of this same change), created
    // lazily by `ensureHandPile` on first deal/draw/pickup, not eagerly
    // here. "Has this player already joined before" (so a reconnect
    // doesn't re-trigger one-time setup) is now asked directly of the
    // roster instead of inferred from personal-zone existence.
    const alreadyJoined = state.players.some((p) => p.id === action.playerId);
    // D53: a GameConfig.piles entry (renamed from `zones` - D55, that
    // name now belongs to the real Zone-entity list) with `ownerId:
    // 'perPlayer'` (e.g. Spit's per-player stock) builds here, on first
    // join - its count isn't knowable any earlier than this, since it's
    // created once per actual player.
    const perPlayerPiles = alreadyJoined
      ? []
      : (state.gameConfig?.piles ?? [])
          .filter((z) => z.ownerId === 'perPlayer')
          .flatMap((declaration) => {
            const { kind, count = 1, name: declaredName } = declaration;
            return Array.from({ length: count }, (_, index) => {
              // A declared `name` sits INSIDE the possessive - "Alice's
              // Chips", not "Chips" - so a per-player pile still reads as
              // that player's, which is the whole reason the possessive
              // is here. Falling back to the derived name keeps every
              // existing perPlayer preset (Spit's stock) unchanged.
              const base = declaredName ?? configuredZoneName(kind, index, count);
              const pile = makeTableSidePile(
                kind, `${action.name}'s ${base}`, action.playerId,
                configuredZoneId(kind, index, count, action.playerId),
              );
              return applyDeclaration(pile, declaration, action.rng ?? Math.random);
            });
          });
    return {
      ...state,
      hostId: state.hostId ?? action.playerId,
      players: [
        ...state.players.filter((p) => p.id !== action.playerId),
        { id: action.playerId, name: action.name, connection: 'connected' },
      ],
      piles: alreadyJoined ? state.piles : [...state.piles, ...perPlayerPiles],
      // D55: every player gets a real Zone record for their own seat,
      // seeded at JOIN (before their hand pile even exists - `ensureHandPile`
      // still creates that lazily) so `zoneId: player-<id>` always
      // resolves to something real once the hand pile does show up.
      zones: alreadyJoined ? state.zones : ensureZoneRecord(state.zones, playerZoneId(action.playerId), null, action.playerId, 'perPlayer'),
      scores: { [action.playerId]: 0, ...state.scores },
    };
  },

  SET_CONNECTION(state, action) {
    return {
      ...state,
      players: state.players.map((p) =>
        p.id === action.playerId ? { ...p, connection: action.connection } : p,
      ),
    };
  },

  // D15: identical distribution, differing only in whether existing
  // hands are cleared first - one function, assigned to both keys
  // below, rather than two call paths that could drift apart.
  //
  // D88 (direct user request: "no cards can be created or destroyed
  // during play... there shouldn't be any situation where cards go
  // missing"): a fresh DEAL clears every hand before redistributing -
  // that part is unchanged, intentional D23 behavior (see the test
  // named for it). What was a real bug: the cards being cleared out of
  // hands were never returned anywhere, just dropped from `state`
  // entirely. Now every hand-kind pile about to be cleared (ANY of
  // them, including one with no matching player any more - reachable
  // since D87 let a pile become `kind: 'hand'` with `ownerId: null`)
  // has its cards reclaimed via `toDeckCard` and folded into the SAME
  // pool `dealRoundRobin` deals from, before the split - a re-deal
  // redistributes the whole game's cards, it never destroys any.
  /**
   * D92 (direct user request, "THERE SHOULD BE NO CANONICAL PILES"):
   * deals from whichever pile `action.pileId` names - no more
   * hardcoded `DECK_PILE_ID`. A deck is just a pile of cards; Deal is a
   * convenience shortcut for "distribute this pile's cards round-robin
   * to every player," not a mechanic bound to one blessed pile.
   *
   * Deliberately does NOT throw when no pile matches `action.pileId` -
   * `main.js`'s `startGame()` dispatches `DEAL` unconditionally on
   * every game start regardless of preset, and a preset that opts out
   * of the default Deck pile entirely (RTG, `gameConfig.tableZone:
   * false`, `cardsPerPlayer: 0`) genuinely has no pile to name - an
   * empty pool is the correct read there, not an error (same reasoning
   * `deckOf`'s own comment already gave this exact case). `DRAW`/
   * `SHUFFLE_DECK` above DO throw - those are only ever reachable by
   * clicking an actual existing pile's own button, so a missing pile
   * there is a real bug, not an expected preset shape.
   */
  DEAL(state, action) {
    const isFresh = action.type === 'DEAL';
    const players = state.players;
    const pile = state.piles.find((p) => p.id === action.pileId);
    const reclaimed = isFresh
      ? state.piles.filter((p) => p.kind === 'hand').flatMap((p) => p.cards.map((card) => toDeckCard(card)))
      : [];
    const { remaining, dealt } = dealRoundRobin(
      [...(pile?.cards ?? []), ...reclaimed],
      players.length,
      action.cardsPerPlayer,
      (left) =>
        `Cannot deal ${action.cardsPerPlayer} cards to ${players.length} players: only ${left} left`,
    );

    let piles = state.piles;
    for (const player of players) piles = ensureHandPile(piles, player.id);
    piles = piles.map((p) => {
      if (p.id === action.pileId) return withCards(p, remaining);
      if (p.kind !== 'hand') return p;
      const index = players.findIndex((pl) => pl.id === p.ownerId);
      if (index === -1) return isFresh ? withCards(p, []) : p;
      const newCards = dealt[index].map((card) => toHandCard(card, p.ownerId));
      return withCards(p, [...(isFresh ? [] : p.cards), ...newCards]);
    });
    return { ...state, piles };
  },

  // D45: `action.kind` lets a host create any table-side pile TYPE, not
  // only the plain/generic one - defaults to 'plain' (D90 - was 'zone')
  // so every pre-D45 caller (and every existing test) is unaffected. Validated against the
  // registry rather than trusted: a `kind` that doesn't exist, isn't
  // `tableSide`, or is `hand` (never player-creatable, see below), is
  // rejected rather than silently creating a broken pile no reducer path
  // can ever reach.
  //
  // D46: gated behind GameConfig.allowsPlayerZones - the ONLY place
  // that flag matters, since JOIN's per-player configured zones and
  // SPLIT_PILE/PICKUP_SPLIT's new piles both call `makeTableSidePile`
  // directly (never through this action), so a game that disallows
  // player-added zones still gets its default table, configured zones,
  // and split piles exactly as before.
  CREATE_ZONE(state, action) {
    // `?.` + `=== false`, not `!state.gameConfig.allowsPlayerZones`: a
    // snapshot saved before D46 existed (persistence.js) has no
    // `gameConfig` field at all on restore, and must default to
    // "allowed" (matching its own game's actual prior behavior)
    // rather than throwing on a missing field or silently flipping to
    // disallowed.
    if (state.gameConfig?.allowsPlayerZones === false) {
      throw new Error('This game does not allow players to add zones');
    }
    const kind = action.kind ?? 'plain';
    // UX follow-up (direct user request): `hand` is `tableSide` now too
    // (it renders at its owner's seat like any other table-side pile),
    // but it must still never be player-creatable via Add Zone - exactly
    // one hand pile per player, owned by `ensureHandPile`. That's its
    // own explicit rejection now, no longer piggybacked on `tableSide`.
    if (kind === 'hand' || !PILE_TYPES[kind]?.tableSide) {
      throw new Error(`Cannot create a zone of kind "${kind}"`);
    }
    // *nit (direct user request, "new Zones and Piles need default
    // names"): the "Add Zone" name field was hidden (US-54) - every
    // player-created zone now comes from the nameless drag-to-create
    // gesture. Reuses `configuredZoneName`'s existing "Kind"/"Kind N"
    // numbering (already proven for preset-declared piles), keyed off
    // how many piles of the same kind already exist on the table.
    // `DEFAULT_PILE_ID` (the built-in "Table" pile, `kind: 'plain'`) is
    // excluded - it's not part of the player-created numbering, it
    // already has its own fixed name.
    const sameKindCount = state.piles.filter((p) => p.kind === kind && p.id !== DEFAULT_PILE_ID).length;
    const name = action.name ?? configuredZoneName(kind, sameKindCount, sameKindCount + 1);
    const pile = makeTableSidePile(kind, name);
    return {
      ...state,
      piles: [...state.piles, pile],
      // D73 follow-up: shared with MOVE_PILE's own ungroup case via
      // `makeStandaloneZone` - one "spawn a fresh Zone" path, not two.
      zones: makeStandaloneZone(state.zones, pile.zoneId),
    };
  },

  /**
   * (bloop: piles/zones/cards are all Movable) - a card dropped on a
   * Zone's own empty space, not onto any existing pile inside it,
   * spawns a brand-new pile there. Deliberately its own action, not
   * `CREATE_ZONE` with an optional `zoneId` bolted on: `CREATE_ZONE`
   * always mints a NEW standalone Zone (`ensureZoneRecord`); this
   * always joins an EXISTING one (validated, never created) - the same
   * genuine Zone/Pile distinction D55 already drew, not two branches
   * of one action pretending to be the same operation.
   *
   * `pileableId`/`fromPileId` are optional (an empty pile can be spawned on
   * its own) but must come together - seeding the new pile with a
   * dropped card reuses `transferCard` (D43) so authorization/`canAccept`
   * both run through the exact same single path `MOVE` does,
   * atomically in one dispatch (no create-then-move race between the
   * host and a guest's own separate action).
   */
  CREATE_PILE(state, action) {
    if (state.zones.every((z) => z.id !== action.zoneId)) {
      throw new Error(`Zone ${action.zoneId} does not exist`);
    }
    const kind = action.kind ?? 'plain';
    if (kind === 'hand' || !PILE_TYPES[kind]?.tableSide) {
      throw new Error(`Cannot create a pile of kind "${kind}"`);
    }
    // *nit: same default-naming as CREATE_ZONE above.
    const sameKindCount = state.piles.filter((p) => p.kind === kind && p.id !== DEFAULT_PILE_ID).length;
    const name = action.name ?? configuredZoneName(kind, sameKindCount, sameKindCount + 1);
    const pile = makeTableSidePile(kind, name, null, null, action.zoneId);
    const withPile = { ...state, piles: [...state.piles, pile] };
    if (!action.pileableId) return withPile;

    // D102: this used to branch on `fromPile.kind === 'hand'` to pick
    // between the `'play'` and `'move'` verbs and to apply PLAY's
    // public transform - both jobs now belong to `transferCard`, which
    // applies the leaving-a-hand rule generically for every action.
    // One verb, no source-kind branch.
    if (state.piles.every((p) => p.id !== action.fromPileId)) {
      throw new Error(`Pile ${action.fromPileId} does not exist`);
    }
    return transferCard(withPile, {
      fromPileId: action.fromPileId,
      toPileId: pile.id,
      pileableId: action.pileableId,
      viewerId: action.playerId,
      action: 'move',
    });
  },

  /**
   * US-63 (Sprint 23, D55): reparent a pile into a different Zone -
   * `zoneId` is real, mutable data (see the comment above
   * `TABLE_ZONE_RECORD` for why it has to be), so this is the
   * whole implementation:
   * find the pile, validate it's an eligible kind, resolve the target
   * Zone, write the new `zoneId`. Dropping onto an existing Zone always
   * adds this pile as an additional sibling there - never a merge
   * (Smith's ruling, Sprint 23 Gate 1).
   */
  MOVE_PILE(state, action) {
    const pile = state.piles.find((p) => p.id === action.pileId);
    if (!pile) throw new Error(`Pile ${action.pileId} does not exist`);
    // *nit fix (2026-08-26): was a hardcoded `pile.kind !== 'zone' &&
    // pile.kind !== 'discard'` literal, duplicating exactly what each
    // Pile class's own `static reparentable` (D56) already declares -
    // that flag existed but was never actually wired to anything until
    // now - just read from one source of truth instead of two that
    // could drift apart.
    //
    // *nit (later, direct user request, D64): `deck` was originally
    // excluded here too (Sprint 23 Gate 1: "excluded even though
    // `tableSide` alone would allow it, since `state.js` finds THE
    // deck by fixed id elsewhere, not by searching zones"). Re-checked
    // that reasoning against the actual code before reversing it:
    // `deckOf`/`DEAL`/`DRAW`/`SHUFFLE_DECK`/`RESET` all find the deck
    // by `DECK_PILE_ID`, none of them read or assume its
    // `zoneId` - the original exclusion was overcautious, not load-
    // bearing. `DeckPile.reparentable` is `true` now (see its own
    // comment); `hand`/`foundation`/`cascade`/`rankAdjacent` remain
    // excluded for their own, still-valid reasons (per-player
    // invariant; real game-rule `canAccept` logic).
    if (!PILE_TYPES[pile.kind]?.reparentable) {
      throw new Error(`Cannot move a "${pile.kind}" pile between zones`);
    }

    // No target, or a falsy one: "ungroup" - a fresh, standalone Zone
    // of this pile's own, per Smith's Gate 2 note. Every table-side
    // pile belongs to exactly one Zone always; there is no null/no-zone
    // state to fall back to.
    let targetZoneId = action.targetZoneId;
    let zones = state.zones;
    if (targetZoneId) {
      if (zones.every((z) => z.id !== targetZoneId)) {
        throw new Error(`Zone ${targetZoneId} does not exist`);
      }
    } else {
      targetZoneId = pile.id;
      // D73 follow-up: shared with CREATE_ZONE via `makeStandaloneZone`
      // - one "spawn a fresh Zone" path, not two (this one had drifted
      // to pass no default name, leaving the ungrouped zone's heading
      // blank).
      zones = makeStandaloneZone(zones, targetZoneId);
    }

    return {
      ...state,
      zones,
      piles: state.piles.map((p) => (p.id === action.pileId ? { ...p, zoneId: targetZoneId } : p)),
    };
  },

  /**
   * (direct user request) - "all piles can be dropped into any other
   * pile... all the cards on the dropped pile [are] added to the target
   * pile and once empty the dropped pile is removed. The target pile
   * maintains its type." Fires for ANY pile dropped directly onto
   * another pile, regardless of zone (direct user correction: "remove
   * the weird zone distinction, KISS" - the earlier same-zone-reorder/
   * cross-zone-merge split is gone).
   *
   * A DIFFERENT drop target than `MOVE_PILE` above, not a variant of it:
   * dropping a pile onto a ZONE's own empty space still always makes it
   * a sibling there, never a merge (Smith's Gate 1 ruling, D55, unchanged)
   * - this only fires when a dragged pile is dropped directly ONTO
   * another PILE's own body.
   *
   * Deliberately a plain array concat, not a per-card `transferCard`
   * loop (an earlier version did that and had a real bug: looping
   * `insertPileable` one card at a time silently REVERSED the merged order
   * for any prepend-style target, `deck`/`discard`, since inserting
   * c1-then-c2-then-c3 at the front puts c3 on top - direct user
   * correction: "I prefer... the cards are added in the same order").
   * `[...target.cards, ...source.cards]` preserves the source's own
   * relative order unconditionally, appended after whatever the target
   * already had - one simple, uniform rule for every kind, no per-card
   * authorization/`canAccept` dance (that's the "semantically dragging
   * each card" framing's own complexity, traded away on purpose here
   * for KISS).
   *
   * Source `deck`/`hand`/the default Table pile are the one exemption,
   * matching `REMOVE_PILE`'s own exact set - not a new restriction
   * invented here, the same structural reasons those piles already can't
   * be removed (`deck` is found by fixed id elsewhere in this file, not
   * by searching; every player must always have exactly one `hand`; the
   * built-in Table pile is never player-removable). Merging INTO any of
   * them (as the TARGET) is unaffected - plain cards, no special case.
   */
  MERGE_PILE(state, action) {
    const { pileId, targetPileId } = action;
    if (pileId === targetPileId) throw new Error('Cannot merge a pile into itself');
    const sourcePile = state.piles.find((p) => p.id === pileId);
    if (!sourcePile) throw new Error(`Pile ${pileId} does not exist`);
    if (state.piles.every((p) => p.id !== targetPileId)) {
      throw new Error(`Pile ${targetPileId} does not exist`);
    }
    // *fix (direct user report): "remove block on moving hand piles". A
    // `hand` source used to throw here, so dropping a hand onto another
    // pile never ran the pile-level merge - which is the step that
    // removes the emptied source - and left a stranded empty hand behind.
    // A hand is recreated on demand (`ensureHandPile`) the moment its
    // owner draws or picks up, so removing it costs nothing.
    //
    // `deck` stays blocked: merging the deck away would leave a table
    // with nothing to draw from, which is a different question and was
    // not asked.
    if (sourcePile.kind === 'deck') {
      throw new Error(`Cannot merge a "${sourcePile.kind}" pile into another pile`);
    }
    if (sourcePile.id === DEFAULT_PILE_ID) {
      throw new Error('Cannot merge the default Table pile into another pile');
    }

    // The same hand rules every single-card transfer follows (D102),
    // applied here because `MERGE_PILE` concatenates raw cards rather
    // than going through `transferCard`: cards LEAVING a hand become
    // public and face-up, cards ARRIVING in one are restamped as that
    // player's. Without this the merged cards landed on the table still
    // owned and face-down, which reads as a bug even though every card
    // moved correctly.
    const targetPile = state.piles.find((p) => p.id === targetPileId);
    const moved = sourcePile.cards.map((card) => {
      if (targetPile.kind === 'hand') return toHandCard(card, targetPile.ownerId);
      if (sourcePile.kind === 'hand') return { ...card, owner: null, faceUp: true };
      return card;
    });

    // *nit (direct user correction): a merged-away pile is removed -
    // it existed because it held something - EXCEPT one that declares
    // `keepWhenEmptied`. A hand does: it is the player's seat, and the
    // next draw needs it to still be there.
    const keepSource = PILE_TYPES[sourcePile.kind]?.keepWhenEmptied ?? false;
    return {
      ...state,
      piles: state.piles
        .filter((p) => p.id !== pileId || keepSource)
        .map((p) => {
          if (p.id === targetPileId) return { ...p, cards: [...p.cards, ...moved] };
          if (p.id === pileId) return withCards(p, []);
          return p;
        }),
    };
  },

  /**
   * (direct user request) - "Panels can be moved from zone to zone
   * [MOVE_PILE, above] and relocated within their zone (ordering)."
   * `state.piles`' own array order IS render order within a zone
   * (`pilesOf`/`viewFor` both iterate it in place) - reordering is
   * genuinely just moving one entry to sit before another. Deliberately
   * NOT gated by `reparentable` the way `MOVE_PILE` is: staying inside
   * the SAME zone is purely cosmetic arrangement, never a game-rule
   * concern, for any pile kind - open to any player, same reasoning
   * `RENAME_PILE`/`RENAME_ZONE` already established for "this is a
   * label/arrangement, not a privacy or turn-order boundary."
   * Cross-zone is deliberately rejected here, not silently redirected
   * to `MOVE_PILE` - two different operations, two different eligibility
   * rules, kept as two real actions rather than one that guesses intent.
   */
  REORDER_PILE(state, action) {
    const pile = state.piles.find((p) => p.id === action.pileId);
    if (!pile) throw new Error(`Pile ${action.pileId} does not exist`);
    const before = state.piles.find((p) => p.id === action.beforePileId);
    if (!before) throw new Error(`Pile ${action.beforePileId} does not exist`);
    if (pile.zoneId !== before.zoneId) {
      throw new Error('REORDER_PILE only reorders within the same Zone - use MOVE_PILE to change zones');
    }
    if (pile.id === before.id) return state;

    const withoutPile = state.piles.filter((p) => p.id !== pile.id);
    const index = withoutPile.findIndex((p) => p.id === before.id);
    return { ...state, piles: [...withoutPile.slice(0, index), pile, ...withoutPile.slice(index)] };
  },

  /**
   * *nit (direct user request): "a new kind of pile action that accepts
   * an index... Split(index): creates a second pile (same pile type)
   * after the current one in the same zone and moves cards after the
   * split into the new pile (replaces old split semantics - now for all
   * pile types)." Replaces the old "roughly in half, zone/discard only"
   * `SPLIT_PILE` AND the deck-specific `SPLIT_DECK` (round-robin into N
   * piles) with one action, one rule, for every kind - a deck is just
   * another pile now, so it needed no special case to include, only for
   * the old code's own special case (SPLIT_DECK) to go away.
   *
   * Eligibility is not a hardcoded kind allowlist - it's `splitPileAt`
   * reusing `canRemove(pile, card, playerId, 'move')`, the exact
   * predicate single-card drag-and-drop already uses (D43: write-side
   * re-checks, doesn't just trust the offer layer) - "pileableActions are
   * the more general case" (direct user request). No kind excludes
   * itself from this any more: a hand used to, incidentally, because
   * its owner's cards spelled the capability `'play'` rather than
   * `'move'` - D102 retired that verb, so a hand is as eligible as
   * anything else at the reducer level (the offer layer,
   * `HandPile.pileActions`, is what still doesn't show Split on a
   * hand). A Foundation is NOT excluded either, per
   * `docs/ARCHITECTURE.md`'s "Core invariant".
   */
  SPLIT_PILE(state, action) {
    const pile = state.piles.find((p) => p.id === action.pileId);
    if (!pile) throw new Error(`Pile ${action.pileId} does not exist`);
    const { kept, moved } = splitPileAt(pile, action.index, action.playerId);
    const newPile = withCards(
      makeTableSidePile(pile.kind, `${pile.name} 2`, pile.ownerId, null, pile.zoneId),
      moved,
    );
    return {
      ...state,
      piles: [...state.piles.map((p) => (p.id === action.pileId ? withCards(p, kept) : p)), newPile],
    };
  },

  /**
   * *nit (direct user request): "Pickup(index): Shortcut for split(index)
   * & move to (or create and populate) player handpile." Reuses the same
   * `splitPileAt` eligibility `SPLIT_PILE` does - never creates the
   * transient split pile at all, draining the split-off cards straight
   * into the acting player's hand instead (same `toHandCard` stamping
   * `TAKE_PILE`/`PICKUP`/`DRAW`/`DEAL` all apply on the way into a hand).
   */
  PICKUP_SPLIT(state, action) {
    const pile = state.piles.find((p) => p.id === action.pileId);
    if (!pile) throw new Error(`Pile ${action.pileId} does not exist`);
    const { kept, moved } = splitPileAt(pile, action.index, action.playerId);
    const handCards = moved.map((card) => toHandCard(card, action.playerId));
    const withHand = ensureHandPile(state.piles, action.playerId);
    const targetHandId = resolveHandPileId(withHand, action.playerId);
    const piles = withHand.map((p) => {
      if (p.id === action.pileId) return withCards(p, kept);
      if (p.id === targetHandId) return withCards(p, [...p.cards, ...handCards]);
      return p;
    });
    return { ...state, piles };
  },

  /**
   * US-61 (Sprint 23): takes an entire pile into the acting player's
   * hand at once. Only `zone`/`discard` - its own hardcoded eligibility,
   * predating (and narrower than) `SPLIT_PILE`/`PICKUP_SPLIT`'s later
   * `pileableActions`-derived one above; never generalized alongside it
   * since the user's own Split/Pickup request didn't ask for Take to
   * widen.
   *
   * Deliberately NOT built on `transferCard` (the single-card MOVE/
   * PICKUP machinery): even now that `DiscardPile` offers full per-card
   * access ("discard pile is just a deck", direct user request,
   * reversing D45's original "drop-only" rule), a bulk take is still a
   * genuinely different operation from N single-card picks - one action,
   * one authorization check, not N.
   *
   * *nit (direct user request, "remove the remaining invariants on drag
   * and drop - FULLY PERMISSIVE"): the `zone`/`discard`-only kind
   * allowlist, the pile-level `ownerId` gate, and the "no hidden card"
   * visibility gate are all gone - a take now works on ANY pile kind
   * (deck, hand included), for ANY player, regardless of what's face-down
   * inside it. Same philosophy as D83/D84's per-card move/redaction
   * removal, applied to this bulk operation.
   */
  TAKE_PILE(state, action) {
    const pile = state.piles.find((p) => p.id === action.pileId);
    if (!pile) throw new Error(`Pile ${action.pileId} does not exist`);

    // Same `toHandCard` stamping PICKUP/DRAW/DEAL already apply on the
    // way into a hand (`owner`/`faceUp` set to the taking player's own,
    // `layout` stripped).
    const handCards = pile.cards.map((card) => toHandCard(card, action.playerId));
    const withHand = ensureHandPile(state.piles, action.playerId);
    const targetHandId = resolveHandPileId(withHand, action.playerId);
    const piles = withHand.map((p) => {
      if (p.id === action.pileId) return withCards(p, []);
      if (p.id === targetHandId) return withCards(p, [...p.cards, ...handCards]);
      return p;
    });
    return { ...state, piles };
  },

  /**
   * US-62 (Sprint 23): flips every card in a pile face-up or face-down
   * uniformly (`hide`/`show`, mutually exclusive per the pile's current
   * orientation - `zonePile`/`discardPile`'s own `pileActions`). Only
   * `zone`/`discard`, same eligibility as `SPLIT_PILE`/`TAKE_PILE` above.
   *
   * *nit (direct user request, "remove the remaining invariants on drag
   * and drop - FULLY PERMISSIVE"): the owner-only/host-only authorization
   * gate is gone - ANY player can flip ANY pile's orientation now, same
   * "shared content, open to anyone" philosophy `SPLIT_PILE`/`TAKE_PILE`
   * already use. `state.hostId` is no longer read by this reducer.
   */
  SET_PILE_ORIENTATION(state, action) {
    const pile = state.piles.find((p) => p.id === action.pileId);
    if (!pile) throw new Error(`Pile ${action.pileId} does not exist`);
    if (pile.kind !== 'plain' && pile.kind !== 'discard') {
      throw new Error(`Cannot set orientation of a "${pile.kind}" pile`);
    }

    return {
      ...state,
      piles: state.piles.map((p) => (p.id === action.pileId
        ? withCards(p, p.cards.map((c) => ({ ...c, faceUp: action.faceUp })))
        : p)),
    };
  },

  /**
   * *nit (direct user request): "pile actions for tighten/loosen to
   * adjust the overlap on fan and meld piles or runs or whatever."
   *
   * ONE action taking a signed `delta`, not a `TIGHTEN` and a `LOOSEN`
   * - the same "there can be only 1" correction D75 made and D103
   * followed, and the same shape `ADJUST_SCORE` already uses for its
   * +/- steps. The two are one operation in opposite directions.
   *
   * Replicated state, not a local view preference: everyone at the
   * table is looking at the same cards, so they must see the same
   * spread. It is presentation, though - the cards themselves are
   * untouched, and `spread` is written on the pile record exactly like
   * `zoneId`/`layout` are.
   *
   * The starting point is the pile TYPE's own `defaultSpread` (a hand
   * fans, a flat pile doesn't) rather than one global number, so the
   * first adjustment moves from what the player is actually looking at.
   * Clamped here rather than in the UI: the reducer is the authority,
   * and a directly-dispatched action from a guest gets the same limits.
   */
  ADJUST_PILE_SPREAD(state, action) {
    const pile = state.piles.find((p) => p.id === action.pileId);
    if (!pile) throw new Error(`Pile ${action.pileId} does not exist`);
    const kind = PILE_TYPES[pile.kind];
    const current = pile.spread ?? kind?.defaultSpread ?? MIN_SPREAD;
    // The ceiling is the pile TYPE's (*nit: chip stacks go tighter than
    // a card fan may, because a stack reads by its top chip).
    const ceiling = kind?.maxSpread ?? MAX_SPREAD;
    // Rounded to the step: floating-point addition of 0.1 otherwise
    // drifts (0.65 + 0.1 + 0.1 = 0.8500000000000001), which would never
    // compare equal to MAX_SPREAD and so never disable the button.
    const next = Math.round(Math.min(ceiling, Math.max(MIN_SPREAD, current + action.delta)) * 1000) / 1000;
    return { ...state, piles: state.piles.map((p) => (p.id === action.pileId ? { ...p, spread: next } : p)) };
  },

  /**
   * D92 (direct user request, "THERE SHOULD BE NO CANONICAL PILES"):
   * shuffles whichever pile `action.pileId` names - no more hardcoded
   * `DECK_PILE_ID`. Reorders the pile and nothing else - the one thing
   * `RESET` can't do, since it also rebuilds the deck and wipes
   * hands/zones/pass markers. Everything else flows through untouched
   * via the spread, so there's no field to forget.
   */
  SHUFFLE_DECK(state, action) {
    if (state.piles.every((p) => p.id !== action.pileId)) {
      throw new Error(`Pile ${action.pileId} does not exist`);
    }
    const rng = action.rng ?? Math.random;
    return replacePile(state, action.pileId, (deck) => withCards(deck, shuffle(deck.cards, rng)));
  },

  /**
   * D114 (US-106, direct user correction): "reshuffle and re-deal" was
   * conflated with `RESET` (`dealFromDeck` dispatched `RESET` then
   * `DEAL`) - wiping zones/layout/scores/chips that a re-deal has no
   * business touching. This is the real, standalone operation: gather
   * every CARD whose `originPileId` matches `action.pileId` back from
   * wherever it currently sits (a hand, another zone, mid-table -
   * anywhere), no matter what pile that started in - shuffle just that
   * pool, and deal `action.cardsPerPlayer` round-robin. A card belonging
   * to a DIFFERENT origin deck (RtG's other fourteen) is never touched,
   * because it never matches `action.pileId`. Non-card Pileables (chips,
   * tokens) carry no `originPileId` and so never match either - a
   * reshuffle has never been about them.
   *
   * Transient per-card state (`faceUp`, `orientation`) is stripped on
   * the way back, same as `toDeckCard` already does for a fresh `DEAL` -
   * a card returning to the deck is not still turned face-up in memory.
   */
  RESHUFFLE_DEAL(state, action) {
    const pile = state.piles.find((p) => p.id === action.pileId);
    if (!pile) throw new Error(`Pile ${action.pileId} does not exist`);
    const rng = action.rng ?? Math.random;
    const gathered = [];
    const gatheredPiles = state.piles.map((p) => {
      const kept = [];
      for (const card of p.cards) {
        if (card.originPileId === action.pileId) {
          const { orientation: _orientation, ...deckCard } = toDeckCard(card);
          gathered.push(deckCard);
        } else {
          kept.push(card);
        }
      }
      return kept.length === p.cards.length ? p : withCards(p, kept);
    });

    const players = state.players;
    const { remaining, dealt } = dealRoundRobin(
      shuffle(gathered, rng),
      players.length,
      action.cardsPerPlayer ?? 0,
      (left) =>
        `Cannot deal ${action.cardsPerPlayer} cards to ${players.length} players: only ${left} left`,
    );

    let piles = gatheredPiles;
    for (const player of players) piles = ensureHandPile(piles, player.id);
    piles = piles.map((p) => {
      if (p.id === action.pileId) return withCards(p, remaining);
      if (p.kind !== 'hand') return p;
      const index = players.findIndex((pl) => pl.id === p.ownerId);
      if (index === -1) return p;
      const newCards = dealt[index].map((card) => toHandCard(card, p.ownerId));
      return withCards(p, [...p.cards, ...newCards]);
    });
    return { ...state, piles };
  },

  /**
   * *nit (direct user request): "add a show/hide cardAction to toggle an
   * individual card's show/hide status." This was `REVEAL`, which only
   * ever went face-down -> face-up and no-op'd on an already-face-up
   * card. Renamed as well as widened, because `REVEAL` would now be a
   * lying name: it flips, in whichever direction the card is currently
   * facing.
   *
   * ONE reducer case for both directions, deliberately - a `HIDE`
   * alongside `REVEAL` would be two code paths for one operation, the
   * exact shape D75 was a correction for ("fix separate code paths for
   * make zone... there can be only 1"). What IS two things, correctly,
   * is the OFFER: `pileableActions` names `'reveal'` on a face-down card
   * and `'conceal'` on a face-up one, purely so the menu can label the
   * direction the card is actually about to go. Authorization reads
   * whichever of those two ids applies, keeping the established
   * read-the-offer-table pattern rather than a second copy of the rule.
   *
   * Mutates a card in place rather than moving it between piles, so
   * this is NOT `transferCard` (D43) - same as `ROTATE` below.
   *
   * A card with no `faceUp` field at all (a deck's cards never pass
   * through anything that sets one) counts as face-down, so the first
   * flip shows it. That's `!== false`'s complement, matching
   * `Pile.showsFace`'s own reading of the same absent field.
   */
  FLIP(state, action) {
    const found = findPileAndCard(state, action.pileableId);
    if (!found) {
      throw new Error(`Card ${action.pileableId} is not in any pile`);
    }
    const { pileId, card } = found;
    const isFaceUp = card.faceUp === true;
    const verb = isFaceUp ? 'conceal' : 'reveal';
    const pile = state.piles.find((p) => p.id === pileId);
    if (!revivePile(pile).canRemove(card, action.playerId, verb)) {
      throw new Error(`Player ${action.playerId} is not authorized to ${verb} ${action.pileableId}`);
    }
    return replacePile(state, pileId, (p) =>
      withCards(p, p.cards.map((c) => (c.id === action.pileableId ? { ...c, faceUp: !isFaceUp } : c))),
    );
  },

  // D48/D40 (Sprint 18): Card.orientation as replicated state. Same
  // shape as FLIP - an in-place mutation, not a `transferCard` (D43),
  // authorization read from `pileableActions`'s offer table rather than a
  // second copy of the rule. Unlike FLIP, authorized by the same
  // condition as `move` (a still-hidden card only by its owner,
  // anything visible or face-down-and-unowned by anyone) - orientation
  // doesn't reveal identity, so it follows `layout`'s own precedent
  // ("arrangement, not identity... survives redaction"), not `reveal`'s
  // stricter privacy rule.
  ROTATE(state, action) {
    const found = findPileAndCard(state, action.pileableId);
    if (!found) {
      throw new Error(`Card ${action.pileableId} is not in any pile`);
    }
    const { pileId, card } = found;
    const pile = state.piles.find((p) => p.id === pileId);
    if (!revivePile(pile).canRemove(card, action.playerId, 'rotate')) {
      throw new Error(`Player ${action.playerId} is not authorized to rotate ${action.pileableId}`);
    }
    const orientation = card.orientation === 'landscape' ? 'portrait' : 'landscape';
    return replacePile(state, pileId, (p) =>
      withCards(p, p.cards.map((c) => (c.id === action.pileableId ? { ...c, orientation } : c))),
    );
  },

  /**
   * D79 (US-82): the untap step — return every permanent in a pile to
   * portrait in one action.
   *
   * A new ACTION rather than a loop of `ROTATE` on the client:
   * untapping a wide board would otherwise be a burst of N separate
   * actions across the network, each re-rendering the table, and a
   * dropped one would leave the board half-untapped with no way to tell.
   * One action is one atomic, replayable state change.
   *
   * Deliberately sets portrait outright rather than toggling: the untap
   * step untaps: it does not flip an already-untapped permanent.
   */
  UNTAP_ALL(state, action) {
    const pile = state.piles.find((p) => p.id === action.pileId);
    if (!pile) throw new Error(`Pile ${action.pileId} does not exist`);
    // Same owner-or-shared rule every pile-level action uses (D43: the
    // read-side offer check IS the write-side authorization check).
    const isOwner = pile.ownerId === action.playerId;
    const isShared = pile.ownerId == undefined;
    if (!isOwner && !isShared) {
      throw new Error(`Player ${action.playerId} is not authorized to untap pile ${action.pileId}`);
    }
    return replacePile(state, action.pileId, (p) =>
      withCards(p, p.cards.map((card) => ({ ...card, orientation: 'portrait' }))),
    );
  },

  /**
   * SORT_PILE (D91, direct user request: "we're missing a bunch of pile
   * actions, like sort by rank, sort by suit"). `HandPile.pileActions`
   * has offered `sortRank`/`sortSuit` since D14's hand redesign, but
   * they never dispatched anywhere - D14's own `handOrder.js` was a
   * CLIENT-ONLY overlay on top of a fixed hand array, retired once a
   * hand became a real state-level pile with nothing built to replace
   * it (`ui.js` filtered the buttons out rather than ship a false
   * affordance - see `renderPileShell`'s own note). This is that
   * reducer action, finally.
   *
   * `action.by` picks the primary key (`'rank'` or `'suit'`); the OTHER
   * key breaks ties, so same-rank cards under a rank sort still land in
   * a fixed suit order instead of "whatever order they arrived in" -
   * fully deterministic either way. A card without a real `rank`/`suit`
   * (a non-standard deck type) sorts as index `-1` for that key -
   * `Array.prototype.sort` is stable, so it simply keeps its relative
   * position rather than throwing or scattering.
   *
   * Owner-only, not owner-or-shared (unlike `UNTAP_ALL` above): the one
   * pile kind that currently offers this is a hand, which is always
   * owned, never shared - narrower on purpose to match what's actually
   * offered today, not a general "any pile" feature nothing asked for.
   */
  /**
   * *fix (direct user request): "actions for braking large denom to
   * smaller denom". Replaces one chip with its exact equivalent in the
   * largest smaller denomination that divides it evenly - a 25 becomes
   * five 5s, a 100 becomes four 25s, and a 1 cannot be broken at all.
   *
   * Value is conserved; COUNT is not, and that is the point. This is the
   * one action in the reducer that legitimately creates pileables, which
   * is why `assertCardsConserved` has to know about it (see its own
   * comment) - chips are fungible, unlike a deck of cards, and "make
   * change" is meaningless if the object count has to stay fixed.
   *
   * The new chips land through the pile's own `insertPileable`, so on a
   * `ChipPile` they sort themselves into the right part of the tray
   * rather than being appended - no special case here for where they go.
   */
  BREAK_CHIP(state, action) {
    const pile = state.piles.find((p) => p.id === action.pileId);
    if (!pile) throw new Error(`Pile ${action.pileId} does not exist`);
    const chip = pile.cards.find((c) => c.id === action.pileableId);
    if (!chip) throw new Error(`Chip ${action.pileableId} is not in pile ${action.pileId}`);
    if (chip.pileableType !== 'chip') {
      throw new Error(`${action.pileableId} is not a chip, so it cannot be broken`);
    }
    const into = breakInto(chip.denom);
    if (into === undefined) {
      throw new Error(`A ${chip.denom} is the smallest denomination and cannot be broken`);
    }

    const batch = batchToken();
    const count = chip.denom / into;
    const made = Array.from({ length: count }, (_, index) => ({
      id: `chip-${batch}-${into}-${index}`,
      pileableType: 'chip',
      denom: into,
      colour: COLOUR_FOR_VALUE[into],
    }));

    return replacePile(state, action.pileId, (p) => {
      const without = revivePile(p).removePileable(action.pileableId);
      let result = without;
      for (const newChip of made) result = revivePile(result).insertPileable(newChip);
      return result;
    });
  },

  SORT_PILE(state, action) {
    const pile = state.piles.find((p) => p.id === action.pileId);
    if (!pile) throw new Error(`Pile ${action.pileId} does not exist`);
    if (pile.ownerId !== action.playerId) {
      throw new Error(`Player ${action.playerId} is not authorized to sort pile ${action.pileId}`);
    }
    // *fix (chips): a denomination is a plain number, not a position in
    // a named order, so it sorts on its own - highest first, the way a
    // tray reads. Kept as its own branch rather than forced into the
    // rank/suit index machinery below, which has nothing to say about it.
    if (action.by === 'denom') {
      const byDenom = pile.cards.toSorted((a, b) => (b.denom ?? 0) - (a.denom ?? 0));
      return replacePile(state, action.pileId, (p) => withCards(p, byDenom));
    }
    // US-113 (direct user request: "rtg hand sorting should be by color
    // and card type not suite and rank") - RtG cards carry neither
    // `rank` nor `suit`, so those two sorts did nothing for them
    // (`indexOf` on an absent field is -1 either side, a no-op tie).
    // `colors` is an ARRAY (a card can be multicolour, or colourless for
    // a land), so the sort key is the FIRST colour, WUBRG order.
    // "Not found" (colourless, or an unrecognised type) sorts LAST here,
    // deliberately different from rank/suit's "-1 sorts first" fallback
    // below - a land belongs at the end of a colour-sorted hand, not the
    // start, matching how a player actually organises one.
    if (action.by === 'color' || action.by === 'cardType') {
      const colorIndex = (card) => {
        const index = RTG_COLOR_ORDER.indexOf(card.colors?.[0]);
        return index === -1 ? RTG_COLOR_ORDER.length : index;
      };
      const typeIndex = (card) => {
        const index = RTG_TYPE_ORDER.indexOf(card.type);
        return index === -1 ? RTG_TYPE_ORDER.length : index;
      };
      const [primary, secondary] = action.by === 'color' ? [colorIndex, typeIndex] : [typeIndex, colorIndex];
      const sorted = pile.cards.toSorted((a, b) => (primary(a) - primary(b)) || (secondary(a) - secondary(b)));
      return replacePile(state, action.pileId, (p) => withCards(p, sorted));
    }
    const [primaryKey, secondaryKey] = action.by === 'suit' ? ['suit', 'rank'] : ['rank', 'suit'];
    const primaryOrder = primaryKey === 'suit' ? SUITS : RANKS;
    const secondaryOrder = secondaryKey === 'suit' ? SUITS : RANKS;
    const sorted = pile.cards.toSorted((a, b) =>
      (primaryOrder.indexOf(a[primaryKey]) - primaryOrder.indexOf(b[primaryKey]))
      || (secondaryOrder.indexOf(a[secondaryKey]) - secondaryOrder.indexOf(b[secondaryKey])));
    return replacePile(state, action.pileId, (p) => withCards(p, sorted));
  },

  PICKUP(state, action) {
    const found = findPileAndCard(state, action.pileableId);
    if (!found) {
      throw new Error(`Card ${action.pileableId} is not in any pile`);
    }
    // Ensured up front, not inside `transferCard`: the destination
    // hand pile must exist before dispatch can look it up by id.
    const handPiles = ensureHandPile(state.piles, action.playerId);
    const withHand = { ...state, piles: handPiles };
    return transferCard(withHand, {
      fromPileId: found.pileId,
      toPileId: resolveHandPileId(handPiles, action.playerId),
      pileableId: action.pileableId,
      viewerId: action.playerId,
      action: 'pickup',
      // No `transform` needed any more - `transferCard` itself now
      // applies `toHandCard` generically to ANY transfer landing in a
      // hand pile (its own comment explains why), so this gets the
      // exact same owner-reset/faceUp/layout-strip for free.
    });
  },

  MOVE(state, action) {
    const found = findPileAndCard(state, action.pileableId);
    if (!found) {
      throw new Error(`Card ${action.pileableId} is not in any pile`);
    }
    if (pilesOf(state).every((p) => p.id !== action.toPileId)) {
      throw new Error(`Pile ${action.toPileId} does not exist`);
    }
    // D21: no same-pile early return - a move within one pile is a
    // real reorder, and `transferCard`'s remove-then-insert passes
    // handle `fromPileId === toPileId` correctly by construction.
    return transferCard(state, {
      fromPileId: found.pileId,
      toPileId: action.toPileId,
      pileableId: action.pileableId,
      viewerId: action.playerId,
      action: 'move',
      placement: placementOf(action),
    });
  },

  /**
   * D92 (direct user request, "THERE SHOULD BE NO CANONICAL PILES"): a
   * deck is just a pile of cards - `DRAW` targets whichever pile
   * `action.pileId` names, same as every other pile-targeted action
   * (`MOVE`/`SPLIT_PILE`/etc). No more hardcoded `DECK_PILE_ID`,
   * no `kind === 'deck'` gate either - fully permissive, matching the
   * Core invariant; which pile kinds actually OFFER a Draw button in
   * the UI is `DeckPile.pileActions()`'s call, a presentation choice,
   * not a reducer restriction.
   */
  DRAW(state, action) {
    const pile = state.piles.find((p) => p.id === action.pileId);
    if (!pile) throw new Error(`Pile ${action.pileId} does not exist`);
    if (pile.cards.length === 0) {
      throw new Error(`Cannot draw: pile ${action.pileId} is empty`);
    }
    const handPiles = ensureHandPile(state.piles, action.playerId);
    const withHand = { ...state, piles: handPiles };
    return transferCard(withHand, {
      fromPileId: action.pileId,
      toPileId: resolveHandPileId(handPiles, action.playerId),
      pileableId: pile.cards[0].id,
      viewerId: action.playerId,
      action: 'draw',
      // No `transform` needed - `transferCard` applies `toHandCard`
      // generically now, see its own comment.
    });
  },

  ADJUST_SCORE(state, action) {
    // *nit (2026-08-27), direct user request: "+/-1 and +/-10 for each
    // player" - the same fixed, enumerable set of allowed deltas
    // `dealFromDeck`/every other reducer guard already uses, just wider
    // than the original +/-1-only set.
    if (![1, -1, 10, -10].includes(action.delta)) {
      throw new Error(`Score delta must be +/-1 or +/-10, got ${action.delta}`);
    }
    const current = state.scores[action.targetPlayerId] ?? 0;
    return {
      ...state,
      scores: { ...state.scores, [action.targetPlayerId]: current + action.delta },
    };
  },

  /**
   * *nit (2026-08-27), direct user request: "update the score by typing
   * it in" - a direct absolute set, alongside `ADJUST_SCORE`'s relative
   * deltas, same two-shape pattern `MOVE_PILE`'s absolute `zoneId` vs.
   * `REORDER_PILE`'s relative `beforePileId` already uses elsewhere in
   * this reducer.
   */
  SET_SCORE(state, action) {
    if (!Number.isSafeInteger(action.value)) {
      throw new TypeError(`Score value must be an integer, got ${action.value}`);
    }
    return { ...state, scores: { ...state.scores, [action.targetPlayerId]: action.value } };
  },

  /**
   * *nit (2026-08-26): rename a pile's own label. Open to any player,
   * same "cosmetic, not a privacy/turn-order boundary" reasoning
   * `MOVE`'s unowned-card case already uses - a name is a label,
   * not something worth a host-only or owner-only gate. Persisted for
   * free: `persistence.js` already writes `state.piles` wholesale.
   */
  RENAME_PILE(state, action) {
    const pile = state.piles.find((p) => p.id === action.pileId);
    if (!pile) throw new Error(`Pile ${action.pileId} does not exist`);
    const name = action.name?.trim();
    if (!name) throw new Error('Pile name cannot be blank');
    return { ...state, piles: state.piles.map((p) => (p.id === action.pileId ? { ...p, name } : p)) };
  },

  /** *nit (2026-08-26): same reasoning as RENAME_PILE, for a Zone
   * record's own name (D55's `state.zones`). */
  RENAME_ZONE(state, action) {
    if (state.zones.every((z) => z.id !== action.zoneId)) {
      throw new Error(`Zone ${action.zoneId} does not exist`);
    }
    const name = action.name?.trim();
    if (!name) throw new Error('Zone name cannot be blank');
    return { ...state, zones: state.zones.map((z) => (z.id === action.zoneId ? { ...z, name } : z)) };
  },

  /**
   * US-71/72 (D62): remove an empty pile/zone the player created.
   * Empty-only - no cascade-delete, no silent card loss (Smith Gate 1
   * Nielsen #9: the thrown message is user-facing, not just a reducer
   * guard). `deck`/`hand` exempt from removal, same reasoning
   * `MOVE_PILE` already uses (`deck` found by fixed id, not
   * kind-search; `hand` has the per-player exactly-one invariant).
   */
  REMOVE_PILE(state, action) {
    const pile = state.piles.find((p) => p.id === action.pileId);
    if (!pile) throw new Error(`Pile ${action.pileId} does not exist`);
    if (pile.kind === 'deck' || pile.kind === 'hand') {
      throw new Error(`Cannot remove a "${pile.kind}" pile`);
    }
    // Found live while wiring the UI (Phase 80): the built-in default
    // Table pile has `kind: 'plain'`, same as any player-created one -
    // the kind check above alone would have let it be removed. Its own
    // Zone record (TABLE_ZONE_ID) is already exempt from REMOVE_ZONE;
    // this closes the matching gap for its pile counterpart.
    if (pile.id === DEFAULT_PILE_ID) {
      throw new Error('Cannot remove the default Table pile');
    }
    if (pile.cards.length > 0) {
      throw new Error('Pile must be empty before it can be removed');
    }
    return { ...state, piles: state.piles.filter((p) => p.id !== action.pileId) };
  },

  /**
   * US-71 (D62): remove an empty Zone record. Table Zone and any
   * preset-declared zone (`gameConfig.zones`) are exempt, same
   * exemption shape `CREATE_ZONE` already enforces via
   * `allowsPlayerZones`. Empty-only - no cascade-delete of piles still
   * inside it.
   */
  REMOVE_ZONE(state, action) {
    const zone = state.zones.find((z) => z.id === action.zoneId);
    if (!zone) throw new Error(`Zone ${action.zoneId} does not exist`);
    const isPresetDeclared = (state.gameConfig?.zones ?? []).some((z) => z.id === action.zoneId);
    if (isPresetDeclared || action.zoneId === TABLE_ZONE_ID) {
      throw new Error(`Cannot remove zone "${action.zoneId}"`);
    }
    if (state.piles.some((p) => p.zoneId === action.zoneId)) {
      throw new Error('Zone must be empty before it can be removed');
    }
    return { ...state, zones: state.zones.filter((z) => z.id !== action.zoneId) };
  },

  /**
   * D63/D71/D86/D87/D89: change a pile's `kind` in place - the pile's
   * `kind` is what actually decides its LOOK (`PILE_TYPES[kind]
   * .component` - `<pile-panel>`/`<fan-pile>`/`<deck-stack>`), not just
   * its game-rule behavior. Gate 1's auto-rename: if the pile's current
   * name is still its OLD kind's own D70 default, it's renamed to the
   * NEW kind's default too - a manually-chosen name is left untouched.
   *
   * Direct user request (2026-08-27): allowed on a non-empty pile too -
   * the prior empty-only guard is gone.
   *
   * D87 (*nit, direct user request: "all pile types must be convertible
   * to any other pile type... deck -> hand -> discard -> all are
   * allowed... it's just a presentation thing"): D86's source/target
   * asymmetry (deck/hand as valid TARGETS only, never sources) is gone -
   * ANY pile can become ANY registered kind now, symmetrically, deck and
   * hand included on both ends. The only remaining check is that the
   * requested kind actually exists (`PILE_TYPES[action.kind]`) - the
   * source side needs no check at all, since an existing pile's `kind`
   * is trivially already valid. `cards` is never touched by this
   * reducer at all, so the exact same cards (same ids, same count, same
   * order) carry over through every conversion - "if I had 5 cards in
   * my hand and turned it into a deck there should only be 5 cards in
   * that deck."
   *
   * D89 (direct user request: "no need to support orphaned piles since
   * that should now never happen"): D87 also dropped the requirement
   * that a `hand`-target pile already have a real `ownerId` - reopening
   * exactly the one path that could ever produce an orphaned
   * (`ownerId: null`) hand-kind pile, which `DEAL` (D88) then had to
   * grow real reclaim-handling for just to keep card conservation
   * intact. Reinstated: converting TO `hand` still requires a real
   * owner - a hand fundamentally belongs to exactly one player
   * (structural, not the Core invariant's authorization permissiveness -
   * D82-85 never touched this). Simpler to make the state impossible
   * than to keep correctly handling it once it exists.
   *
   * The one real risk `CHANGE_PILE_TYPE` reopens - a converted-away
   * hand/deck pile's canonical id (`hand:<playerId>`/`DECK_PILE_ID`)
   * getting silently reused by a FRESH pile the next time one is
   * needed, producing two piles that share one id - is closed by
   * `ensureHandPile`'s own fix (never reuses an id already claimed by
   * another pile) and by the fact `RESET`/`createInitialState` are the
   * only two places that ever construct a fresh canonical-id deck pile,
   * both full state rebuilds that already explicitly filter out
   * whatever currently holds that id first (see `RESET`'s own comment).
   */
  CHANGE_PILE_TYPE(state, action) {
    const pile = state.piles.find((p) => p.id === action.pileId);
    if (!pile) throw new Error(`Pile ${action.pileId} does not exist`);
    if (!Object.hasOwn(PILE_TYPES, action.kind)) {
      throw new Error(`Cannot change a "${pile.kind}" pile to kind "${action.kind}"`);
    }
    if (action.kind === 'hand' && !pile.ownerId) {
      throw new Error(`Cannot change pile ${action.pileId} to kind "hand": it has no owner`);
    }
    const name = isDefaultPileName(pile.name, pile.kind) ? defaultKindName(action.kind) : pile.name;
    return {
      ...state,
      piles: state.piles.map((p) => (p.id === action.pileId ? { ...p, kind: action.kind, name } : p)),
    };
  },

  RESET_SCORES(state) {
    const scores = {};
    for (const player of state.players) scores[player.id] = 0;
    return { ...state, scores };
  },

  RESET(state, action) {
    const rng = action.rng ?? Math.random;
    // Direct user request: "no more unconditional presets, everything
    // must be in the preset config" - RESET used to always rebuild a
    // fresh Deck pile, even for a game whose `gameConfig.tableZone:
    // false` (RTG) means it never had one. `?? true` matches
    // `createInitialState`'s own default for every preset that doesn't
    // set the field.
    const hasTableZone = state.gameConfig.tableZone ?? true;
    // *fix (US-109, "spit and polish" - found by actually playing RtG,
    // not by reading the reducer): a `tableZone: false` preset has NO
    // canonical `DECK_PILE_ID` for the branch above to rebuild - its
    // own declared decks (RtG's fifteen, `GameConfig.piles`) were the
    // only starting-deck piles in the game, and the survivor-filter
    // pass below empties every one of them (cards never survive a
    // reset) with nothing to ever rebuild them from. Restart Game
    // permanently destroyed RtG's entire card pool. `declaredDeckLists`
    // finds every declaration with a real card `deckList` (explicitly
    // NOT a chip/token one - `applyDeclaration`'s own `deckType`
    // default is `'rtg'`, so only `deckType: 'chips'` is excluded here,
    // matching that same default) so those specific piles get REBUILT
    // via `applyDeclaration`, identically to how they were built at
    // table creation, instead of merely survivor-filtered like an
    // ordinary pile. A chip/token supply is excluded on purpose: it
    // already survives via `survivorsOfReset` below (D111), and
    // rebuilding it fresh would spawn a brand-new set ALONGSIDE
    // whatever tokens already wandered onto a battlefield mid-game,
    // duplicating them.
    const declaredDeckLists = declaredCardDeckDeclarations(state.gameConfig.piles ?? []);
    return {
      ...state,
      piles: [
        // Hand piles are dropped outright rather than emptied, so
        // `handsOf()` is `{}` again exactly as pre-D23 `hands: {}` was.
        // UX follow-up (real bug, found live): missing the `zoneId`
        // arg here fell back to `makeDeckPile`'s own default (a
        // standalone zone equal to its own id) instead of landing back
        // in `TABLE_ZONE_ID`, invisible to `pilesOf`'s panel grouping -
        // the deck vanished from the Table Zone panel on every reset.
        ...(hasTableZone ? [makeDeckPile(state.deckConfig, rng, TABLE_ZONE_ID)] : []),
        // Zone structure (player-created zones included) survives a
        // reset - only the cards inside each zone clear. A round reset
        // shouldn't force players to recreate their table layout.
        // UX follow-up (real bug, found live): `pilesOf` now ALSO
        // matches the ORIGINAL deck pile (`deckPile.tableSide` is true
        // now) - without this filter, `makeDeckPile()` above and this
        // map would both produce a pile with `id: DECK_PILE_ID`, two
        // piles claiming the same id (the exact thing D24's invariant
        // exists to prevent). Secondary deck-kind piles (SPLIT_PILE's
        // own, or a manually created one) are NOT the original and
        // still get cleared like any other table-side pile.
        //
        // UX follow-up (real bug, found live, second one): `pilesOf` now
        // ALSO matches every hand pile (`handPile.tableSide` is true too,
        // as of the same change) - without excluding `kind === 'hand'`
        // here, this would have kept every hand pile around with its
        // cards cleared instead of dropping it outright, silently
        // contradicting the comment (and `handsOf()`'s own contract)
        // right above it.
        // *fix (direct user report): `withCards(p, [])` used to empty
        // every surviving pile outright, which is right for CARDS - a
        // reset rebuilds the deck from them - and took every player's
        // chips with it. `survivorsOfReset` keeps whatever is not a
        // card; `assertCardsConserved` skips RESET, so nothing caught
        // this.
        ...pilesOf(state)
          .filter((p) => p.id !== DECK_PILE_ID && p.kind !== 'hand')
          .map((p) => {
            const declaration = declaredDeckLists.get(p.id);
            return declaration ? applyDeclaration(p, declaration, rng) : withCards(p, survivorsOfReset(p.cards));
          }),
        // A hand is still DROPPED, not emptied (`handsOf()` must be `{}`
        // again) - unless the player was holding something a reset does
        // not destroy, in which case the pile stays with just that. The
        // alternative is silently destroying chips someone picked up.
        ...pilesOf(state)
          .filter((p) => p.kind === 'hand' && survivorsOfReset(p.cards).length > 0)
          .map((p) => withCards(p, survivorsOfReset(p.cards))),
      ],
    };
  },
};
ACTIONS.DEAL_MORE = ACTIONS.DEAL;

/** Every card id currently in play, across every pile - the flat list,
 * NOT deduplicated (duplicates are exactly what `assertCardsConserved`
 * needs to detect). */
function allCardIds(state) {
  return state.piles.flatMap((p) => p.cards.map((c) => c.id));
}

/**
 * Move everything belonging to one player id onto another (*fix, direct
 * user report: "chip tray dups again when resuming an existing game").
 *
 * A host's id is a PEER id, not a `playerKey`, so it is different every
 * session and `resumeHostedTable` has to re-seat them. Before this, that
 * re-seating dropped the old host entry and JOINed under the new id -
 * so JOIN saw an unknown player and built their declared `perPlayer`
 * piles a SECOND time, while the saved originals stayed behind owned by
 * a dead id. Two chip trays, and the host's actual chips in the wrong
 * one.
 *
 * Moving the player rather than re-creating them is what makes resume
 * mean "carry on" instead of "start again with the same table": the
 * pile, its contents, its zone and the score all follow the person.
 *
 * Ids DERIVED from the owner (`configuredZoneId` builds `chip-<owner>`)
 * are rewritten too, or the pile would keep a name pointing at a player
 * who no longer exists - cosmetic today, but it is exactly the kind of
 * stale reference that makes the next bug hard to read.
 *
 * @param {object} state
 * @param {string} fromId
 * @param {string} toId
 */
export function reseatOwner(state, fromId, toId) {
  if (!fromId || !toId || fromId === toId) return state;
  const isKnown = state.players.some((p) => p.id === fromId) || state.piles.some((p) => p.ownerId === fromId);
  if (!isKnown) return state;

  // `split`/`join` rather than `replaceAll`: a replacement built from a
  // peer id is not a literal, and `$&`-style sequences in it would be
  // interpreted as backreferences by `replaceAll`.
  const rekey = (id) => (typeof id === 'string' ? id.split(fromId).join(toId) : id);
  const { [fromId]: movedScore, ...otherScores } = state.scores ?? {};

  return {
    ...state,
    players: state.players.map((p) => (p.id === fromId ? { ...p, id: toId } : p)),
    piles: state.piles.map((pile) => (pile.ownerId === fromId
      ? { ...pile, ownerId: toId, id: rekey(pile.id), zoneId: rekey(pile.zoneId) }
      : { ...pile, zoneId: rekey(pile.zoneId) })),
    zones: (state.zones ?? []).map((zone) => (zone.ownerId === fromId
      ? { ...zone, ownerId: toId, id: rekey(zone.id) }
      : { ...zone, id: rekey(zone.id) })),
    scores: movedScore === undefined ? state.scores : { ...otherScores, [toId]: movedScore },
  };
}

/**
 * D88 (direct user request: "once the game starts... no cards can be
 * created or destroyed during play. so there shouldn't be any situation
 * where cards go missing"): every card gets its id ONCE, at deck-build
 * time (`buildDeck`, called by `makeDeckPile`/`createInitialState`, and
 * again by `RESET` for a new round) - between two such rebuilds, the
 * exact SET of card ids in play is a fixed, closed system. Every other
 * action only ever rearranges cards among piles; none may create,
 * destroy, or duplicate one. This is a general architectural guarantee,
 * not a fix for one bug: the D87 `ensureHandPile` id-collision bug this
 * supersedes as a class was ONE way to violate it (two piles sharing an
 * id, so a `.map` update silently double-applied to both) - there could
 * be others, present or future, in any reducer case. Rather than trust
 * every future reducer/helper to individually get card bookkeeping
 * right, `reduce()` itself verifies the invariant after every single
 * dispatch, unconditionally.
 *
 * Cheap enough to run always, not just in tests: a few hundred cards at
 * most, `reduce()` only ever runs on the host (D3 - guests just render
 * broadcast state), once per action. Throwing immediately with the
 * exact ids involved turns a silent, hard-to-reproduce "a card
 * vanished" bug report into a loud, precise one at the exact action
 * that caused it.
 */
export function assertCardsConserved(before, after, actionType) {
  // Sprint pileObjects: a player joining a poker table brings their own
  // chip stack (a `perPlayer` declaration with declared stock), so ids
  // legitimately APPEAR at JOIN - the same way a whole deck appears at
  // RESET. Narrowed rather than exempting JOIN outright: the two failure
  // modes this guard exists for, losing a card and duplicating one, are
  // never legitimate at JOIN either and still throw. A blanket exemption
  // would have hidden both.
  // Two actions legitimately change the SET of ids, in different ways,
  // and the guard says which rather than being switched off for either.
  //
  // JOIN may only ADD: a player brings their own chip stack, and nothing
  // should ever vanish because someone sat down.
  //
  // BREAK_CHIP both consumes and creates - a 25 becomes five 5s - so it
  // may do both. Value is conserved even though the object COUNT is not;
  // chips are fungible, unlike the deck of cards this guard was written
  // for. Duplication stays an error for both, because it is never
  // legitimate for either.
  const canIntroduce = actionType === 'JOIN' || actionType === 'BREAK_CHIP';
  const canConsume = actionType === 'BREAK_CHIP';
  const beforeIds = allCardIds(before);
  const afterIds = allCardIds(after);

  const afterSeen = new Set();
  const duplicated = new Set();
  for (const id of afterIds) {
    if (afterSeen.has(id)) duplicated.add(id);
    afterSeen.add(id);
  }

  const beforeSet = new Set(beforeIds);
  const missing = beforeIds.filter((id) => !afterSeen.has(id));
  const appeared = afterIds.filter((id) => !beforeSet.has(id));

  const unexplained = canIntroduce ? [] : appeared;
  const lost = canConsume ? [] : missing;
  if (duplicated.size > 0 || lost.length > 0 || unexplained.length > 0) {
    const parts = [];
    if (lost.length > 0) parts.push(`missing: ${lost.join(', ')}`);
    if (duplicated.size > 0) parts.push(`duplicated: ${[...duplicated].join(', ')}`);
    if (unexplained.length > 0) parts.push(`appeared from nowhere: ${unexplained.join(', ')}`);
    throw new Error(`Card conservation violated by "${actionType}" (${parts.join('; ')})`);
  }
}

/**
 * @param {ReturnType<typeof createInitialState>} state
 * @param {{type: string, [key: string]: any}} action
 */
export function reduce(state, action) {
  const apply = ACTIONS[action.type];
  if (!apply) throw new Error(`Unknown action type: ${action.type}`);
  const next = apply(state, action);
  // RESET is the one legitimate "new epoch" - it rebuilds the deck with
  // brand new card ids on purpose (a new round), same reason it's
  // exempt from D24's "exactly one deck pile" invariant elsewhere.
  if (action.type !== 'RESET') assertCardsConserved(state, next, action.type);
  return next;
}

/**
 * Redacts full state down to what a single player is allowed to see, per
 * ARCHITECTURE.md D3/D4: hand contents only ever go to their owner.
 *
 * D23 note: this output shape is deliberately **unchanged** by the Pile
 * unification — it is the only thing that ever crosses the wire
 * (`makeStateMessage(view)`) or reaches `ui.js`, so keeping it identical
 * is what made the storage refactor invisible to every other module.
 * @param {ReturnType<typeof createInitialState>} state
 * @param {string} playerId
 */
/**
 * D94 (direct user request: "state.js viewFor is a monstrosity...
 * just do pile.getView()... every case statement should be a derived
 * method call"). The old `switch (pileVisibility(pile))` had three
 * branches that, post-D84 ("TOTAL PERMISSIVE" - full cards always,
 * no redaction), were nearly byte-identical - the only real
 * differences were `DeckPile` adding a `count` field and `HandPile`
 * also feeding `myHand`/`otherHandCounts`, and BOTH of those are now
 * real polymorphic overrides (`getView`/`contributeToView`) on the
 * `Pile` hierarchy instead of inline branches here. This loop is the
 * entire replacement.
 */
export function viewFor(state, playerId) {
  const view = {
    myHand: [], otherHandCounts: {}, piles: [], players: state.players, scores: state.scores,
    // D55/D90: the real Zone registry (`{id, name, ownerId}`). Used to be
    // named `zoneRecords` specifically to avoid colliding with a `zones`
    // field that was actually an array of PILE views (the exact
    // conflation this project no longer tolerates) - now that field is
    // correctly named `piles` above, so this can just be `zones`.
    // `ui.js`'s `renderZones` groups `piles` by each entry's own `zoneId`
    // and looks up its Zone's name/owner here.
    zones: state.zones,
    // D50: only `allowsPlayerZones`, not the whole `GameConfig` object -
    // it's the only field any client-side rendering needs today, and
    // `?? true` mirrors CREATE_ZONE's own `state.gameConfig?.allowsPlayerZones
    // === false` default (a pre-D46 restored snapshot has no `gameConfig`
    // at all, and must default to "allowed" the same way here as there).
    gameConfig: { allowsPlayerZones: state.gameConfig?.allowsPlayerZones ?? true },
  };
  for (const pile of state.piles) pileInstanceFor(pile, playerId).contributeToView(view, playerId);
  return view;
}
