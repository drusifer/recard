# US-116: New Game (host reconfigures without a new table code)

## Story
As a host mid-table, I want a "New Game" control that lets me pick a
different preset and restart under the SAME game code, so returning
players don't need a new code and I don't have to re-host from scratch.

## Acceptance Criteria
1. A host-only "New Game" control is reachable from the live game
   screen (not just the pre-game host-create form).
2. Selecting it opens the same preset picker used at initial setup
   (preset dropdown, deck-choice checkboxes, cards-per-player preview) -
   without generating a new game code or session.
3. Confirming rebuilds `gameConfig`/`deckConfig` to the newly chosen
   preset: old zones/piles/hands are discarded and the new preset's
   starting layout (tableZone/piles/zones/deck) is built fresh, same
   shape `createInitialState` produces for a brand-new table.
4. Roster and connections are preserved - no player has to rejoin or
   re-enter the code, same continuity `RESET` already gives within a
   game.
5. Scores and chips RESET to the new preset's starting state. This
   differs from Restart Game (US-109's `RESET`, which explicitly
   preserves scores/chips for a same-game round restart) because New
   Game may switch to a genuinely different game where old scores/chip
   denominations don't apply.
6. Guests cannot trigger New Game; when the host starts one, guest
   screens transition automatically to the new game's initial state via
   the existing broadcast/dispatch path - no new code re-entry.
7. A confirmation step (not a single click) is required before
   discarding the table, since this is strictly more destructive than
   Restart Game (which keeps the same preset/scores/chips).

## Explicitly Out of Scope
- Changing the join/table code itself.
- Any per-game history, undo, or "past games" list.
- New preset content - reuses the existing `PRESETS` list as-is.

## Smith Gate 1 amendments (approved with these)
1. Placement: host-only chrome near Scores/roster, NOT the deck panel -
   sitting next to the existing 'Restart game' deck action would read
   as a flavor of the same button and invite a wrong click on a more
   destructive operation.
2. Guest notice: the automatic transition (AC6) must show a visible
   notice naming the new game, not a silent wipe of the guest's hand.

## Open Question for Morpheus (architecture)
Restart Game's `RESET` action rebuilds the CURRENT preset's shape only
(`state.gameConfig`/`state.deckConfig` don't change). New Game needs a
new action (or an extended `RESET`) that also REPLACES `gameConfig`/
`deckConfig` wholesale for a different preset, while preserving
`players`/`connection` state - i.e. much closer to
`createInitialState(newDeckConfig, rng, newGameConfig)` re-run against
the existing roster than to today's `RESET`. Needs an explicit decision
on: new action type name, whether it's built by re-running
`createInitialState` and splicing in `players`, and where the "did the
host confirm?" gate lives (UI vs reducer).
