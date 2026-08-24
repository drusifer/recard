/**
 * Static, client-side game presets (US-15, ARCHITECTURE.md D10). Purely
 * a convenience lookup that prefills the existing deck-config (US-3) and
 * cards-per-player (US-4) fields — no server/state concept, and no
 * enforcement: the host can still change any value before dealing.
 *
 * D49 (Sprint 19): `type` is optional (`'standard'` when absent -
 * every preset above War already relies on that default, unchanged).
 * `allowsPlayerZones` is supported by this same schema (a preset MAY
 * set it) but deliberately not assigned to any preset below - which
 * real games "should" disallow player-added zones is a genuine game-
 * design judgment call this project has no researched basis for making
 * per-preset, and guessing would be exactly the "asserted rather than
 * verified" mistake this project's own retros warn against. The field
 * exists and is wired end-to-end (proven by a direct `state.gameConfig`
 * test, not a preset), ready for whenever a real preset actually needs
 * it.
 *
 * D53 (Sprint 22): `zones` is the same "supported, sparingly used" shape
 * as `allowsPlayerZones` above - `[{kind, ownerId: 'perPlayer'|null,
 * count}]`, additive, defaulting to `[]` when absent (every preset above
 * Solitaire relies on that default unchanged). Solitaire/Spit are the
 * first presets that need a declared starting table (real Pile kinds
 * beyond deck/hand a player would otherwise have to Add Zone manually,
 * N times, before playing at all) - `cardsPerPlayer: 0` on both since
 * neither game deals into a traditional hand; the table itself IS the
 * starting layout. Auto-dealing INTO that layout (Klondike's 28-card
 * triangle deal) is deliberately not built - these presets exist to
 * validate the Pile/Zone primitives (D53), not to be a full solitaire
 * engine; the host draws/moves cards into place same as any other game.
 *
 * Gin Rummy also declares `zones` (a single real `discard`-kind pile) -
 * direct user follow-up to D53: replaces the generic shared Table zone
 * that used to stand in for a discard pile with the real thing, now
 * that a declared pile is one line instead of a manual Add Zone click.
 * One system, not two - no preset keeps relying on the generic zone
 * where a real Pile kind now fits.
 *
 * D53 audit follow-up (retired, not left as dead weight): `usesMiddle`
 * used to flag presets depending on the middle-zone privacy mechanics
 * (D7/D8) landing - grepped `main.js`/`ui.js` and found no reader
 * anywhere; that gate's whole reason for existing (D7/D8 not shipped
 * yet) ended in Sprint 2, over 20 sprints ago. Deleted rather than kept
 * as an always-unread field every preset had to carry.
 */
export const PRESETS = [
  {
    name: 'War',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 26,
  },
  {
    name: 'Gin Rummy',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 10,
    // D53 follow-up: a real discard pile, declared - not the generic
    // shared Table zone standing in for one (which is all this preset
    // had before Sprint 22's Pile/Zone framework existed to do better).
    zones: [{ kind: 'discard', ownerId: null, count: 1 }],
  },
  {
    name: 'Hearts',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 13,
  },
  {
    name: 'Poker — 5 Card Draw',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 5,
  },
  {
    name: "Texas Hold'em",
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 2,
  },
  {
    name: 'Pinochle',
    type: 'pinochle',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 12,
  },
  {
    name: 'Solitaire',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 0,
    zones: [
      { kind: 'foundation', ownerId: null, count: 4 },
      { kind: 'cascade', ownerId: null, count: 7 },
    ],
  },
  {
    name: 'Spit',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 0,
    zones: [
      { kind: 'rankAdjacent', ownerId: null, count: 2 },
      { kind: 'cascade', ownerId: 'perPlayer', count: 1 },
    ],
  },
];
