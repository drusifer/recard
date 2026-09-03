/**
 * The deck-type registry (D47, Sprint 17) - `deckConfig.type` dispatches
 * here instead of `deck.js` growing a `switch`. Same shape as `PILE_TYPES`
 * (D42) and `ACTIONS` (D44): a new deck type is one new module and one
 * new entry.
 */
import * as standard from './standardDeck.js';
import * as pinochle from './pinochleDeck.js';
import * as rtg from './rtgDeck.js';
// Sprint pileObjects (US-105): a chip supply is a deck of chips, which
// is what lets a preset stock one through the existing `deckList` path
// with no reducer change at all (D107).
import * as chips from './chipDeck.js';

export const DECK_TYPES = { standard, pinochle, rtg, chips };
