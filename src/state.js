import { buildDeck, shuffle } from './deck.js';

const DEFAULT_ZONE_ID = 'table';

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
    deck: shuffle(buildDeck(deckConfig), rng),
    hands: {},
    zones: [{ id: DEFAULT_ZONE_ID, name: 'Table', ownerId: null, cards: [] }],
    players: [],
    scores: {},
    passed: {},
  };
}

/**
 * Round-robin deals `cardsPerPlayer` cards from `deck` into `existingHands`
 * (which may already contain cards, per D15's `DEAL_MORE` - this is the
 * shared logic behind both `DEAL` and `DEAL_MORE`, differing only in
 * whether the caller passes empty or existing hands).
 */
function dealCards(players, deck, cardsPerPlayer, existingHands) {
  const totalNeeded = cardsPerPlayer * players.length;
  if (totalNeeded > deck.length) {
    throw new Error(
      `Cannot deal ${cardsPerPlayer} cards to ${players.length} players: only ${deck.length} left`,
    );
  }
  const hands = { ...existingHands };
  const remaining = [...deck];
  for (let round = 0; round < cardsPerPlayer; round++) {
    for (const player of players) {
      hands[player.id] = [...(hands[player.id] ?? []), remaining.shift()];
    }
  }
  return { deck: remaining, hands };
}

/**
 * D17: shared zone-construction logic for both `CREATE_ZONE` and the
 * personal zone `JOIN` auto-creates - a personal zone is an ordinary
 * zone, just with `ownerId` set (used for UI seat placement only; every
 * reducer case treats it like any other zone).
 */
function makeZone(name, ownerId = null) {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `zone-${Date.now()}-${Math.random()}`;
  return { id, name, ownerId, cards: [] };
}

/**
 * D12: card ids are globally unique (assigned once per physical card by
 * deck.js), so a card can be located across every zone without the
 * caller needing to know which zone it's in.
 */
function findZoneAndCard(zones, cardId) {
  for (const zone of zones) {
    const card = zone.cards.find((c) => c.id === cardId);
    if (card) return { zoneId: zone.id, card };
  }
  return null;
}

/**
 * Maps a US-12 visibility choice to the `{owner, faceUp}` pair stored on
 * a middle-zone card, per ARCHITECTURE.md D7.
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
      const alreadyHasPersonalZone = state.zones.some((z) => z.ownerId === action.playerId);
      return {
        ...state,
        players: [
          ...state.players.filter((p) => p.id !== action.playerId),
          { id: action.playerId, name: action.name, connection: 'connected' },
        ],
        zones: alreadyHasPersonalZone ? state.zones : [...state.zones, makeZone(action.name, action.playerId)],
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

    case 'DEAL': {
      const hands = {};
      for (const player of state.players) hands[player.id] = [];
      const { deck, hands: dealt } = dealCards(state.players, state.deck, action.cardsPerPlayer, hands);
      return { ...state, deck, hands: dealt };
    }

    case 'DEAL_MORE': {
      const { deck, hands } = dealCards(state.players, state.deck, action.cardsPerPlayer, state.hands);
      return { ...state, deck, hands };
    }

    case 'CREATE_ZONE':
      return { ...state, zones: [...state.zones, makeZone(action.name)] };

    case 'PLAY': {
      const hand = state.hands[action.playerId] ?? [];
      const card = hand.find((c) => c.id === action.cardId);
      if (!card) {
        throw new Error(`Card ${action.cardId} is not in ${action.playerId}'s hand`);
      }
      const zoneId = action.zoneId ?? DEFAULT_ZONE_ID;
      if (!state.zones.some((z) => z.id === zoneId)) {
        throw new Error(`Zone ${zoneId} does not exist`);
      }
      const { owner, faceUp } = middleCardVisibility(action.visibility ?? 'public', action.playerId);
      return {
        ...state,
        hands: {
          ...state.hands,
          [action.playerId]: hand.filter((c) => c.id !== action.cardId),
        },
        zones: state.zones.map((z) =>
          z.id === zoneId ? { ...z, cards: [...z.cards, { ...card, owner, faceUp }] } : z,
        ),
      };
    }

    case 'REVEAL': {
      const found = findZoneAndCard(state.zones, action.cardId);
      if (!found) {
        throw new Error(`Card ${action.cardId} is not in any zone`);
      }
      const { zoneId, card } = found;
      if (card.faceUp) return state;
      if (card.owner !== null && card.owner !== action.playerId) {
        throw new Error(`Player ${action.playerId} is not authorized to reveal ${action.cardId}`);
      }
      return {
        ...state,
        zones: state.zones.map((z) =>
          z.id === zoneId
            ? { ...z, cards: z.cards.map((c) => (c.id === action.cardId ? { ...c, faceUp: true } : c)) }
            : z,
        ),
      };
    }

    case 'PICKUP': {
      const found = findZoneAndCard(state.zones, action.cardId);
      if (!found) {
        throw new Error(`Card ${action.cardId} is not in any zone`);
      }
      const { zoneId, card } = found;
      if (!card.faceUp) {
        throw new Error(`Cannot pick up a face-down card: ${action.cardId}`);
      }
      const { owner, faceUp, ...plainCard } = card;
      const hand = state.hands[action.playerId] ?? [];
      return {
        ...state,
        zones: state.zones.map((z) =>
          z.id === zoneId ? { ...z, cards: z.cards.filter((c) => c.id !== action.cardId) } : z,
        ),
        hands: { ...state.hands, [action.playerId]: [...hand, plainCard] },
      };
    }

    case 'MOVE_CARD': {
      const found = findZoneAndCard(state.zones, action.cardId);
      if (!found) {
        throw new Error(`Card ${action.cardId} is not in any zone`);
      }
      if (!state.zones.some((z) => z.id === action.toZoneId)) {
        throw new Error(`Zone ${action.toZoneId} does not exist`);
      }
      const { zoneId: fromZoneId, card } = found;
      if (fromZoneId === action.toZoneId) return state;
      if (!card.faceUp && card.owner !== null && card.owner !== action.playerId) {
        throw new Error(`Player ${action.playerId} is not authorized to move ${action.cardId}`);
      }
      return {
        ...state,
        zones: state.zones.map((z) => {
          if (z.id === fromZoneId) return { ...z, cards: z.cards.filter((c) => c.id !== action.cardId) };
          if (z.id === action.toZoneId) return { ...z, cards: [...z.cards, card] };
          return z;
        }),
      };
    }

    case 'DRAW': {
      if (state.deck.length === 0) {
        throw new Error('Cannot draw: deck is empty');
      }
      const [card, ...rest] = state.deck;
      const hand = state.hands[action.playerId] ?? [];
      return {
        ...state,
        deck: rest,
        hands: { ...state.hands, [action.playerId]: [...hand, card] },
      };
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
        deck: shuffle(buildDeck(state.deckConfig), rng),
        hands: {},
        // Zone structure (player-created zones included) survives a
        // reset - only the cards inside each zone clear. A round reset
        // shouldn't force players to recreate their table layout.
        zones: state.zones.map((z) => ({ ...z, cards: [] })),
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
 * @param {ReturnType<typeof createInitialState>} state
 * @param {string} playerId
 */
export function viewFor(state, playerId) {
  const otherHandCounts = {};
  for (const [id, hand] of Object.entries(state.hands)) {
    if (id !== playerId) otherHandCounts[id] = hand.length;
  }
  const zones = state.zones.map((z) => ({
    id: z.id,
    name: z.name,
    ownerId: z.ownerId ?? null,
    cards: z.cards.map((card) => redactMiddleCard(card, playerId)),
  }));
  return {
    myHand: state.hands[playerId] ?? [],
    otherHandCounts,
    zones,
    deckCount: state.deck.length,
    players: state.players,
    scores: state.scores,
    passed: state.passed,
  };
}

/**
 * D7: a viewer sees a middle card's identity if it's face-up, or they own
 * it. Otherwise they see only that it exists and (if applicable) whose it
 * is — never its rank/suit.
 */
function redactMiddleCard(card, viewerId) {
  if (card.faceUp || card.owner === viewerId) return card;
  return { id: card.id, owner: card.owner, faceDown: true };
}
