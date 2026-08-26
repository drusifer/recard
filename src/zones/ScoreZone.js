/**
 * ScoreZone (D56, placeholder - NOT wired into `zoneTypes.js`/
 * `state.zones` yet). Today's score panel is still the fully separate
 * `<score-zone>` rendering loop in `main.js` (built directly off
 * `view.scores`, outside the Zone/Pile model entirely) - folding it
 * into a real `state.zones` entity is a genuine behavior-surface change
 * to already-working replicated state (wire shape, `SNAPSHOT_VERSION`,
 * host-authoritative creation timing), not a mechanical
 * duplication-removal refactor like the rest of D56's rewrite. Left
 * undone deliberately rather than risking the live score feature
 * without a Smith UX read + live verification pass first - see
 * `docs/ARCHITECTURE.md` D56.
 */
import { PerPlayerZone } from './PerPlayerZone.js';

export class ScoreZone extends PerPlayerZone {
  static contentComponent = 'score-zone';
  // Real integration (state.zones entry per player, main.js wiring onto
  // renderZones instead of its own loop) is future work - not started.
}
