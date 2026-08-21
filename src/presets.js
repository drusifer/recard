/**
 * Static, client-side game presets (US-15, ARCHITECTURE.md D10). Purely
 * a convenience lookup that prefills the existing deck-config (US-3) and
 * cards-per-player (US-4) fields — no server/state concept, and no
 * enforcement: the host can still change any value before dealing.
 *
 * `usesMiddle` flags presets whose usual play depends on the face-down/
 * private middle-zone mechanics (D7/D8, US-12/13/14) — informational for
 * the UI (e.g. to explain why Hold'em plays differently), not a hard gate.
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
 */
export const PRESETS = [
  {
    name: 'War',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 26,
    usesMiddle: false,
  },
  {
    name: 'Gin Rummy',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 10,
    usesMiddle: false,
  },
  {
    name: 'Hearts',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 13,
    usesMiddle: false,
  },
  {
    name: 'Poker — 5 Card Draw',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 5,
    usesMiddle: false,
  },
  {
    name: "Texas Hold'em",
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 2,
    usesMiddle: true,
  },
  {
    name: 'Pinochle',
    type: 'pinochle',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 12,
    usesMiddle: false,
  },
];
