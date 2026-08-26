/**
 * The `shared` Zone type (D56 - real subclass, was `sharedZone.js`'s
 * flat module). One box, not tied to any particular player - the Table
 * Zone, every standalone `CREATE_ZONE`'d/preset-declared zone. Nothing
 * to override - the base `Zone` class's defaults (no className, no
 * default position, falls into normal flex flow) already describe it
 * exactly; this class exists so `zoneTypes.js`'s registry has a real,
 * named entry per D55's `type` field rather than pointing `'shared'`
 * straight at the base class.
 */
import { Zone } from './Zone.js';

export class SharedZone extends Zone {}
