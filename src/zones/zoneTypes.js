/**
 * The Zone-type registry (D55, D56) - `zone.type` dispatches here
 * instead of `ui.js` branching on whether a Zone record's `ownerId`
 * happens to be truthy. Mirrors `PILE_TYPES`: maps each `type` string
 * to its real class (`extends Zone`).
 */
import { SharedZone } from './SharedZone.js';
import { PerPlayerZone } from './PerPlayerZone.js';

export const ZONE_TYPES = { shared: SharedZone, perPlayer: PerPlayerZone };
