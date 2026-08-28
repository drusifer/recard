import { buildDeck, shuffle } from './deck.js';
import { PILE_TYPES, CHANGE_PILE_TYPE_CYCLE } from './piles/pileTypes.js';

const DEFAULT_ZONE_ID = 'table';
const DECK_PILE_ID = 'deck';
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
 * NOT the same `zoneId` as `PLAY`/`MOVE_CARD`'s `action.zoneId`/
 * `toZoneId`, or `findZoneAndCard`'s returned `zoneId` below - those
 * predate this field and (despite the name) mean "which PILE", per
 * `zonesOf`'s own doc comment. Two different things share this word by
 * historical accident; this comment exists so nobody re-derives D55's
 * original mistake (conflating them) from the collision.
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
 * | kind   | who sees the cards            | matches the user's wording |
 * |--------|-------------------------------|----------------------------|
 * | 'deck' | nobody (count only)           | the draw stock             |
 * | 'hand' | only `ownerId` (count to all) | "In Hand"                  |
 * | 'zone' | per-card `{owner, faceUp}`    | "Open" / "Mixed"           |
 *
 * A `'zone'` pile is the general case: each card carries its own D7
 * `{owner, faceUp}`, so a zone is "open" when every card is face-up and
 * "mixed" when they differ — one mechanism covers both, exactly as it
 * has since D7, rather than needing a separate pile type per case.
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

/**
 * D17 (generalized by D23, D45): shared pile-construction for
 * `CREATE_ZONE` and `JOIN`'s per-player configured zones (Spit's
 * per-player stock, etc). `kind` defaults to `'zone'` for `CREATE_ZONE`'s
 * own default; every other caller passes an explicit one.
 */
function makeTableSidePile(kind, name, ownerId = null, id = null, zoneId = null) {
  const resolvedId = id ??
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `zone-${Date.now()}-${Math.random()}`);
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
 * 'Zone'" - `kind: 'zone'` is the generic/base Pile kind, but "Zone"
 * is already this app's own word for the CONTAINING entity (D55's
 * Zone/Pile split) - naming the pile itself "Zone" collided with that.
 * Every other kind still just capitalizes (Discard, Foundation, ...).
 */
function defaultNameWord(kind) {
  return kind === 'zone' ? 'Pile' : capitalizeKind(kind);
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

  return {
    deckConfig,
    gameConfig: { allowsPlayerZones: gameConfig.allowsPlayerZones ?? true, piles: pileDeclarations, zones: zoneDeclarations },
    zones: built.zones,
    piles: [
      makeDeckPile(deckConfig, rng, TABLE_ZONE_ID),
      makePile('zone', { id: DEFAULT_ZONE_ID, name: 'Table', zoneId: TABLE_ZONE_ID }),
      ...built.piles,
    ],
    players: [],
    scores: {},
    // US-62 (Sprint 23, Phase 69): the ONLY identity SET_PILE_ORIENTATION
    // needs to re-check a shared pile's host-only authorization itself
    // (D43 discipline - reducer, not just the offer layer). Set once, by
    // the first JOIN (below) - the host always joins its own table
    // before a share code exists for anyone else to reach it (D3), so
    // "first player ever to join" and "the host" are the same fact.
    hostId: null,
  };
}

// --- Selectors (D23) -------------------------------------------------
// The reducer and its tests read piles through these rather than
// indexing `state.piles` by hand, so "which pile kind am I looking at"
// is stated once here instead of re-derived at every call site.

/** The draw stock's cards. UX follow-up: matched by `id`, not `kind`,
 * now that a deck-kind pile is no longer necessarily THE deck - decks
 * can be created/moved into zones like any other table-side pile
 * (`deckPile.tableSide`), so more than one may exist. `DECK_PILE_ID` is
 * still the one and only pile DRAW/DEAL/SHUFFLE_DECK/SPLIT_DECK act on
 * - the D24 invariant ("exactly one deck pile always exists") now reads
 * as "exactly one pile with this SPECIFIC id", not "exactly one pile of
 * this kind". */
export function deckOf(state) {
  return state.piles.find((p) => p.id === DECK_PILE_ID).cards;
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

/** Every table-side pile (D45: zone AND discard, previously zone-only),
 * in creation order. Name kept as-is despite the broader meaning - every
 * call site (here and across `tests/`) already reads "the piles a card
 * can be played/moved onto", not literally "kind === zone". */
export function zonesOf(state) {
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
 * Hand piles are created on demand (first deal/draw/pickup) and dropped
 * entirely by `RESET` — that's what keeps `handsOf()` empty before a
 * deal and after a reset, matching pre-D23 behavior.
 */
function ensureHandPile(piles, playerId) {
  if (piles.some((p) => p.kind === 'hand' && p.ownerId === playerId)) return piles;
  return [...piles, makePile('hand', { id: handPileId(playerId), name: 'Hand', ownerId: playerId })];
}

/**
 * D23: the one round-robin dealer behind `DEAL`, `DEAL_MORE`, and
 * `SPLIT_DECK`. `cardsPerDestination: null` means "keep going until the
 * stock is exhausted" (Split); a number means "exactly this many each"
 * (Deal), which is the only mode that can fail for lack of cards.
 * @returns {{remaining: object[], dealt: object[][]}} `dealt[i]` is the
 *   cards for destination `i`, in deal order.
 */
function dealRoundRobin(deck, destinationCount, cardsPerDestination, describeShortfall, options = {}) {
  if (cardsPerDestination !== null) {
    const totalNeeded = cardsPerDestination * destinationCount;
    if (totalNeeded > deck.length) throw new Error(describeShortfall(deck.length));
  } else if (options.atLeastOneEach && destinationCount > deck.length) {
    // Exhaust-the-stock mode has no per-destination count to check, but
    // a caller can still require that no destination comes out empty.
    throw new Error(options.describeShortfall(deck.length));
  }
  const remaining = [...deck];
  const dealt = Array.from({ length: destinationCount }, () => []);
  if (destinationCount === 0) return { remaining, dealt };

  const rounds = cardsPerDestination ?? Infinity;
  for (let round = 0; round < rounds && remaining.length > 0; round++) {
    for (let index = 0; index < destinationCount && remaining.length > 0; index++) {
      dealt[index].push(remaining.shift());
    }
  }
  return { remaining, dealt };
}

/**
True if a card is face-down and its owner can't be assumed to be the viewer - D25's TAKE_PILE guard.
*/
function isHiddenCard(card) {
  return card.faceDown === true || card.faceUp === false;
}

/**
The subset of an action describing where/how a dropped card lands (D21).
*/
function placementOf(action) {
  return { targetCardId: action.targetCardId, side: action.side, layout: action.layout };
}

/**
 * D12: card ids are globally unique (assigned once per physical card by
 * deck.js), so a card can be located across every zone without the
 * caller needing to know which zone it's in. Deck and hand piles are
 * deliberately not searched — `REVEAL`/`PICKUP`/`MOVE_CARD` have only
 * ever operated on table-side cards.
 */
function findZoneAndCard(state, cardId) {
  for (const zone of zonesOf(state)) {
    const card = zone.cards.find((c) => c.id === cardId);
    if (card) return { zoneId: zone.id, card };
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
 * read-the-offer-table pattern directly instead), SHUFFLE_DECK/
 * SPLIT_DECK (deck-specific pile-level operations with no cross-type
 * behavior to generalize), or DEAL/DEAL_MORE (one source to MANY
 * destinations in a single action - a bulk distribution, not a
 * transfer; forcing it into this two-pile shape was considered and
 * rejected - see ARCHITECTURE.md D43).
 *
 * `action` is the action id `canRemoveCard` authorizes against (e.g.
 * `'pickup'`) and appears in the error message on failure.
 */
function transferCard(state, { fromPileId, toPileId, cardId, viewerId, action, placement, transform }) {
  const fromPile = state.piles.find((p) => p.id === fromPileId);
  if (!fromPile) throw new Error(`Pile ${fromPileId} does not exist`);
  const card = fromPile.cards.find((c) => c.id === cardId);
  if (!card) throw new Error(`Card ${cardId} is not in pile ${fromPileId}`);

  const fromType = PILE_TYPES[fromPile.kind];
  if (!fromType.canRemoveCard(fromPile, card, viewerId, action)) {
    throw new Error(`Player ${viewerId} is not authorized to ${action} ${cardId}`);
  }

  const toPile = state.piles.find((p) => p.id === toPileId);
  if (!toPile) throw new Error(`Pile ${toPileId} does not exist`);
  const toType = PILE_TYPES[toPile.kind];
  const movedCard = transform ? transform(card) : card;

  // D53: the destination pile gets a real say in whether it accepts the
  // card, not just whether it exists. Every pre-Sprint-22 kind accepts
  // unconditionally (zero behavior change) - `foundation`/`cascade`/
  // `rankAdjacent` are the first real callers.
  if (!toType.canAccept(toPile, movedCard)) {
    throw new Error(`Pile ${toPileId} cannot accept card ${cardId}`);
  }

  // Two passes, remove-then-insert, exactly like the pre-D43 PLAY/
  // MOVE_CARD code did: this is what makes fromPileId === toPileId (a
  // same-zone reorder) work correctly without a special case - the
  // second pass inserts into the pile the first pass already removed
  // the card from.
  const withoutCard = state.piles.map((p) => (p.id === fromPileId ? fromType.removeCard(p, cardId) : p));
  const piles = withoutCard.map((p) => (p.id === toPileId ? toType.insertCard(p, movedCard, placement) : p));
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
// module's private helpers (`transferCard`, `findZoneAndCard`,
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
  DEAL(state, action) {
    const isFresh = action.type === 'DEAL';
    const players = state.players;
    const { remaining, dealt } = dealRoundRobin(
      deckOf(state),
      players.length,
      action.cardsPerPlayer,
      (left) =>
        `Cannot deal ${action.cardsPerPlayer} cards to ${players.length} players: only ${left} left`,
    );

    let piles = state.piles;
    for (const player of players) piles = ensureHandPile(piles, player.id);
    piles = piles.map((p) => {
      // UX follow-up: `id`, not `kind` - see `deckOf`'s own comment.
      if (p.id === DECK_PILE_ID) return withCards(p, remaining);
      if (p.kind !== 'hand') return p;
      const index = players.findIndex((pl) => pl.id === p.ownerId);
      if (index === -1) return isFresh ? withCards(p, []) : p;
      return withCards(p, [...(isFresh ? [] : p.cards), ...dealt[index]]);
    });
    return { ...state, piles };
  },

  // D45: `action.kind` lets a host create any table-side pile TYPE, not
  // only a plain zone - defaults to 'zone' so every pre-D45 caller
  // (and every existing test) is unaffected. Validated against the
  // registry rather than trusted: a `kind` that doesn't exist, isn't
  // `tableSide`, or is `hand` (never player-creatable, see below), is
  // rejected rather than silently creating a broken pile no reducer path
  // can ever reach.
  //
  // D46: gated behind GameConfig.allowsPlayerZones - the ONLY place
  // that flag matters, since JOIN's per-player configured zones and
  // SPLIT_DECK's piles both call `makeTableSidePile` directly (never
  // through this action), so a game that disallows player-added zones
  // still gets its default table, configured zones, and split piles
  // exactly as before.
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
    const kind = action.kind ?? 'zone';
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
    // `DEFAULT_ZONE_ID` (the built-in "Table" pile, `kind: 'zone'`) is
    // excluded - it's not part of the player-created numbering, it
    // already has its own fixed name.
    const sameKindCount = state.piles.filter((p) => p.kind === kind && p.id !== DEFAULT_ZONE_ID).length;
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
    const kind = action.kind ?? 'zone';
    if (kind === 'hand' || !PILE_TYPES[kind]?.tableSide) {
      throw new Error(`Cannot create a pile of kind "${kind}"`);
    }
    // *nit: same default-naming as CREATE_ZONE above.
    const sameKindCount = state.piles.filter((p) => p.kind === kind && p.id !== DEFAULT_ZONE_ID).length;
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
    // `deckOf`/`DEAL`/`DRAW`/`SPLIT_DECK`/`SHUFFLE_DECK`/`RESET` all
    // find the deck by `DECK_PILE_ID`, none of them read or assume its
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
   * (direct user request) - "Panels can be moved from zone to zone
   * [MOVE_PILE, above] and relocated within their zone (ordering)."
   * `state.piles`' own array order IS render order within a zone
   * (`zonesOf`/`viewFor` both iterate it in place) - reordering is
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
   * US-60 (Sprint 23): splits a pile roughly in half into a new sibling
   * pile of the same kind, in the same Zone. Only `zone`/`discard` -
   * same eligibility as `MOVE_PILE`/`take` (Smith's Gate 1 ruling) -
   * write-side re-checked here, not just trusted from the offer layer
   * (D43's standing discipline). Odd count: the ORIGINAL pile keeps the
   * extra card (Smith's ruling) - `Math.floor` sizing the new pile
   * naturally leaves the remainder with the original.
   */
  SPLIT_PILE(state, action) {
    const pile = state.piles.find((p) => p.id === action.pileId);
    if (!pile) throw new Error(`Pile ${action.pileId} does not exist`);
    if (pile.kind !== 'zone' && pile.kind !== 'discard') {
      throw new Error(`Cannot split a "${pile.kind}" pile`);
    }
    if (pile.ownerId && pile.ownerId !== action.playerId) {
      throw new Error(`Player ${action.playerId} is not authorized to split pile ${action.pileId}`);
    }
    if (pile.cards.length < 2) {
      throw new Error(`Cannot split pile ${action.pileId}: only ${pile.cards.length} card(s)`);
    }

    const half = Math.floor(pile.cards.length / 2);
    const newCards = pile.cards.slice(pile.cards.length - half);
    const keptCards = pile.cards.slice(0, pile.cards.length - half);
    const newPile = withCards(
      makeTableSidePile(pile.kind, `${pile.name} 2`, pile.ownerId, null, pile.zoneId),
      newCards,
    );
    return {
      ...state,
      piles: [...state.piles.map((p) => (p.id === action.pileId ? withCards(p, keptCards) : p)), newPile],
    };
  },

  /**
   * US-61 (Sprint 23): takes an entire pile into the acting player's
   * hand at once. Only `zone`/`discard`, same eligibility/ownership
   * guard as `SPLIT_PILE` above.
   *
   * Deliberately NOT built on `transferCard` (the single-card MOVE_CARD/
   * PICKUP machinery): `discardPile.canRemoveCard` is unconditionally
   * false (D45's "drop-only" design - no card ever leaves individually),
   * which would make a discard pile untakeable through that path no
   * matter what action name was passed - the wrong outcome, since
   * "drop-only" is a statement about the single-card gesture, not about
   * this bulk operation. The real gate here is pile-level: every card
   * must be visible to the acting player (the same `{owner, faceUp}`
   * "hidden" predicate `zonePile`/`discardPile` both already duplicate
   * for their own per-card rules) - not `cardActions(...).includes
   * ('pickup')`, which would wrongly reject every discard-pile take.
   */
  TAKE_PILE(state, action) {
    const pile = state.piles.find((p) => p.id === action.pileId);
    if (!pile) throw new Error(`Pile ${action.pileId} does not exist`);
    if (pile.kind !== 'zone' && pile.kind !== 'discard') {
      throw new Error(`Cannot take a "${pile.kind}" pile`);
    }
    if (pile.ownerId && pile.ownerId !== action.playerId) {
      throw new Error(`Player ${action.playerId} is not authorized to take pile ${action.pileId}`);
    }
    if (pile.cards.some((card) => isHiddenCard(card))) {
      throw new Error(`Player ${action.playerId} cannot take pile ${action.pileId}: it contains a card they cannot see`);
    }

    // Same D7 "a hand pile's cards are plain" transform PICKUP already
    // applies (state.js's PICKUP case) - the zone-only owner/faceUp/
    // layout fields come back off on the way into a hand.
    const plainCards = pile.cards.map(({ owner, faceUp, layout, ...plainCard }) => plainCard);
    const piles = ensureHandPile(state.piles, action.playerId).map((p) => {
      if (p.id === action.pileId) return withCards(p, []);
      if (p.id === handPileId(action.playerId)) return withCards(p, [...p.cards, ...plainCards]);
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
   * Authorization is a NEW axis for this reducer, not a copy of
   * `SPLIT_PILE`/`TAKE_PILE`'s: those are "shared content, open to
   * anyone" (matching `move`/`pickup`'s philosophy); a whole pile's
   * orientation is closer to the deck's `deal`/`shuffle` - host-only for
   * a SHARED pile, owner-only for a personal one. Unlike DEAL/
   * SHUFFLE_DECK (host-only in the OFFER layer only, `ui.js`'s `isHost`
   * ctx flag - `state.js` has never tracked host identity at all), this
   * re-checks for real (D43 discipline, direct user request): `hostId`
   * (set once, at the first JOIN) is compared against `action.playerId`
   * here, not just trusted from whichever button rendered.
   */
  SET_PILE_ORIENTATION(state, action) {
    const pile = state.piles.find((p) => p.id === action.pileId);
    if (!pile) throw new Error(`Pile ${action.pileId} does not exist`);
    if (pile.kind !== 'zone' && pile.kind !== 'discard') {
      throw new Error(`Cannot set orientation of a "${pile.kind}" pile`);
    }
    if (pile.ownerId) {
      if (pile.ownerId !== action.playerId) {
        throw new Error(`Player ${action.playerId} is not authorized to set orientation of pile ${action.pileId}`);
      }
    } else if (action.playerId !== state.hostId) {
      throw new Error(`Player ${action.playerId} is not authorized to set orientation of pile ${action.pileId}`);
    }

    return {
      ...state,
      piles: state.piles.map((p) => (p.id === action.pileId
        ? withCards(p, p.cards.map((c) => ({ ...c, faceUp: action.faceUp })))
        : p)),
    };
  },

  SHUFFLE_DECK(state, action) {
    // D22/US-35: reorders the stock and nothing else - the one thing
    // `RESET` can't do, since it also rebuilds the deck and wipes
    // hands/zones/pass markers. Everything else flows through
    // untouched via the spread, so there's no field to forget.
    const rng = action.rng ?? Math.random;
    return replacePile(state, DECK_PILE_ID, (deck) => withCards(deck, shuffle(deck.cards, rng)));
  },

  SPLIT_DECK(state, action) {
    // D22/US-36: turn the remaining stock into N independent draw
    // piles (solitaire-style layouts want several, not just two).
    const { pileCount } = action;
    if (!Number.isSafeInteger(pileCount) || pileCount < 2) {
      throw new Error(`Split needs at least 2 piles, got ${pileCount}`);
    }
    const deck = deckOf(state);
    // Smith Gate 1 guard: every pile must get at least one card, which
    // covers "deck is empty" and "too many piles" as one condition.
    const { remaining, dealt } = dealRoundRobin(deck, pileCount, null, () => '', {
      atLeastOneEach: true,
      describeShortfall: (left) => `Cannot split into ${pileCount} piles: only ${left} cards left`,
    });
    // UX follow-up (direct user request): "one split should result in 2
    // decks (not piles)." Now that `deckPile.tableSide` is real, a
    // split pile can just BE a deck-kind pile - hidden visibility,
    // count-only, no per-card owner/faceUp/layout fields needed at all
    // (those were only ever there to make a zone-kind pile behave like
    // a hidden draw pile; a real deck-kind pile already IS one).
    const piles = dealt.map((cards, index) => withCards(makeTableSidePile('deck', `Pile ${index + 1}`), cards));
    // D24 invariant: the ORIGINAL deck pile (`DECK_PILE_ID`) stays, now
    // empty - matched by id, not kind, now that split piles are ALSO
    // deck-kind (see `deckOf`'s own comment on why this matters).
    // Removing the original would break every later DRAW/DEAL with an
    // opaque undefined error.
    return {
      ...state,
      piles: [...state.piles.map((p) => (p.id === DECK_PILE_ID ? withCards(p, remaining) : p)), ...piles],
    };
  },

  PLAY(state, action) {
    const zoneId = action.zoneId ?? DEFAULT_ZONE_ID;
    if (zonesOf(state).every((z) => z.id !== zoneId)) {
      throw new Error(`Zone ${zoneId} does not exist`);
    }
    const { owner, faceUp } = middleCardVisibility(action.visibility ?? 'public', action.playerId);
    return transferCard(state, {
      fromPileId: handPileId(action.playerId),
      toPileId: zoneId,
      cardId: action.cardId,
      viewerId: action.playerId,
      action: 'play',
      placement: placementOf(action),
      transform: (card) => ({ ...card, owner, faceUp }),
    });
  },

  REVEAL(state, action) {
    // Mutates a card in place (flips `faceUp`) rather than moving it
    // between piles, so this is NOT `transferCard` (D43) - but the
    // authorization check is the same reuse-the-offer-table pattern:
    // `cardActions` already states whether 'reveal' is offered, no
    // second copy of the rule inline.
    const found = findZoneAndCard(state, action.cardId);
    if (!found) {
      throw new Error(`Card ${action.cardId} is not in any zone`);
    }
    const { zoneId, card } = found;
    if (card.faceUp) return state;
    const zone = state.piles.find((p) => p.id === zoneId);
    if (!PILE_TYPES[zone.kind].canRemoveCard(zone, card, action.playerId, 'reveal')) {
      throw new Error(`Player ${action.playerId} is not authorized to reveal ${action.cardId}`);
    }
    return replacePile(state, zoneId, (z) =>
      withCards(z, z.cards.map((c) => (c.id === action.cardId ? { ...c, faceUp: true } : c))),
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
    const found = findZoneAndCard(state, action.cardId);
    if (!found) {
      throw new Error(`Card ${action.cardId} is not in any zone`);
    }
    const { zoneId, card } = found;
    const zone = state.piles.find((p) => p.id === zoneId);
    if (!PILE_TYPES[zone.kind].canRemoveCard(zone, card, action.playerId, 'rotate')) {
      throw new Error(`Player ${action.playerId} is not authorized to rotate ${action.cardId}`);
    }
    const orientation = card.orientation === 'landscape' ? 'portrait' : 'landscape';
    return replacePile(state, zoneId, (z) =>
      withCards(z, z.cards.map((c) => (c.id === action.cardId ? { ...c, orientation } : c))),
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

  PICKUP(state, action) {
    const found = findZoneAndCard(state, action.cardId);
    if (!found) {
      throw new Error(`Card ${action.cardId} is not in any zone`);
    }
    // Ensured up front, not inside `transferCard`: the destination
    // hand pile must exist before dispatch can look it up by id.
    const withHand = { ...state, piles: ensureHandPile(state.piles, action.playerId) };
    return transferCard(withHand, {
      fromPileId: found.zoneId,
      toPileId: handPileId(action.playerId),
      cardId: action.cardId,
      viewerId: action.playerId,
      action: 'pickup',
      // A hand pile's cards are plain - its own `kind`/`ownerId`
      // already carry the visibility rule (D23), so the zone-only D7
      // fields come back off on the way in. `layout` (D21) is
      // zone-only for the same reason: a hand has no adjacency
      // rendering to describe.
      transform: ({ owner, faceUp, layout, ...plainCard }) => plainCard,
    });
  },

  MOVE_CARD(state, action) {
    const found = findZoneAndCard(state, action.cardId);
    if (!found) {
      throw new Error(`Card ${action.cardId} is not in any zone`);
    }
    if (zonesOf(state).every((z) => z.id !== action.toZoneId)) {
      throw new Error(`Zone ${action.toZoneId} does not exist`);
    }
    // D21: no same-zone early return - a move within one zone is a
    // real reorder, and `transferCard`'s remove-then-insert passes
    // handle `fromPileId === toPileId` correctly by construction.
    return transferCard(state, {
      fromPileId: found.zoneId,
      toPileId: action.toZoneId,
      cardId: action.cardId,
      viewerId: action.playerId,
      action: 'move',
      placement: placementOf(action),
    });
  },

  DRAW(state, action) {
    const deck = deckOf(state);
    if (deck.length === 0) {
      throw new Error('Cannot draw: deck is empty');
    }
    const withHand = { ...state, piles: ensureHandPile(state.piles, action.playerId) };
    return transferCard(withHand, {
      fromPileId: DECK_PILE_ID,
      toPileId: handPileId(action.playerId),
      cardId: deck[0].id,
      viewerId: action.playerId,
      action: 'draw',
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
    // Table pile has `kind: 'zone'`, same as any player-created one -
    // the kind check above alone would have let it be removed. Its own
    // Zone record (TABLE_ZONE_ID) is already exempt from REMOVE_ZONE;
    // this closes the matching gap for its pile counterpart.
    if (pile.id === DEFAULT_ZONE_ID) {
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
   * D63/D71 (US-73/74): change a pile's `kind` in place, cycling through
   * `CHANGE_PILE_TYPE_CYCLE` (zone/discard/foundation/cascade/
   * rankAdjacent). `deck`/`hand` exempt for the same reason D62's remove
   * actions exempt them. Gate 1's auto-rename: if the pile's current name
   * is still its OLD kind's own D70 default, it's renamed to the NEW
   * kind's default too - a manually-chosen name is left untouched.
   *
   * Direct user request (2026-08-27): allowed on a non-empty pile too -
   * the prior empty-only guard is gone. Note the risk this reopens for
   * `foundation`/`cascade`/`rankAdjacent`, which carry real game-rule
   * `canAccept` logic: swapping a pile with cards into one of those
   * kinds does NOT re-validate the existing cards against the new
   * kind's rules, so it can leave cards in a pile they'd never have
   * been allowed to enter directly.
   */
  CHANGE_PILE_TYPE(state, action) {
    const pile = state.piles.find((p) => p.id === action.pileId);
    if (!pile) throw new Error(`Pile ${action.pileId} does not exist`);
    const isEligible = CHANGE_PILE_TYPE_CYCLE.includes(pile.kind);
    const isTargetEligible = CHANGE_PILE_TYPE_CYCLE.includes(action.kind);
    if (!isEligible || !isTargetEligible) {
      throw new Error(`Cannot change a "${pile.kind}" pile to kind "${action.kind}"`);
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
    return {
      ...state,
      piles: [
        // Hand piles are dropped outright rather than emptied, so
        // `handsOf()` is `{}` again exactly as pre-D23 `hands: {}` was.
        makeDeckPile(state.deckConfig, rng),
        // Zone structure (player-created zones included) survives a
        // reset - only the cards inside each zone clear. A round reset
        // shouldn't force players to recreate their table layout.
        // UX follow-up (real bug, found live): `zonesOf` now ALSO
        // matches the ORIGINAL deck pile (`deckPile.tableSide` is true
        // now) - without this filter, `makeDeckPile()` above and this
        // map would both produce a pile with `id: DECK_PILE_ID`, two
        // piles claiming the same id (the exact thing D24's invariant
        // exists to prevent). Secondary deck-kind piles (SPLIT_DECK's
        // own, or a manually created one) are NOT the original and
        // still get cleared like any other table-side pile.
        //
        // UX follow-up (real bug, found live, second one): `zonesOf` now
        // ALSO matches every hand pile (`handPile.tableSide` is true too,
        // as of the same change) - without excluding `kind === 'hand'`
        // here, this would have kept every hand pile around with its
        // cards cleared instead of dropping it outright, silently
        // contradicting the comment (and `handsOf()`'s own contract)
        // right above it.
        ...zonesOf(state).filter((z) => z.id !== DECK_PILE_ID && z.kind !== 'hand').map((z) => withCards(z, [])),
      ],
    };
  },
};
ACTIONS.DEAL_MORE = ACTIONS.DEAL;

/**
 * @param {ReturnType<typeof createInitialState>} state
 * @param {{type: string, [key: string]: any}} action
 */
export function reduce(state, action) {
  const apply = ACTIONS[action.type];
  if (!apply) throw new Error(`Unknown action type: ${action.type}`);
  return apply(state, action);
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
export function viewFor(state, playerId) {
  const otherHandCounts = {};
  let myHand = [];
  const zones = [];
  let deckCount = 0;

  for (const pile of state.piles) {
    switch (pileVisibility(pile)) {
      // 'hidden'/'in-hand' piles never send contents to a non-viewer -
      // only a count, so a hand's *size* stays public (needed for the
      // roster's card counts) while its cards never leave the host.
      case 'hidden': {
        // UX follow-up (real bug, found live): more than one deck-kind
        // (hidden-visibility) pile can exist now (`deckPile.tableSide`)
        // - this used to blindly overwrite `deckCount` with whichever
        // hidden pile it saw LAST, silently showing the wrong count the
        // instant a second one existed. `DECK_PILE_ID` names the ONE
        // pile that IS "the deck" for that badge - `deckCount` is kept
        // for the pre-game preview screen (`#host-deck-area`), which has
        // no `zones`/piles concept at all.
        //
        // UX follow-up (direct user request): "a Deck is a specific
        // kind of Pile... it is not a Zone at all" - the SAME dual-
        // routing `myHand`/`otherHandCounts` already do for the hand
        // pile (below): the main deck ALSO joins `zones` now (`cards:
        // []`, `count` carries its size - `ui.js`'s `renderPile` reads
        // `count` before falling back to `cards.length`), so it flows
        // through the exact same generic Pile pipeline every other pile
        // does, instead of being a special top-level `deckCount` field
        // with its own bespoke render path in `main.js`.
        if (pile.id === DECK_PILE_ID) deckCount = pile.cards.length;
        // D67, direct user request ("nix the constraint re: privacy
        // guarantee, that is not a requirement"): reverses the "no
        // deck card ever reaches any viewer, not even its id" rule
        // this same switch case documented above (D23/D7's original
        // design intent). The pile's own TOP card - real id, redacted
        // to a face-down/unowned shape, same shape any other pile's
        // hidden card already renders as - is now included, so it can
        // be a genuine drag source through the exact same generic
        // per-card mechanism (`renderZoneCards`/`onDropCard`/
        // `MOVE_CARD`/`PICKUP`) every other pile's cards already use -
        // no synthetic token, no new reducer action, "the same
        // mechanism as all other piles" as directly requested. Only
        // the top card (`slice(0, 1)`) - "I should only see 1 card" -
        // the rest of the deck's order/contents still never leaves
        // this function.
        {
          const topCard = pile.cards[0];
          const cards = topCard ? [{ id: topCard.id, faceDown: true }] : [];
          zones.push({ id: pile.id, name: pile.name, ownerId: pile.ownerId ?? null, kind: pile.kind, zoneId: pile.zoneId, cards, count: pile.cards.length });
        }
        break;
      }
      case 'in-hand': {
        if (pile.ownerId === playerId) myHand = pile.cards;
        else otherHandCounts[pile.ownerId] = pile.cards.length;
        // UX follow-up (direct user request): the D17 personal seat zone
        // is retired - a hand pile is now ALSO a real seat-zone entry
        // (`ui.js` renders every entry here as a `<zone-panel>`), so it
        // needs an ownerId'd `zones` entry too, same as the `myHand`/
        // `otherHandCounts` fields above still carry for every other
        // consumer. *nit (2026-08-26): `HandPile.redactCard` now
        // actually redacts (needs the PILE, not just the card, to know
        // whose hand this is - a hand card carries no per-card `owner`
        // field of its own) - the long-disclosed gap where this sent
        // every OTHER player's real cards here too is fixed.
        zones.push({
          id: pile.id,
          name: pile.name,
          ownerId: pile.ownerId ?? null,
          kind: pile.kind,
          zoneId: pile.zoneId,
          cards: pile.cards.map((card) => PILE_TYPES[pile.kind].redactCard(card, playerId, pile)),
        });
        break;
      }
      case 'mixed': {
        zones.push({
          id: pile.id,
          name: pile.name,
          ownerId: pile.ownerId ?? null,
          // D45: the view carries `kind` now - D42 deliberately left it
          // out because nothing needed it with only one 'mixed' type in
          // existence; `discardPile` (also 'mixed') is the second, and
          // `ui.js` needs it to pick FAN vs. STACK drop behavior
          // (dropRuleFor(kind)) instead of assuming every zone is a fan.
          kind: pile.kind,
          zoneId: pile.zoneId,
          // D42: `redactMiddleCard` moved to `PILE_TYPES.zone.redactCard`
          // - dispatched by `pile.kind` rather than hardcoded to zone,
          // so a future 'mixed'-visibility pile type redacts through
          // its own rule, not zone's by accident.
          cards: pile.cards.map((card) => PILE_TYPES[pile.kind].redactCard(card, playerId)),
        });
        break;
      }
    }
  }

  return {
    myHand, otherHandCounts, zones, deckCount, players: state.players, scores: state.scores,
    // D55: the real Zone registry (`{id, name, ownerId}`), named
    // `zoneRecords` here specifically to avoid colliding with `zones`
    // above (the per-pile view array) - `ui.js`'s `renderZones` groups
    // that array by each entry's own `zoneId` and looks up its Zone's
    // name/owner here, instead of re-deriving the grouping itself.
    zoneRecords: state.zones,
    // D50: only `allowsPlayerZones`, not the whole `GameConfig` object -
    // it's the only field any client-side rendering needs today, and
    // `?? true` mirrors CREATE_ZONE's own `state.gameConfig?.allowsPlayerZones
    // === false` default (a pre-D46 restored snapshot has no `gameConfig`
    // at all, and must default to "allowed" the same way here as there).
    gameConfig: { allowsPlayerZones: state.gameConfig?.allowsPlayerZones ?? true },
  };
}
