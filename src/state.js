import { buildDeck, shuffle } from './deck.js';
import { PILE_TYPES } from './piles/pileTypes.js';

const DEFAULT_ZONE_ID = 'table';
const DECK_PILE_ID = 'deck';

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

function makePile(kind, { id, name, ownerId = null, cards = [] }) {
  return { id, kind, name, ownerId, cards };
}

/**
 * D17 (generalized by D23): shared pile-construction for `CREATE_ZONE`,
 * `JOIN`'s auto-created personal zone, and `SPLIT_DECK`'s piles — a
 * personal zone is an ordinary zone pile, just with `ownerId` set (used
 * for UI seat placement only; every reducer treats it like any other).
 */
function makeZonePile(name, ownerId = null) {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `zone-${Date.now()}-${Math.random()}`;
  return makePile('zone', { id, name, ownerId });
}

function makeDeckPile(deckConfig, rng) {
  return makePile('deck', { id: DECK_PILE_ID, name: 'Deck', cards: shuffle(buildDeck(deckConfig), rng) });
}

/**
 * Host-authoritative game state. This is the single source of truth per
 * ARCHITECTURE.md D3 — only the host runs `reduce`; other clients send
 * action requests and render from the state/view messages the host sends
 * back.
 * @param {{numDecks?: number, jokers?: number}} deckConfig
 * @param {() => number} [rng]
 */
export function createInitialState(deckConfig = {}, rng = Math.random) {
  return {
    deckConfig,
    piles: [
      makeDeckPile(deckConfig, rng),
      makePile('zone', { id: DEFAULT_ZONE_ID, name: 'Table' }),
    ],
    players: [],
    scores: {},
    passed: {},
  };
}

// --- Selectors (D23) -------------------------------------------------
// The reducer and its tests read piles through these rather than
// indexing `state.piles` by hand, so "which pile kind am I looking at"
// is stated once here instead of re-derived at every call site.

/** The draw stock's cards. */
export function deckOf(state) {
  return state.piles.find((p) => p.kind === 'deck').cards;
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

/** Every table/shared/personal pile, in creation order. */
export function zonesOf(state) {
  return state.piles.filter((p) => p.kind === 'zone');
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

/**
 * D21: `layout` describes how a card renders *relative to whatever
 * immediately precedes it* in its zone — `'stack'` (tight pile, corner
 * peek), `'overlap'` (fanned, every card still readable), or absent
 * (normal flat spacing). Passing no layout strips any stale one, which
 * is what makes dragging a card back out to open space un-stack it.
 */
function withLayout(card, layout) {
  const { layout: _previous, ...rest } = card;
  return layout ? { ...rest, layout } : rest;
}

/**
 * D21: places `card` into a zone's `cards`, honoring an optional
 * "drop relative to an existing card" request. One helper so `PLAY` and
 * `MOVE_CARD` can't drift apart on placement or on the layout rule.
 *
 * **Smith's Gate 2 rule, implemented in one place:** `layout` always
 * belongs to whichever card of the newly-adjacent pair ends up *second*.
 * Dropping after the target, that's the dropped card; dropping before
 * it, the dropped card becomes the target's new predecessor, so it is
 * the **target** that now sits second and carries the layout. Getting
 * this backwards would visually join the wrong pair of cards.
 */
function placeCard(cards, card, { targetCardId, side = 'after', layout } = {}) {
  if (!targetCardId) return [...cards, withLayout(card, layout)];

  const index = cards.findIndex((c) => c.id === targetCardId);
  if (index === -1) {
    throw new Error(`Target card ${targetCardId} is not in the destination zone`);
  }

  if (side === 'before') {
    const placed = [...cards.slice(0, index), withLayout(card, null), ...cards.slice(index)];
    return placed.map((c) => (c.id === targetCardId ? withLayout(c, layout) : c));
  }
  return [...cards.slice(0, index + 1), withLayout(card, layout), ...cards.slice(index + 1)];
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
 * @param {ReturnType<typeof createInitialState>} state
 * @param {{type: string, [key: string]: any}} action
 */
export function reduce(state, action) {
  switch (action.type) {
    case 'JOIN': {
      // D17: a returning player (SET_CONNECTION reconnect-of-same-id
      // case) already has a personal zone - only create one the first
      // time this playerId is seen, same "preserved on re-join" spirit
      // as scores/passed below.
      const alreadyHasPersonalZone = zonesOf(state).some((z) => z.ownerId === action.playerId);
      return {
        ...state,
        players: [
          ...state.players.filter((p) => p.id !== action.playerId),
          { id: action.playerId, name: action.name, connection: 'connected' },
        ],
        piles: alreadyHasPersonalZone
          ? state.piles
          : [...state.piles, makeZonePile(action.name, action.playerId)],
        scores: { [action.playerId]: 0, ...state.scores },
        passed: { [action.playerId]: false, ...state.passed },
      };
    }

    case 'SET_CONNECTION':
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, connection: action.connection } : p,
        ),
      };

    case 'DEAL':
    case 'DEAL_MORE': {
      // D15: identical distribution, differing only in whether existing
      // hands are cleared first. Post-D23 that difference is one flag on
      // otherwise-shared code, not two separate call paths.
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
        if (p.kind === 'deck') return withCards(p, remaining);
        if (p.kind !== 'hand') return p;
        const index = players.findIndex((pl) => pl.id === p.ownerId);
        if (index === -1) return fresh ? withCards(p, []) : p;
        return withCards(p, [...(fresh ? [] : p.cards), ...dealt[index]]);
      });
      return { ...state, piles };
    }

    case 'CREATE_ZONE':
      return { ...state, piles: [...state.piles, makeZonePile(action.name)] };

    case 'SHUFFLE_DECK': {
      // D22/US-35: reorders the stock and nothing else - the one thing
      // `RESET` can't do, since it also rebuilds the deck and wipes
      // hands/zones/pass markers. Everything else flows through
      // untouched via the spread, so there's no field to forget.
      const rng = action.rng ?? Math.random;
      return replacePile(state, DECK_PILE_ID, (deck) => withCards(deck, shuffle(deck.cards, rng)));
    }

    case 'SPLIT_DECK': {
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
      const piles = dealt.map((cards, i) => {
        const pile = makeZonePile(`Pile ${i + 1}`);
        // Face-down and unowned: a draw pile hidden from everyone, which
        // is the redaction case D7 already covers - no new privacy rule.
        // Every card after the first carries D21's `stack` layout, so a
        // pile renders as an actual pile rather than N loose card-backs
        // each with its own controls. This is exactly what the layout
        // field is for - no new rendering concept, just reuse.
        return withCards(pile, cards.map((card, i) => ({
          ...card, owner: null, faceUp: false, ...(i > 0 ? { layout: 'stack' } : {}),
        })));
      });
      // D24 invariant: the deck pile stays, now empty. Removing it would
      // break every later DRAW/DEAL with an opaque undefined error.
      return {
        ...state,
        piles: [...state.piles.map((p) => (p.kind === 'deck' ? withCards(p, remaining) : p)), ...piles],
      };
    }

    case 'PLAY': {
      const hand = handOf(state, action.playerId);
      const card = hand.find((c) => c.id === action.cardId);
      if (!card) {
        throw new Error(`Card ${action.cardId} is not in ${action.playerId}'s hand`);
      }
      const zoneId = action.zoneId ?? DEFAULT_ZONE_ID;
      if (!zonesOf(state).some((z) => z.id === zoneId)) {
        throw new Error(`Zone ${zoneId} does not exist`);
      }
      const { owner, faceUp } = middleCardVisibility(action.visibility ?? 'public', action.playerId);
      return {
        ...state,
        piles: state.piles.map((p) => {
          if (p.kind === 'hand' && p.ownerId === action.playerId) {
            return withCards(p, p.cards.filter((c) => c.id !== action.cardId));
          }
          if (p.id === zoneId) {
            return withCards(p, placeCard(p.cards, { ...card, owner, faceUp }, placementOf(action)));
          }
          return p;
        }),
      };
    }

    case 'REVEAL': {
      const found = findZoneAndCard(state, action.cardId);
      if (!found) {
        throw new Error(`Card ${action.cardId} is not in any zone`);
      }
      const { zoneId, card } = found;
      if (card.faceUp) return state;
      if (card.owner !== null && card.owner !== action.playerId) {
        throw new Error(`Player ${action.playerId} is not authorized to reveal ${action.cardId}`);
      }
      return replacePile(state, zoneId, (z) =>
        withCards(z, z.cards.map((c) => (c.id === action.cardId ? { ...c, faceUp: true } : c))),
      );
    }

    case 'PICKUP': {
      const found = findZoneAndCard(state, action.cardId);
      if (!found) {
        throw new Error(`Card ${action.cardId} is not in any zone`);
      }
      const { zoneId, card } = found;
      if (!card.faceUp) {
        throw new Error(`Cannot pick up a face-down card: ${action.cardId}`);
      }
      // A hand pile's cards are plain - its own `kind`/`ownerId` already
      // carry the visibility rule (D23), so the zone-only D7 fields come
      // back off on the way in. `layout` (D21) is zone-only for the same
      // reason: a hand has no adjacency rendering to describe.
      const { owner, faceUp, layout, ...plainCard } = card;
      const piles = ensureHandPile(state.piles, action.playerId).map((p) => {
        if (p.id === zoneId) return withCards(p, p.cards.filter((c) => c.id !== action.cardId));
        if (p.kind === 'hand' && p.ownerId === action.playerId) {
          return withCards(p, [...p.cards, plainCard]);
        }
        return p;
      });
      return { ...state, piles };
    }

    case 'MOVE_CARD': {
      const found = findZoneAndCard(state, action.cardId);
      if (!found) {
        throw new Error(`Card ${action.cardId} is not in any zone`);
      }
      if (!zonesOf(state).some((z) => z.id === action.toZoneId)) {
        throw new Error(`Zone ${action.toZoneId} does not exist`);
      }
      const { zoneId: fromZoneId, card } = found;
      if (!card.faceUp && card.owner !== null && card.owner !== action.playerId) {
        throw new Error(`Player ${action.playerId} is not authorized to move ${action.cardId}`);
      }
      // D21: no same-zone early return any more — a move within one zone
      // is now a real reorder. Removing first and inserting second means
      // the same-zone and cross-zone cases share one code path, and
      // index math is computed against the array the card has already
      // left (otherwise inserting relative to a card that sits after the
      // moved one would be off by one).
      const withoutCard = state.piles.map((p) =>
        p.id === fromZoneId ? withCards(p, p.cards.filter((c) => c.id !== action.cardId)) : p,
      );
      return {
        ...state,
        piles: withoutCard.map((p) =>
          p.id === action.toZoneId ? withCards(p, placeCard(p.cards, card, placementOf(action))) : p,
        ),
      };
    }

    case 'DRAW': {
      const deck = deckOf(state);
      if (deck.length === 0) {
        throw new Error('Cannot draw: deck is empty');
      }
      const [card, ...rest] = deck;
      const piles = ensureHandPile(state.piles, action.playerId).map((p) => {
        if (p.kind === 'deck') return withCards(p, rest);
        if (p.kind === 'hand' && p.ownerId === action.playerId) {
          return withCards(p, [...p.cards, card]);
        }
        return p;
      });
      return { ...state, piles };
    }

    case 'ADJUST_SCORE': {
      if (action.delta !== 1 && action.delta !== -1) {
        throw new Error(`Score delta must be +1 or -1, got ${action.delta}`);
      }
      const current = state.scores[action.targetPlayerId] ?? 0;
      return {
        ...state,
        scores: { ...state.scores, [action.targetPlayerId]: current + action.delta },
      };
    }

    case 'TOGGLE_PASS': {
      const current = state.passed[action.playerId] ?? false;
      return { ...state, passed: { ...state.passed, [action.playerId]: !current } };
    }

    case 'RESET_SCORES': {
      const scores = {};
      for (const player of state.players) scores[player.id] = 0;
      return { ...state, scores };
    }

    case 'RESET': {
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
          ...zonesOf(state).map((z) => withCards(z, [])),
        ],
        // Passing is round-scoped (D16, unlike scores) - explicitly
        // rezeroed here, not left to fall through via `...state`.
        passed: Object.fromEntries(state.players.map((p) => [p.id, false])),
      };
    }

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
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
        deckCount = pile.cards.length;
        break;
      case 'in-hand':
        if (pile.ownerId === playerId) myHand = pile.cards;
        else otherHandCounts[pile.ownerId] = pile.cards.length;
        break;
      case 'mixed':
        zones.push({
          id: pile.id,
          name: pile.name,
          ownerId: pile.ownerId ?? null,
          // D42: `redactMiddleCard` moved to `PILE_TYPES.zone.redactCard`
          // - dispatched by `pile.kind` rather than hardcoded to zone,
          // so a future 'mixed'-visibility pile type redacts through
          // its own rule, not zone's by accident.
          cards: pile.cards.map((card) => PILE_TYPES[pile.kind].redactCard(card, playerId)),
        });
        break;
    }
  }

  return { myHand, otherHandCounts, zones, deckCount, players: state.players, scores: state.scores, passed: state.passed };
}
