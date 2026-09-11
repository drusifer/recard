# Fix: all players get all pile actions (2026-09-10)

Direct user request, generalized mid-session: "every player should have
access to teh deck pile actions" -> "remove other player specic rules
for pileactions. All players have access to all pile actions no matter
what! simplify remove tests and requirements for pileaction player
specific behavior. Only difference is that the hidden state on piles in
the PlayerZone are always visible to teh player (that's zone specific
not pile specific)" -> "some of the actions may be host/client
restricted - we should remove those constraints as well... remove those
front end constraints too."

## What shipped

**Removed the `isOwner`/`isShared` gate from every pile class's
`pileActions()`** - previously `if (!isOwner && !isShared) return [];`,
repeated verbatim across 10 classes: `Pile` (base), `HandPile`,
`BattlefieldPile`, `ChipPile`, `MeldPile`, `CascadePile`, `ExilePile`,
`TokenPile`, `LandsPile`, `RankAdjacentPile`, `StackPile`. Each now
returns its action list unconditionally; the now-unused `isOwner`/
`isShared` parameters are dropped from every signature.

**Removed `DeckPile`'s `isHost` split** - `pileActions({isHost})` used
to return `['draw']` for a non-host and the full
`['draw','deal','reshuffleDeal','reset','shuffle','split',
'changePileType']` for the host only. Now always the full list,
`isHost` gone from the signature.

**Removed 3 reducer-level authorization checks** (`state.js`):
- `SORT_PILE`: threw `not authorized` unless `pile.ownerId ===
  action.playerId`. Gone - any player can sort any pile now.
- `UNTAP_ALL`: threw unless `isOwner || isShared`. Gone.
- `SET_STACK_ORIENTATION`: same `isOwner || isShared` gate. Gone.

**Cleaned up now-dead call sites**: `ui.js`'s `pileLevelActions(pile.kind,
{isOwner, isHost, isShared, cards})` call dropped the three now-unread
flags (kept `cards`, still real for hide/show and sort-by-contents).
`ui.js`'s `renderDeckStack` dropped its `isHost` param the same way.
`main.js` no longer computes `isHost: role === 'host'` into the render
options object at all - nothing read it any more.

## Two real, previously-hidden bugs found and fixed

Removing `DeckPile`'s host gate meant Shuffle/Reset/Reshuffle-Deal/Deal
buttons now render for every player - which exposed that **none of
those four actions had ever been wired for a guest client**:

- `performShuffle` called `dispatch({type:'SHUFFLE_DECK', pileId})`
  directly, unconditionally - no `if (role === 'host') ... else
  session.send(...)` split every OTHER dispatching function in
  `main.js` already has. A guest calling this would hit `dispatch`
  with no local `gameState` to reduce against.
- `dealFromDeck`'s `'reset'` branch and its `reshuffleDeal`/`deal-more`
  branch had the identical bug - raw `dispatch(...)` calls, no relay.

Both invisible before today because these four actions were host-only
at the offer level, so a guest could never click a button that reached
this code. Fixed by adding the standard host-dispatch/guest-relay split
to both (`performShuffle`, `dealFromDeck`'s reset/deal branches) -
matches the exact pattern `performDraw`/`performTakePile`/etc. already
use. The host's receiving handler (`session.on('data', ...)`,
`main.js`) is generic and needed no changes - it already re-dispatches
any relayed `{type:'action', action}` message uniformly.

## Tests

15 tests that asserted the OLD restriction were deleted or rewritten
into positive coverage of the new unconditional behavior (not just
patched to pass) - per "no back-compat, simplify, remove tests for the
old requirement": `tests/pileLevelActions.test.js`,
`tests/piles.test.js`, `tests/rtgPiles.test.js`, `tests/state.test.js`.
Stale `isOwner`/`isShared`/`isHost` args stripped from every remaining
call site across those files plus `tests/chipPile.test.js`, even where
the test still passed with them present (they're just ignored now -
leaving them would misleadingly imply they still matter).

**Coverage gap, disclosed not hidden**: the actual guest-relay code
path for Shuffle/Reset/Deal (the two real bugs above) has NO test
coverage - this project has no 2-peer browser harness (standing,
already-disclosed backlog item, same one blocking guest-side testing
everywhere else: New Game's banner, reconnect flows, etc.). Verified by
code reading against the identical, already-tested pattern every other
action uses, not by running it live as a real guest.

## Verification

787/787 unit tests green (down from 794 - net deletions from removing
restriction-only tests), all 4 browser suites green (68 tests total),
`lint-js` at its unchanged 10-error `ui.js` baseline, `lint:design`
byte-for-byte the pre-existing 10-violation baseline.

## Not done this pass

The zone-privacy half of the user's request ("hidden state on piles in
the PlayerZone are always visible to the player... that's a zone
property, not a pile property") is a separate, still-queued
architecture item - not touched here. This fix was pile-ACTION
authorization only.
