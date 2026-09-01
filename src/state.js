import { buildDeck, shuffle, RANKS, SUITS } from './deck.js';
import { PILE_TYPES, revivePile, pileInstanceFor } from './piles/pileTypes.js';

const DEFAULT_PILE_ID = 'table';
// Exported (only this one, of the three) - `main.js`'s `dealFromDeck`
// needs it for `reshuffleDeal`: `RESET` always rebuilds the preset's
// own starting deck at this well-known id (RESET's own contract, not a
// runtime lookup assumption - see its own comment), so the `DEAL` that
// follows a reshuffle targets this id specifically, not whichever pile
// was originally clicked (`RESET` may have just wiped or replaced it).
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
 * piles"): `PLAY`/`MOVE_CARD` used to carry an `action.zoneId`/
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
  return makePile('deck', { id: DECK_PILE_ID, name: 'Deck', cards: shuffle(buildDeck(deckConfig), rng), zoneId });
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
      piles.push(declaration.deckList
        ? { ...pile, cards: shuffle(buildDeck({ type: declaration.deckType ?? 'rtg', deckList: declaration.deckList }), rng) }
        : pile);
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
    gameConfig: { allowsPlayerZones: gameConfig.allowsPlayerZones ?? true, tableZone: hasTableZone, piles: pileDeclarations, zones: zoneDeclarations },
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
 * makes the base `Pile.redactCard`/`cardActions` (both now inherited by
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
 * `bulkRemovable` flag - "cardActions are the more general case." Now
 * that `docs/ARCHITECTURE.md`'s "Core invariant" means every kind's
 * `cardActions` is the real, generic single-card authorization (no kind
 * empties it out for its own reason any more - `DiscardPile`/`MeldPile`/
 * `ExilePile` all reuse the base `Pile` rule), reusing `canRemoveCard`
 * for the cards being split OUT is correct again: it naturally excludes
 * `HandPile` (`cardActions` only ever offers `'play'`, never `'move'`)
 * with no separate flag needed, and it folds in per-card VISIBILITY for
 * free (`'move'`'s own predicate already requires `!isHidden ||
 * !isOwned || isMine` - a split can't relocate a card you can't see).
 *
 * A deck's cards are still the one real exception: anonymous by
 * construction (`DeckPile.cardActions` is always `[]` - "the deck has
 * never rendered a per-card hover row", its own comment) - open to
 * anyone, matching DRAW/DEAL/SHUFFLE_DECK's existing "no per-card owner
 * to check" model, not this per-card path.
 *
 * *nit (direct user request, "remove the remaining invariants on drag
 * and drop - FULLY PERMISSIVE"): the pile-level `ownerId` gate is gone -
 * a personal pile is no longer split-restricted to its own owner, same
 * as a single card in it (D83). `canRemoveCard(...,'move')` is the only
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
    if (moved.some((card) => !instance.canRemoveCard(card, playerId, 'move'))) {
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
 * deliberately not searched — `REVEAL`/`PICKUP`/`MOVE_CARD` have only
 * ever operated on table-side cards. D90: renamed from
 * `findZoneAndCard`/`{zoneId, card}` - it has only ever searched Piles
 * and returned a Pile's id, never a Zone's.
 */
function findPileAndCard(state, cardId) {
  for (const pile of pilesOf(state)) {
    const card = pile.cards.find((c) => c.id === cardId);
    if (card) return { pileId: pile.id, card };
  }
  return null;
}

/**
 * Maps a US-12 visibility choice to the `{owner, faceUp}` pair stored on
 * a zone-pile card, per ARCHITECTURE.md D7.
 */
function middleCardVisibility(visibility, playerId) {
  switch (visibility) {
    case 'public': {
      return { owner: null, faceUp: true };
    }
    case 'shared-facedown': {
      return { owner: null, faceUp: false };
    }
    case 'private-facedown': {
      return { owner: playerId, faceUp: false };
    }
    default: {
      throw new Error(`Unknown visibility: ${visibility}`);
    }
  }
}

/**
 * D43 (Sprint 14/Tranche 2 of D39): the shared shape behind PLAY/
 * PICKUP/MOVE_CARD/DRAW - remove one card from a pile, run it through
 * pile-type dispatch on both ends, insert it into another. A new pile
 * type only has to implement `canRemoveCard`/`removeCard`/`insertCard`
 * (`src/piles/*.js`) to become a legal source or destination for these
 * four actions - this function, and therefore `state.js`, gains no new
 * `case` for it.
 *
 * Deliberately NOT used for REVEAL (mutates a card in place, never
 * moves it - see the REVEAL case, which reuses `canRemoveCard`'s
 * read-the-offer-table pattern directly instead), SHUFFLE_DECK
 * (pile-level, no card actually changes pile), or DEAL/DEAL_MORE/
 * SPLIT_PILE/PICKUP_SPLIT (one source to one or many destinations, but
 * MANY cards in a single action - a bulk distribution, not a single-
 * card transfer; forcing any of these into this two-pile-one-card shape
 * was considered and rejected - see ARCHITECTURE.md D43).
 *
 * `action` is the action id `canRemoveCard` authorizes against (e.g.
 * `'pickup'`) and appears in the error message on failure.
 */
function transferCard(state, { fromPileId, toPileId, cardId, viewerId, action, placement, transform }) {
  const fromPile = state.piles.find((p) => p.id === fromPileId);
  if (!fromPile) throw new Error(`Pile ${fromPileId} does not exist`);
  const card = fromPile.cards.find((c) => c.id === cardId);
  if (!card) throw new Error(`Card ${cardId} is not in pile ${fromPileId}`);

  if (!pileInstanceFor(fromPile, viewerId).canRemoveCard(card, viewerId, action)) {
    throw new Error(`Player ${viewerId} is not authorized to ${action} ${cardId}`);
  }

  const toPile = state.piles.find((p) => p.id === toPileId);
  if (!toPile) throw new Error(`Pile ${toPileId} does not exist`);
  let movedCard = transform ? transform(card) : card;
  // *nit (real bug, found live): D83's "fully permissive drag and drop"
  // means a plain MOVE_CARD/CREATE_PILE can now target ANY hand as a
  // destination (`docs/ARCHITECTURE.md`'s Core invariant, `HandPile.
  // cardActions` offering `'move'` to a non-owner) - neither action's
  // own `transform` knows anything about hands. Without this, a card
  // "stolen" via plain MOVE_CARD kept its OLD owner/faceUp, landing in
  // the new hand pile but redacted as if it still belonged to whoever
  // it was taken from - invisible even to the player who just took it.
  // Applying `toHandCard` here, once, generically, for ANY transfer
  // landing in a hand (whichever action drove it) is what actually
  // makes "a hand is just a regular pile" and "fully permissive drag-
  // and-drop" compose correctly together, instead of only working for
  // the handful of actions (DRAW/PICKUP) that happened to remember to
  // stamp it themselves.
  if (toPile.kind === 'hand') movedCard = toHandCard(movedCard, toPile.ownerId);

  // D53: the destination pile gets a real say in whether it accepts the
  // card, not just whether it exists. Every pre-Sprint-22 kind accepts
  // unconditionally (zero behavior change) - `foundation`/`cascade`/
  // `rankAdjacent` are the first real callers.
  if (!revivePile(toPile).canAccept(movedCard)) {
    throw new Error(`Pile ${toPileId} cannot accept card ${cardId}`);
  }

  // Two passes, remove-then-insert, exactly like the pre-D43 PLAY/
  // MOVE_CARD code did: this is what makes fromPileId === toPileId (a
  // same-zone reorder) work correctly without a special case - the
  // second pass inserts into the pile the first pass already removed
  // the card from.
  const withoutCard = state.piles.map((p) => (p.id === fromPileId ? revivePile(p).removeCard(cardId) : p));
  const piles = withoutCard.map((p) => (p.id === toPileId ? revivePile(p).insertCard(movedCard, placement) : p));
  return { ...state, piles };
}

// --- Action registry (D44) --------------------------------------------
// `reduce()` used to be one large `switch (action.type)`, exactly the
// shape D42/D43 just replaced for `pile.kind` - so it gets the same
// prescription. Unlike Pile types (a multi-method contract: visibility/
// resolveDropTarget/canAccept/cardActions/canRemoveCard/removeCard/
// insertCard), an action
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
          .flatMap(({ kind, count = 1 }) =>
            Array.from({ length: count }, (_, index) =>
              makeTableSidePile(
                kind, `${action.name}'s ${configuredZoneName(kind, index, count)}`, action.playerId,
                configuredZoneId(kind, index, count, action.playerId),
              )));
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
   * `cardId`/`fromPileId` are optional (an empty pile can be spawned on
   * its own) but must come together - seeding the new pile with a
   * dropped card reuses `transferCard` (D43) so authorization/`canAccept`
   * both run through the exact same single path `MOVE_CARD` does,
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
    if (!action.cardId) return withPile;

    // A card dragged FROM a hand is a PLAY (needs PLAY's own
    // owner/faceUp transform - a hand card carries neither field) - a
    // card dragged from anywhere else on the table is a MOVE (keeps its
    // existing owner/faceUp as-is). Same source-kind branch
    // `dropCardOnZone` (`main.js`) already makes at the UI layer, just
    // made here too so a directly-dispatched action (a guest's own
    // relayed send) gets it right without depending on the UI branch.
    const fromPile = state.piles.find((p) => p.id === action.fromPileId);
    if (!fromPile) throw new Error(`Pile ${action.fromPileId} does not exist`);
    const isFromHand = fromPile.kind === 'hand';
    return transferCard(withPile, {
      fromPileId: action.fromPileId,
      toPileId: pile.id,
      cardId: action.cardId,
      viewerId: action.playerId,
      action: isFromHand ? 'play' : 'move',
      transform: isFromHand
        ? (card) => ({ ...card, ...middleCardVisibility(action.visibility ?? 'public', action.playerId) })
        : undefined,
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
   * maintains its type... semantically dragging and dropping each card
   * from src pile to target pile and then removing the src pile."
   *
   * A DIFFERENT drop target than `MOVE_PILE` above, not a variant of it:
   * dropping a pile onto a ZONE's own empty space still always makes it
   * a sibling there, never a merge (Smith's Gate 1 ruling, D55, unchanged)
   * - this only fires when a dragged pile is dropped directly ONTO
   * another PILE's own body, a drop target that didn't exist before this.
   *
   * Implemented exactly as literally described: reuses `transferCard`
   * once per card (same authorization, same `insertCard` ordering per
   * target kind - a merge into a `deck` prepends, into a `discard`
   * stacks, same as one real card drag would), then removes the
   * now-empty source pile. `reduce()`'s case functions never partially
   * commit on a throw (every other multi-step reducer here already
   * relies on this - see `DEAL`/`splitPileAt`), so a target that
   * legitimately rejects a card (`Foundation`/`Cascade`/`RankAdjacent`'s
   * real `canAccept` content gates, via `transferCard`'s own check)
   * aborts the WHOLE merge cleanly, never a half-emptied source pile.
   *
   * Source `deck`/`hand`/the default Table pile are the one exemption,
   * matching `REMOVE_PILE`'s own exact set - not a new restriction
   * invented here, the same structural reasons those piles already can't
   * be removed (`deck` is found by fixed id elsewhere in this file, not
   * by searching; every player must always have exactly one `hand`; the
   * built-in Table pile is never player-removable). Merging INTO any of
   * them (as the TARGET) is unaffected and works exactly as
   * `transferCard` already allows.
   */
  MERGE_PILE(state, action) {
    const { pileId, targetPileId, playerId } = action;
    if (pileId === targetPileId) throw new Error('Cannot merge a pile into itself');
    const sourcePile = state.piles.find((p) => p.id === pileId);
    if (!sourcePile) throw new Error(`Pile ${pileId} does not exist`);
    if (state.piles.every((p) => p.id !== targetPileId)) {
      throw new Error(`Pile ${targetPileId} does not exist`);
    }
    if (sourcePile.kind === 'deck' || sourcePile.kind === 'hand') {
      throw new Error(`Cannot merge a "${sourcePile.kind}" pile into another pile`);
    }
    // Same exemption `REMOVE_PILE` already declares for its own reason
    // (the built-in Table pile is never a player-removable pile) - a
    // merge always ends by removing the source, so it inherits the
    // same restriction.
    if (sourcePile.id === DEFAULT_PILE_ID) {
      throw new Error('Cannot merge the default Table pile into another pile');
    }

    // Always 'move', never 'play' - a hand source is already excluded
    // above, so there is no PLAY-visibility transform to apply here.
    let next = state;
    for (const card of sourcePile.cards) {
      next = transferCard(next, {
        fromPileId: pileId,
        toPileId: targetPileId,
        cardId: card.id,
        viewerId: playerId,
        action: 'move',
      });
    }
    return { ...next, piles: next.piles.filter((p) => p.id !== pileId) };
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
   * reusing `canRemoveCard(pile, card, playerId, 'move')`, the exact
   * predicate single-card drag-and-drop already uses (D43: write-side
   * re-checks, doesn't just trust the offer layer) - "cardActions are
   * the more general case" (direct user request). `HandPile` is the
   * only kind that ever excludes this (`cardActions` only offers
   * `'play'`, never `'move'` - a hand's own per-player invariant); a
   * Foundation is NOT excluded any more, per `docs/ARCHITECTURE.md`'s
   * "Core invariant".
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
   * `cardActions`-derived one above; never generalized alongside it
   * since the user's own Split/Pickup request didn't ask for Take to
   * widen.
   *
   * Deliberately NOT built on `transferCard` (the single-card MOVE_CARD/
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

  PLAY(state, action) {
    const pileId = action.pileId ?? DEFAULT_PILE_ID;
    if (pilesOf(state).every((p) => p.id !== pileId)) {
      throw new Error(`Pile ${pileId} does not exist`);
    }
    const fromPileId = resolveHandPileId(state.piles, action.playerId);
    // UX follow-up (real bug, found live): PLAY is the ONLY action a
    // hand-sourced drag can ever dispatch (`HandPile.cardActions`,
    // `HandPile.js`, offers `'play'` and nothing else while a card is
    // still in hand) - including a same-hand drag, i.e. a plain reorder
    // (`main.js`'s `dropCardOnPile`). Targeting the same hand it came
    // from is not a real play - no visibility change, no card actually
    // leaving hand - so it must not stamp the public/hidden transform a
    // genuine play always applies; that would give a reordered hand
    // card `owner`/`faceUp` fields it's never supposed to carry
    // (`HandPile.redactCard`'s own comment on that invariant).
    const isReorder = pileId === fromPileId;
    const visibility = isReorder ? null : middleCardVisibility(action.visibility ?? 'public', action.playerId);
    return transferCard(state, {
      fromPileId,
      toPileId: pileId,
      cardId: action.cardId,
      viewerId: action.playerId,
      action: 'play',
      placement: placementOf(action),
      transform: visibility ? (card) => ({ ...card, ...visibility }) : undefined,
    });
  },

  REVEAL(state, action) {
    // Mutates a card in place (flips `faceUp`) rather than moving it
    // between piles, so this is NOT `transferCard` (D43) - but the
    // authorization check is the same reuse-the-offer-table pattern:
    // `cardActions` already states whether 'reveal' is offered, no
    // second copy of the rule inline.
    const found = findPileAndCard(state, action.cardId);
    if (!found) {
      throw new Error(`Card ${action.cardId} is not in any pile`);
    }
    const { pileId, card } = found;
    if (card.faceUp) return state;
    const pile = state.piles.find((p) => p.id === pileId);
    if (!revivePile(pile).canRemoveCard(card, action.playerId, 'reveal')) {
      throw new Error(`Player ${action.playerId} is not authorized to reveal ${action.cardId}`);
    }
    return replacePile(state, pileId, (p) =>
      withCards(p, p.cards.map((c) => (c.id === action.cardId ? { ...c, faceUp: true } : c))),
    );
  },

  // D48/D40 (Sprint 18): Card.orientation as replicated state. Same
  // shape as REVEAL - an in-place mutation, not a `transferCard` (D43),
  // authorization read from `cardActions`'s offer table rather than a
  // second copy of the rule. Unlike REVEAL, authorized by the same
  // condition as `move` (a still-hidden card only by its owner,
  // anything visible or face-down-and-unowned by anyone) - orientation
  // doesn't reveal identity, so it follows `layout`'s own precedent
  // ("arrangement, not identity... survives redaction"), not `reveal`'s
  // stricter privacy rule.
  ROTATE_CARD(state, action) {
    const found = findPileAndCard(state, action.cardId);
    if (!found) {
      throw new Error(`Card ${action.cardId} is not in any pile`);
    }
    const { pileId, card } = found;
    const pile = state.piles.find((p) => p.id === pileId);
    if (!revivePile(pile).canRemoveCard(card, action.playerId, 'rotate')) {
      throw new Error(`Player ${action.playerId} is not authorized to rotate ${action.cardId}`);
    }
    const orientation = card.orientation === 'landscape' ? 'portrait' : 'landscape';
    return replacePile(state, pileId, (p) =>
      withCards(p, p.cards.map((c) => (c.id === action.cardId ? { ...c, orientation } : c))),
    );
  },

  /**
   * D79 (US-82): the untap step — return every permanent in a pile to
   * portrait in one action.
   *
   * A new ACTION rather than a loop of `ROTATE_CARD` on the client:
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
  SORT_PILE(state, action) {
    const pile = state.piles.find((p) => p.id === action.pileId);
    if (!pile) throw new Error(`Pile ${action.pileId} does not exist`);
    if (pile.ownerId !== action.playerId) {
      throw new Error(`Player ${action.playerId} is not authorized to sort pile ${action.pileId}`);
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
    const found = findPileAndCard(state, action.cardId);
    if (!found) {
      throw new Error(`Card ${action.cardId} is not in any pile`);
    }
    // Ensured up front, not inside `transferCard`: the destination
    // hand pile must exist before dispatch can look it up by id.
    const handPiles = ensureHandPile(state.piles, action.playerId);
    const withHand = { ...state, piles: handPiles };
    return transferCard(withHand, {
      fromPileId: found.pileId,
      toPileId: resolveHandPileId(handPiles, action.playerId),
      cardId: action.cardId,
      viewerId: action.playerId,
      action: 'pickup',
      // No `transform` needed any more - `transferCard` itself now
      // applies `toHandCard` generically to ANY transfer landing in a
      // hand pile (its own comment explains why), so this gets the
      // exact same owner-reset/faceUp/layout-strip for free.
    });
  },

  MOVE_CARD(state, action) {
    const found = findPileAndCard(state, action.cardId);
    if (!found) {
      throw new Error(`Card ${action.cardId} is not in any pile`);
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
      cardId: action.cardId,
      viewerId: action.playerId,
      action: 'move',
      placement: placementOf(action),
    });
  },

  /**
   * D92 (direct user request, "THERE SHOULD BE NO CANONICAL PILES"): a
   * deck is just a pile of cards - `DRAW` targets whichever pile
   * `action.pileId` names, same as every other pile-targeted action
   * (`MOVE_CARD`/`SPLIT_PILE`/etc). No more hardcoded `DECK_PILE_ID`,
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
      cardId: pile.cards[0].id,
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
   * `MOVE_CARD`'s unowned-card case already uses - a name is a label,
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
        ...pilesOf(state).filter((p) => p.id !== DECK_PILE_ID && p.kind !== 'hand').map((p) => withCards(p, [])),
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

  if (duplicated.size > 0 || missing.length > 0 || appeared.length > 0) {
    const parts = [];
    if (missing.length > 0) parts.push(`missing: ${missing.join(', ')}`);
    if (duplicated.size > 0) parts.push(`duplicated: ${[...duplicated].join(', ')}`);
    if (appeared.length > 0) parts.push(`appeared from nowhere: ${appeared.join(', ')}`);
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
