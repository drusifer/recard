# D116: New Game architecture (US-116)

## Reducer
New action `NEW_GAME`, payload `{ type: 'NEW_GAME', deckConfig, gameConfig, rng? }`:

```js
NEW_GAME(state, action) {
  const rng = action.rng ?? Math.random;
  let next = createInitialState(action.deckConfig, rng, action.gameConfig);
  for (const player of state.players) {
    next = reduce(next, { type: 'JOIN', playerId: player.id, name: player.name, rng });
  }
  return {
    ...next,
    hostId: state.hostId,
    players: next.players.map((p) => {
      const prior = state.players.find((sp) => sp.id === p.id);
      return prior ? { ...p, connection: prior.connection } : p;
    }),
  };
},
```
Re-running `JOIN` per existing player is what builds each new preset's
`perPlayer` piles correctly (chips/stock/etc.) - it's the same mechanism
`main.js` already uses to rebuild a roster on host restore
(`main.js:442`), not a new one.

`reduce`'s `assertCardsConserved` gate must exempt `NEW_GAME` alongside
`RESET` - a wholesale preset swap is a new card-id epoch by definition,
same justification already recorded for RESET.

## gameConfig gains `presetName`
`createInitialState`'s `gameConfig` shape gets one new field,
`presetName` (the preset's own `.name`), set at initial table creation
(`main.js`'s existing `CREATE`-time call) and by `NEW_GAME`. `viewFor`
adds it next to the existing `allowsPlayerZones` field it already
exposes - the only way a GUEST can know which game is live without
inventing a second network message for it.

## Host UI
Per Smith Gate 1's amendment: a "New Game" button lives in host-only
chrome near Scores/roster (NOT the deck panel, which already carries
"Restart game" as a same-game round reset - visually distinct, distinct
verbs). Clicking it opens the same preset-picker markup the initial
host-create form uses (preset dropdown, deck-choice checkboxes,
cards-per-player preview), with Start/Cancel. Confirming dispatches
`NEW_GAME` with the chosen preset's `deckConfig`/`gameConfig`
(`presetName` included); Cancel discards the picker with no dispatch.

## Guest notice
Per Smith Gate 1's second amendment: `main.js` keeps the last-seen
`view.gameConfig.presetName` per client. On `renderGameFromView`, if the
incoming value differs from the last-seen one (and this isn't the very
first render), show `renderBanner(bannerElement, 'Host started a new
game: <name>')` for a few seconds, then clear it. Reuses the existing
banner element/mechanism already used for reconnect status - no new DOM.

## Scores/chips reset
Falls out of the design for free: `createInitialState` starts `scores:
{}` and JOIN seeds each player at 0; chips are `perPlayer` piles rebuilt
fresh by the JOIN replay above, same as any other preset switch. No
special-case code needed.
