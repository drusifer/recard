import { buildDeck, shuffle } from './deck.js';

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
    table: [],
    players: [],
    scores: {},
  };
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
    case 'JOIN':
      return {
        ...state,
        players: [
          ...state.players.filter((p) => p.id !== action.playerId),
          { id: action.playerId, name: action.name, connection: 'connected' },
        ],
        scores: { [action.playerId]: 0, ...state.scores },
      };

    case 'SET_CONNECTION':
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, connection: action.connection } : p,
        ),
      };

    case 'DEAL': {
      const hands = { ...state.hands };
      let deck = [...state.deck];
      const totalNeeded = action.cardsPerPlayer * state.players.length;
      if (totalNeeded > deck.length) {
        throw new Error(
          `Cannot deal ${action.cardsPerPlayer} cards to ${state.players.length} players: only ${deck.length} left`,
        );
      }
      for (const player of state.players) hands[player.id] = [];
      for (let round = 0; round < action.cardsPerPlayer; round++) {
        for (const player of state.players) {
          hands[player.id] = [...hands[player.id], deck.shift()];
        }
      }
      return { ...state, deck, hands };
    }

    case 'PLAY': {
      const hand = state.hands[action.playerId] ?? [];
      const card = hand.find((c) => c.id === action.cardId);
      if (!card) {
        throw new Error(`Card ${action.cardId} is not in ${action.playerId}'s hand`);
      }
      const { owner, faceUp } = middleCardVisibility(action.visibility ?? 'public', action.playerId);
      return {
        ...state,
        hands: {
          ...state.hands,
          [action.playerId]: hand.filter((c) => c.id !== action.cardId),
        },
        table: [...state.table, { ...card, owner, faceUp }],
      };
    }

    case 'REVEAL': {
      const card = state.table.find((c) => c.id === action.cardId);
      if (!card) {
        throw new Error(`Card ${action.cardId} is not in the middle`);
      }
      if (card.faceUp) return state;
      if (card.owner !== null && card.owner !== action.playerId) {
        throw new Error(`Player ${action.playerId} is not authorized to reveal ${action.cardId}`);
      }
      return {
        ...state,
        table: state.table.map((c) => (c.id === action.cardId ? { ...c, faceUp: true } : c)),
      };
    }

    case 'PICKUP': {
      const card = state.table.find((c) => c.id === action.cardId);
      if (!card) {
        throw new Error(`Card ${action.cardId} is not in the middle`);
      }
      if (!card.faceUp) {
        throw new Error(`Cannot pick up a face-down card: ${action.cardId}`);
      }
      const { owner, faceUp, ...plainCard } = card;
      const hand = state.hands[action.playerId] ?? [];
      return {
        ...state,
        table: state.table.filter((c) => c.id !== action.cardId),
        hands: { ...state.hands, [action.playerId]: [...hand, plainCard] },
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
        table: [],
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
  return {
    myHand: state.hands[playerId] ?? [],
    otherHandCounts,
    table: state.table.map((card) => redactMiddleCard(card, playerId)),
    deckCount: state.deck.length,
    players: state.players,
    scores: state.scores,
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
