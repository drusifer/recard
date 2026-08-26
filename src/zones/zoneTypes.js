/**
 * The Zone-type registry (D55, Sprint 23) - `zone.type` dispatches here
 * instead of `ui.js` branching on whether a Zone record's `ownerId`
 * happens to be truthy. Mirrors `PILE_TYPES` (D42): one module per
 * type, each owning its own default-positioning/class behavior.
 */
import * as shared from './sharedZone.js';
import * as perPlayer from './perPlayerZone.js';

export const ZONE_TYPES = { shared, perPlayer };
