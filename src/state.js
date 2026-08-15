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
  };
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
      return {
        ...state,
        hands: {
          ...state.hands,
          [action.playerId]: hand.filter((c) => c.id !== action.cardId),
        },
        table: [...state.table, card],
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
    table: state.table,
    deckCount: state.deck.length,
    players: state.players,
  };
}
