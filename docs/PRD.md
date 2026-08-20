# PRD — Recard (working title)

**Owner:** Cypher (PM)
**Status:** Draft v0.1
**Last updated:** 2026-08-15

## Vision
A web app that replaces a physical deck of cards. People sitting in the same
room, each on their own device, connect peer-to-peer and get a shared virtual
deck they can shuffle, deal, draw from, and play to a table — for whatever
card game they already know the rules to. The app does not referee any
specific game; it is a deck-and-table simulator, not a rules engine.

**Sharpened 2026-08-15 (user's own words, worth keeping verbatim):** "The
goal is not to capture every rule of every game but rather to allow any
game to be played by supporting basic operations that the player can use
to play any game... basically open play but with just enough structure to
support common card game mechanics." Concretely: the app ships a small,
fixed set of composable primitives — deal, hold a private hand, play a
card face-up or face-down, flip a face-down card, place cards in a shared
middle either publicly or privately-owned, draw/pick up, track a manual
score — and every card game people already know how to play is expressed
by *how they use* those primitives, not by the app knowing the game. This
is the yardstick for every future feature request: does it add a general,
reusable primitive, or does it encode one game's specific rule? Only the
former is in scope.

## Problem
Groups of people together in person often want to play a card game but don't
have a physical deck on hand. Existing "play cards online" apps assume remote
play and require a backend server/account. This product targets the
same-room case with no server infrastructure to run or pay for.

## Target User
Friends/family/coworkers physically co-located, each with a phone or laptop
and a browser, who want a deck of cards without installing an app or
standing up any infrastructure. This includes a single person playing
solitaire-type games alone — hosting a table with no one else joining is
a valid, supported use, not just a degenerate case of the group scenario.

## Core Product Principles
1. **Game-agnostic** — simulates a deck (or several), not any one game's rules.
2. **No server infrastructure** — no backend to deploy, host, or pay for.
   (Note: establishing a peer-to-peer connection typically still requires a
   small signaling step to exchange connection info — see Feasibility Flag
   below. "No server infra" means no app server/database to operate, not a
   guarantee of zero signaling.)
3. **Zero install** — open a browser tab and play.
4. **Same-room** — optimized for players who can see each other and talk;
   not building remote/matchmaking play in v1.
5. **Ephemeral** — no accounts, no persistence beyond the session.
6. **Live, best-effort motion** — card movement (hand organizing, playing a
   card, drawing) should animate on other players' screens as it happens,
   not just snap to a final state. "Best-effort" means it's fine to drop or
   coalesce intermediate frames under load/packet loss — the end state must
   stay correct, but every micro-movement doesn't need a delivery guarantee.

## In Scope (v1)
- Create a session/table as host; get a shareable code or QR for others in
  the room to join.
- Join a session via code/QR, no install, no account.
- Choose deck configuration (standard 52, +/- jokers, multiple decks combined).
- Shuffle and deal cards privately to each player's hand.
- Play a card from hand to a shared table/discard area visible to everyone.
- Draw from the deck or pick up from a shared pile.
- See public info for other players (card counts, table state) without
  seeing their hand contents.
- Host can reset/reshuffle for a new round without restarting the session.
- Live-replicate card movement to other clients on a best-effort basis: hand
  reorganization shows as motion (not card identity) per the privacy
  principle; playing/drawing a card shows both motion and the now-public
  result.

## Out of Scope (v1)
- Enforcing rules for any specific game (no turn logic, no scoring, no win
  detection). **Clarified 2026-08-15** after a "score keeping" request: a
  player-editable shared tally (US-16) is in scope for v1.1 — it's a dumb
  counter the app stores and displays, not the app computing or
  interpreting scores. The app calculating/enforcing scores per a
  specific game's rules remains out of scope. See `docs/USER_STORIES.md`
  "v1.1 backlog: quick-start game presets + score keeping."
- Remote / cross-room play, matchmaking, or spectating.
- Accounts, persistent stats, leaderboards.
- Voice/video chat (basic reactions/text chat may be a stretch goal).

## Key User Stories
See `docs/USER_STORIES.md`.

## Feasibility Flag → Morpheus
"No server infra" plus "peer-to-peer" is a technical constraint, not just a
product one. WebRTC (the likely mechanism) still needs *some* out-of-band
signaling to exchange session descriptions before a direct P2P channel opens
— even for two devices on the same table. Need Morpheus to assess and
propose a signaling approach that stays consistent with "nothing for the
product owner to host/operate," e.g.:
- Manual copy/paste or QR-code exchange of connection offers (no network
  service at all), vs.
- A free/public signaling broker or STUN/TURN service (small external
  dependency, still "no infra we run").
Flagging rather than deciding — this determines join UX (Story 2) and is
core architecture.

## Feasibility Flag → Morpheus (2): Live Movement Sync
New requirement (2026-08-15): hand-organizing and card-play movements should
replicate to all clients live, best-effort (see Principle 6, US-11). Over a
P2P mesh this implies a continuous small-message broadcast (e.g. drag
position deltas) separate from the authoritative game-state messages (deal,
play, draw). Need Morpheus to confirm this is workable on the same P2P
channel(s) chosen for signaling/state sync, and whether "best-effort" should
be implemented as unordered/unreliable delivery (e.g. WebRTC data channel in
unreliable mode) vs. reliable delivery that the UI simply throttles.

## Feasibility Flag → Morpheus (3): Face-Down Middle Cards (owner + faceUp)
New requirement (2026-08-15, post-v1-launch, see `docs/USER_STORIES.md`
"v1.1 backlog"). **Resolved 2026-08-15**: the user confirmed both
face-down forms are wanted, not just one:
1. Hidden from *everyone* until turned over (community-card style — a
   flop, a face-down pile card with no owner).
2. Hidden from *other players* but visible to whichever player placed it
   (hole-card style — private, just displayed outside the hand).

Proposed generalization for Morpheus to evaluate (this is a product-level
proposal, not a technical decision — Morpheus owns whether it's the right
shape): give every middle-zone card two fields, `owner: playerId | null`
and `faceUp: boolean`, with a single redaction rule reused everywhere:
**a viewer sees a card's identity if `faceUp` is true, OR the viewer is
`owner`.** This one rule produces all four cases that matter: public
middle card (`owner: null, faceUp: true` — today's behavior), unrevealed
shared card (`owner: null, faceUp: false`), a private card placed in the
middle in front of its owner (`owner: <id>, faceUp: false` — the hole-card
case), and a card publicly "claimed" by a player face-up (`owner: <id>,
faceUp: true` — e.g. an exposed meld). Hands stay a separate always-
private zone as today (US-5), unchanged.

Need Morpheus to confirm this still fits the existing `viewFor()`/D3/D4
pattern (per-viewer redaction already exists for hands; this is the same
pattern generalized to middle cards, not a new mechanism) before it goes
into a sprint.

## Feasibility Flag → Morpheus (4): Named Zones + Live Cursor/Motion Protocol
New requirement (2026-08-15, post-v1.1-launch, see `docs/USER_STORIES.md`
"v1.2 backlog" US-19/US-22). Two related architecture questions:

**Zones:** generalize the single `table` array (D7) into a list of named
zones, each holding cards with the existing per-card `owner`/`faceUp`
visibility model unchanged. Proposed shape: `zones: [{id, name, cards:
MiddleCard[]}]`, with a default zone always present so existing single-
pile play (US-6/US-12/13/14) keeps working unmodified. New actions
needed: `CREATE_ZONE`, and generalizing `PLAY`/`REVEAL`/`PICKUP` to take a
`zoneId` instead of assuming the one table. Need Morpheus to confirm this
is additive to D7 (same redaction rule, just keyed by zone) rather than a
rearchitecture, and to decide whether moving a card zone→zone is one new
action or expressed as pickup-to-hand + play-to-new-zone (two existing
actions) — the latter is simpler but costs an extra round-trip/UI step.

**Live cursor/motion:** extends the existing best-effort motion channel
(D4, Flag 2) to carry continuous position data, not just a boolean
"organizing" flag. Need Morpheus to confirm the same throttle/coalesce
approach scales to per-frame position updates (likely a higher message
rate than today's hand-organizing cue), and to define the zone-level (not
hand-slot-level) granularity boundary from US-22's Open Question 2 so a
future implementer doesn't accidentally leak hand-slot positions that
could aid inferring card identity via timing/position side-channels.

## Feasibility Flag → Morpheus (5): Top-Down Table Redesign
New requirement (2026-08-15, post-v1.2-launch, see `docs/USER_STORIES.md`
"v1.3 backlog" US-26..30). Three related architecture questions, each
with a product-level proposal for Morpheus to evaluate/own the technical
shape of:

**Per-seat personal zones:** extend the existing `zones` list (D12) so a
zone can optionally carry an `ownerId: playerId`. `JOIN` auto-creates one
such zone for the joining player (`CREATE_ZONE`'s existing logic, called
internally, not a new reducer case) — it's a zone like any other for
`PLAY`/`MOVE_CARD`/`REVEAL`/`PICKUP` purposes, `ownerId` only matters for
UI placement (drawn at that player's seat) and for marking it
non-deletable. Need Morpheus to confirm this is additive (existing
zone-consumers ignore a field they don't know about) rather than a
breaking change to D12.

**Per-viewer relative seating:** each client computes its own seating
order locally from the existing roster (viewer always "at the bottom",
others distributed around the rest) — this is pure presentation, reads
`state.players` the same way `renderRoster` already does today, needs no
new state field or protocol message. Need Morpheus to confirm there's no
hidden coupling (e.g. anything that currently assumes roster order ==
visual/seat order) before this ships.

**Live card-drag broadcast (extends D13, corrects its scope):** D13
deliberately scoped "card motion" down to a boolean lift cue, reasoning
that full live-position sync "isn't what the table feels live actually
needs." The user has now explicitly asked for the fuller version (true
real-time position while dragging, best-effort/approximate accepted) —
this restores the PRD's original Principle 6 rather than contradicting
D13's build-cost reasoning; the cost tradeoff the user is accepting has
changed. Proposed shape: extend the existing best-effort motion channel
(D4, already generic `kind`/`data`, already throttled/coalesced) with a
new kind carrying `{originId, cardId-or-null, x, y}` — `cardId` is
included only when the dragged card is already visible to *every*
possible receiver (face-up on the table); for a card starting in a
private hand or a still-hidden face-down zone card, `cardId` is omitted
and every receiver renders a generic anonymous back at the broadcast
position, so the existing per-viewer redaction invariant (D7) holds
continuously through the drag, not just at the committed end state. The
actual `PLAY`/`MOVE_CARD` action on drop remains the sole source of
truth, exactly as today — this channel is presentation-only and
best-effort, matching D4's existing reliable-state/best-effort-motion
split. Need Morpheus to confirm the throttle rate used for cursor (US-22)
is adequate for this too, or whether card-drag warrants its own rate.

## Feasibility Flag → Morpheus (6): Card Stacking/Overlap Snap ("runs and sets")
New requirement (2026-08-16, post-v1.4-launch, see `docs/USER_STORIES.md`
US-32/US-33). Two related drop-target behaviors for cards within a zone,
both extending the existing drag-and-drop mechanism (D19/US-28) rather
than replacing it:

**Stack** (US-32): drop a card onto a target card's "stack" region ->
piles tightly on top (corner-index peek of what's underneath still
visible). **Overlap** (US-33): drop onto the target's other region ->
fans out beside it with a partial, fully-identifiable overlap. Both
insert the dropped card adjacent to the target in the zone's underlying
card order.

Product-level proposal for Morpheus to evaluate/own the technical shape
of:
- `MOVE_CARD`'s current always-append, same-zone-is-a-no-op behavior
  (`src/state.js`) needs to become position-aware: an optional
  `beforeCardId`/insertion-point parameter, and same-zone moves need to
  actually reorder instead of no-op'ing.
- A new per-card visual hint (something like `stacked: boolean` on the
  card, set only when it lands via the "stack" drop region) needs to be
  **shared/authoritative state**, not per-viewer-local like hand order
  (D14) — a table's card layout is genuinely shared game state every
  player needs to see identically, unlike a private hand's internal
  order which only its owner needs consistent.
- Drop-target wiring is currently zone-level only (`renderZonePanel` in
  `src/ui.js` — `opts.onDropCard(cardId, zoneId)` carries no target-card
  or position info). Needs extending to detect which card (if any) was
  under the drop point, and which of its two regions.
- **Constraint carried over from US-28/Smith's own established
  precedent**: no mid-drag popup/prompt to pick a mode — the mode must
  be a spatial drop-target distinction on the card itself, discoverable
  without a decision dialog interrupting the drag.

Need Morpheus to confirm: (a) the state-layer authorization story is
unchanged (stacking/overlapping a card should follow the exact same
`MOVE_CARD` authorization already established, nothing new to add), and
(b) whether the per-card `stacked` hint needs any interaction with the
existing live card-drag broadcast (D19) mid-drag, or is purely a
committed-state-on-drop concern.

## Feasibility Flag → Morpheus (7): Deck Operations (Draw grouping, Shuffle, Split)
New requirement (2026-08-16, added mid-Sprint-6 by the user directly, see
`docs/USER_STORIES.md` US-34/35/36). Lower-risk than Flag 6 — proposed
as two small, mostly-mechanical reducer additions plus a UI regroup:

- **US-34** (Draw grouping): no state/reducer change at all, pure
  `index.html`/`ui.js` placement.
- **US-35** (Shuffle): proposed as one new reducer case, `SHUFFLE_DECK`
  — `{ ...state, deck: shuffle(state.deck, rng) }`, reusing the existing
  `shuffle()` helper `RESET` already calls, just without rebuilding the
  deck or touching hands/zones/passed. Host-only, matching
  `DEAL`/`DEAL_MORE`/`RESET`'s existing authorization pattern exactly —
  no new authorization concept.
- **US-36** (Split): proposed as one new reducer case, `SPLIT_DECK
  { pileCount }` — creates `pileCount` new zones via the existing
  `makeZone()` helper (D17's shared zone-construction logic), each
  `faceDown: true`-carrying pile dealt round-robin via the same
  card-distribution loop `dealCards()` already implements for
  `DEAL`/`DEAL_MORE`, just writing into `zone.cards` instead of
  `hands[playerId]`. Host-only, same pattern as above. Needs a "not
  enough cards for N piles" guard mirroring `DEAL_MORE`'s existing one.

Need Morpheus to confirm: (a) `SHUFFLE_DECK`/`SPLIT_DECK` as new
reducer cases (vs. some other shape), (b) whether `dealCards()` should
be generalized to accept an arbitrary list of destinations (zones OR
hands) rather than duplicating its round-robin loop for zones, and (c)
that per-pile face-down cards created by `SPLIT_DECK` correctly fall
under the exact same redaction rule already governing every other
face-down zone card (D7) with no new privacy logic needed.

## Open Questions
1. Max players per table? (assume 2–8 until told otherwise). **Min
   players resolved 2026-08-15: 1 player must be supported**, for
   solitaire-type games — confirmed the existing architecture already
   allows this with no code changes (the host is added as a player on
   table creation via `JOIN`, and `DEAL`/`state.players.length` never
   assumed more than one; there's no player-count gate anywhere in
   `src/`). Adding as an explicit AC (US-17) so it's tested and never
   accidentally gated later, not because it needs new engineering.
2. Is game state fully freeform (players just drag/tap cards like a real
   table) or do we model structured zones (hand / discard / draw pile /
   table) that a host can configure per game? **Resolved 2026-08-15**:
   structured named zones, per US-19/Feasibility Flag 4 — the "freeform"
   half of this question is also partly answered by US-22's live-motion
   work, which makes card movement feel less rigid even within a
   structured-zone model.
3. Custom card backs/themes — v1 or later? Still open, still deferred.
4. Reconnect behavior if a player's browser refreshes or drops mid-session?
   Still open — carried as Sprint 1 retro backlog item 1, not addressed
   this sprint either.

## Success Criteria (v1)
- A host can start a session and 3+ other players can join from their own
  devices in under a minute, with no install and no account.
- Players can complete a full round of a simple game (e.g. War or a basic
  shedding game) using only the app as the deck.
