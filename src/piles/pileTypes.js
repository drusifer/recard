/**
 * The pile-type registry (D42, Sprint 13/US-47) - `pile.kind` dispatches
 * here instead of being switched on as a string across state.js,
 * pileActions.js, and ui.js. Adding a Discard/Run/Set type (D38, later
 * sprint) means adding one more module and one more entry, not another
 * `case` scattered through three files.
 */
import * as deck from './deckPile.js';
import * as hand from './handPile.js';
import * as zone from './zonePile.js';

export const PILE_TYPES = { deck, hand, zone };
