/**
 * The pile-type registry (D42, Sprint 13/US-47) - `pile.kind` dispatches
 * here instead of being switched on as a string across state.js,
 * pileActions.js, and ui.js. `discard` (D45, Sprint 15) is the proof:
 * one new module, one new entry, zero lines changed in `deckPile.js`/
 * `handPile.js`/`zonePile.js`. A Run/Set type later is the same shape.
 */
import * as deck from './deckPile.js';
import * as hand from './handPile.js';
import * as zone from './zonePile.js';
import * as discard from './discardPile.js';
import * as foundation from './foundationPile.js';
import * as cascade from './cascadePile.js';
import * as rankAdjacent from './rankAdjacentPile.js';

export const PILE_TYPES = { deck, hand, zone, discard, foundation, cascade, rankAdjacent };
