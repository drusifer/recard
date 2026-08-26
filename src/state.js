import { buildDeck, shuffle } from './deck.js';
import { PILE_TYPES } from './piles/pileTypes.js';

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

/** The visibility rule a pile follows, derived from its type (D23/D42). */
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
function configuredZoneName(kind, index, count) {
  const capitalized = kind.charAt(0).toUpperCase() + kind.slice(1);
  return count > 1 ? `${capitalized} ${index + 1}` : capitalized;
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
function buildPiles(pileDecls, zoneRegistry) {
  const piles = [];
  let zones = zoneRegistry;
  for (const { kind, ownerId, count = 1, zoneId: declaredZoneId } of pileDecls) {
    if (ownerId === 'perPlayer') continue;
    for (let i = 0; i < count; i++) {
      const id = configuredZoneId(kind, i, count);
      if (declaredZoneId && !zones.some((z) => z.id === declaredZoneId)) {
        throw new Error(`GameConfig.piles: "${id}" declares zoneId "${declaredZoneId}", but no such Zone is declared in GameConfig.zones`);
      }
      const zoneId = declaredZoneId ?? id;
      piles.push(makeTableSidePile(kind, configuredZoneName(kind, i, count), null, id, zoneId));
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
  const pileDecls = gameConfig.piles ?? [];
  const zoneDecls = gameConfig.zones ?? [];

  // D55: the real Zone registry - the always-present Table Zone, plus
  // whatever Zone entities this game's own `GameConfig.zones` declares
  // (`{id, name, type}`). Every pile declaration's own `zoneId` (below)
  // is validated against exactly this list - nothing implicit.
  let zoneRegistry = ensureZoneRecord([], TABLE_ZONE_RECORD.id, TABLE_ZONE_RECORD.name, TABLE_ZONE_RECORD.ownerId, TABLE_ZONE_RECORD.type);
  for (const z of zoneDecls) zoneRegistry = ensureZoneRecord(zoneRegistry, z.id, z.name ?? null, null, z.type ?? 'shared');

  const built = buildPiles(pileDecls, zoneRegistry);

  return {
    deckConfig,
    gameConfig: { allowsPlayerZones: gameConfig.allowsPlayerZones ?? true, piles: pileDecls, zones: zoneDecls },
    zones: built.zones,
    piles: [
      makeDeckPile(deckConfig, rng, TABLE_ZONE_ID),
      makePile('zone', { id: DEFAULT_ZONE_ID, name: 'Table', zoneId: TABLE_ZONE_ID }),
      ...built.piles,
    ],
    players: [],
    scores: {},
    passed: {},
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

/** One player's hand. Empty (not undefined) if they have no hand pile yet. */
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
    for (let i = 0; i < destinationCount && remaining.length > 0; i++) {
      dealt[i].push(remaining.shift());
    }
  }
  return { remaining, dealt };
}

/** The subset of an action describing where/how a dropped card lands (D21). */
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
    case 'public':
      return { owner: null, faceUp: true };
    case 'shared-facedown':
      return { owner: null, faceUp: false };
    case 'private-facedown':
      return { owner: playerId, faceUp: false };
    default:
      throw new Error(`Unknown visibility: ${visibility}`);
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
            Array.from({ length: count }, (_, i) =>
              makeTableSidePile(
                kind, `${action.name}'s ${configuredZoneName(kind, i, count)}`, action.playerId,
                configuredZoneId(kind, i, count, action.playerId),
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
      passed: { [action.playerId]: false, ...state.passed },
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
    const fresh = action.type === 'DEAL';
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
      if (index === -1) return fresh ? withCards(p, []) : p;
      return withCards(p, [...(fresh ? [] : p.cards), ...dealt[index]]);
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
    const pile = makeTableSidePile(kind, action.name);
    return {
      ...state,
      piles: [...state.piles, pile],
      zones: ensureZoneRecord(state.zones, pile.zoneId),
    };
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
    // Smith's ruling (Sprint 23 Gate 1): only `zone`/`discard` piles are
    // eligible to move at all. `deck`/`hand`/`foundation`/`cascade`/
    // `rankAdjacent` are all rejected - `deck` explicitly, beyond what
    // `tableSide` alone would allow, because `state.js` finds THE deck
    // by fixed id (`DECK_PILE_ID`) elsewhere, not by searching zones.
    if (pile.kind !== 'zone' && pile.kind !== 'discard') {
      throw new Error(`Cannot move a "${pile.kind}" pile between zones`);
    }

    // No target, or a falsy one: "ungroup" - a fresh, standalone Zone
    // of this pile's own, per Smith's Gate 2 note. Every table-side
    // pile belongs to exactly one Zone always; there is no null/no-zone
    // state to fall back to.
    let targetZoneId = action.targetZoneId;
    let zones = state.zones;
    if (targetZoneId) {
      if (!zones.some((z) => z.id === targetZoneId)) {
        throw new Error(`Zone ${targetZoneId} does not exist`);
      }
    } else {
      targetZoneId = pile.id;
      zones = ensureZoneRecord(zones, targetZoneId);
    }

    return {
      ...state,
      zones,
      piles: state.piles.map((p) => (p.id === action.pileId ? { ...p, zoneId: targetZoneId } : p)),
    };
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
    const isHidden = (card) => card.faceDown === true || card.faceUp === false;
    if (pile.cards.some(isHidden)) {
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
    if (!Number.isInteger(pileCount) || pileCount < 2) {
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
    const piles = dealt.map((cards, i) => withCards(makeTableSidePile('deck', `Pile ${i + 1}`), cards));
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
    if (!zonesOf(state).some((z) => z.id === zoneId)) {
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
    if (!zonesOf(state).some((z) => z.id === action.toZoneId)) {
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
    if (action.delta !== 1 && action.delta !== -1) {
      throw new Error(`Score delta must be +1 or -1, got ${action.delta}`);
    }
    const current = state.scores[action.targetPlayerId] ?? 0;
    return {
      ...state,
      scores: { ...state.scores, [action.targetPlayerId]: current + action.delta },
    };
  },

  TOGGLE_PASS(state, action) {
    const current = state.passed[action.playerId] ?? false;
    return { ...state, passed: { ...state.passed, [action.playerId]: !current } };
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
      // Passing is round-scoped (D16, unlike scores) - explicitly
      // rezeroed here, not left to fall through via `...state`.
      passed: Object.fromEntries(state.players.map((p) => [p.id, false])),
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
      case 'hidden':
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
        zones.push({ id: pile.id, name: pile.name, ownerId: pile.ownerId ?? null, kind: pile.kind, zoneId: pile.zoneId, cards: [], count: pile.cards.length });
        break;
      case 'in-hand':
        if (pile.ownerId === playerId) myHand = pile.cards;
        else otherHandCounts[pile.ownerId] = pile.cards.length;
        // UX follow-up (direct user request): the D17 personal seat zone
        // is retired - a hand pile is now ALSO a real seat-zone entry
        // (`ui.js` renders every entry here as a `<zone-panel>`), so it
        // needs an ownerId'd `zones` entry too, same as the `myHand`/
        // `otherHandCounts` fields above still carry for every other
        // consumer. NOTE (flagged, not yet done): `PILE_TYPES.hand.
        // redactCard` is still a no-op, so this currently sends every
        // OTHER player's real cards here too - a deliberate, temporary
        // gap. Direct instruction was to get this rendering working
        // first and fix the actual hiding as a following step.
        zones.push({
          id: pile.id,
          name: pile.name,
          ownerId: pile.ownerId ?? null,
          kind: pile.kind,
          zoneId: pile.zoneId,
          cards: pile.cards.map((card) => PILE_TYPES[pile.kind].redactCard(card, playerId)),
        });
        break;
      case 'mixed':
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

  return {
    myHand, otherHandCounts, zones, deckCount, players: state.players, scores: state.scores, passed: state.passed,
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
