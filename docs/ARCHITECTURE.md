# Architecture — Recard

**Owner:** Morpheus (Tech Lead)
**Status:** v1, v1.1, v1.2, v1.3, v1.4 shipped. v1.5 decisions below
(D21-D23) are binding for the current sprint (US-32..36, "snap-to
stack/overlap + deck operations" + a user-directed foundational `Pile`
storage unification, D23, sequenced first).
**Last updated:** 2026-08-16

## Decisions (resolves PRD Feasibility Flags 1 & 2)

### D1. Stack: static site, no build step
Plain HTML/CSS/vanilla JS (ES modules), served as static files. No backend,
no database, no build pipeline. Keeps "no server infra" literal — there is
nothing to deploy or operate. Node is used only as a dev-time test runner
(`node --test`), never at runtime.

### D2. Signaling: PeerJS + its public cloud broker
Use PeerJS (CDN-loaded) for WebRTC. It uses a free public signaling broker
(`0.peerjs.com`) and public STUN servers to establish the connection, then
data flows directly peer-to-peer. This is a small external dependency we
don't operate — no account, no server we run, no cost. It's the standard
"WebRTC still needs signaling" answer from PRD Flag 1: we accept a public
broker instead of hosting one, and instead of manual copy/paste codes,
because copy/paste offer/answer blobs are a worse join experience (Smith
would reject that on Gate 2 — recognition/consistency).
**Revisit trigger:** if `0.peerjs.com` availability becomes a problem, swap
to a self-hosted `peerjs-server` — it's a drop-in replacement, isolated
behind this one decision.

### D3. Topology: star, host-authoritative
Host's browser tab is the hub. Every other player connects directly to the
host only (not to each other) — avoids full-mesh connection complexity for
v1. The host holds the single source of truth for game state (deck order,
each hand's contents, table/discard contents) and is the only client that
mutates it. Other clients send **action requests**; the host validates and
broadcasts the resulting authoritative state. This directly satisfies
US-5/US-8 privacy: a player's hand is only ever put on the wire in the
per-connection payload addressed to that player — never broadcast.

### D4. Two message classes on the data channel
1. **State messages** (reliable, ordered — PeerJS default): `deal`,
   `play`, `draw`, `reset`, `roster`. These are authoritative and always
   delivered; clients render directly from the latest one received.
2. **Motion messages** (best-effort, cosmetic only): hand-slot drag
   position, card-lift, play-in-flight animation cues. Sent at a throttled
   rate (~20/s) with "latest wins" coalescing — a superseded motion event
   for the same slot is simply never sent. Motion messages **never**
   carry information not already implied by the last state message (e.g.
   hand-reorg motion carries position only, not card identity), and are
   never required to arrive for the app to remain correct.

This cleanly resolves PRD Flag 2: best-effort is implemented at the
application layer (throttle + drop-superseded), not by relying on unstable
"unreliable WebRTC channel" browser behavior. Losing motion frames only
ever costs smoothness, never correctness, because state messages are the
only source of truth for what's actually true.

### D5. Join flow
Host calls `peer = new Peer()`, gets a PeerJS ID, and displays it as both
a short code and a QR encoding `<page-url>?join=<id>`. A joining player
either types the code or scans the QR; both resolve to
`peer.connect(hostId)`. Host shows each connection's state (connecting /
connected / disconnected) per Smith's Gate 1 AC.

### D6. No persistence / no reconnect (v1)
If the host's tab closes, the session ends — no server means no
state survives the authoritative peer disappearing. Documented as a known
v1 limitation (PRD Open Question 4), not silently swept under the rug.
**Smith Gate 2 condition:** every connected client must show an explicit
"Host disconnected — session ended" message on host loss, never a silent
freeze (PeerJS connection's `close`/`error` event on the host DataConnection).

## v1.1 Decisions (resolves PRD Feasibility Flag 3)

### D7. Middle cards generalize hand-style per-viewer redaction
Resolves Flag 3. Extend `Card` to `MiddleCard = Card & { owner: string |
null, faceUp: boolean }` for every entry in `state.table`. **Same
redaction mechanism as D3 (per-viewer privacy for hands), applied to a
second zone** — not a new mechanism:
```
canSee(viewer, middleCard) = middleCard.faceUp || middleCard.owner === viewer
```
`viewFor(state, viewerId)` maps each table entry through this rule: full
card data if visible, else `{ id, owner, faceDown: true }` (owner is
still exposed when hidden — per Smith's UX requirement, players can see
*whose* face-down card it is, just not its rank/suit, matching how a
physical hole card's position is visible even face-down). This covers all
four cases from the PRD proposal (public, shared-hidden, owned-hidden,
owned-revealed) with one rule and no new state-sync mechanism — reuses
the existing reliable-state-message model (D4) unchanged.

### D8. Three new reducer actions
- `PLAY` (extended): now takes `visibility: 'public' | 'shared-facedown'
  | 'private-facedown'`, computing `owner`/`faceUp` per D7 instead of
  always `{owner: null, faceUp: true}`.
- `REVEAL {playerId, cardId}`: sets `faceUp: true` on a table card.
  Authorization per Smith's Gate 1 AC: if `owner === null` (shared), any
  player may call it; if `owner !== null` (private), only that owner may
  — host-side reducer throws on an unauthorized attempt (same pattern as
  today's `PLAY` throwing on a card not in the caller's hand). No-op
  (not an error) if already `faceUp`.
- `PICKUP {playerId, cardId}`: moves a table card into the calling
  player's hand. Throws if the card isn't `faceUp` (can't pick up what
  you can't identify — protects hidden information, per US-14 AC).

### D9. Score is a flat map, untouched by RESET
`state.scores: { [playerId]: number }`, initialized to 0 on `JOIN`.
`ADJUST_SCORE {targetPlayerId, delta}` (delta is `+1`/`-1` — matches
Smith's "just +/- buttons" AC, no arbitrary `SET_SCORE`). `RESET` (US-9)
must NOT touch `scores` — scores intentionally outlive a reshuffle, per
US-16 AC. A separate `RESET_SCORES` action zeros it explicitly. Public to
all viewers unconditionally in `viewFor()` (no redaction — scores were
never meant to be private).

### D10. Presets and rules reference are static client-side data, not new state
US-15 (presets) and US-18 (rules reference) need **no `state.js` or
protocol changes** — they're both pure lookup tables consumed entirely
client-side before/alongside existing actions:
- `src/presets.js`: exports a list of `{ name, numDecks, jokers,
  cardsPerPlayer, usesMiddle }`. The host-setup UI reads from this list
  to prefill the existing US-3/US-4 form fields; "Custom" is just "don't
  apply a preset." `usesMiddle` gates presets that depend on D7/D8 landing.
- `src/rulesReference.js`: exports `{ [gameName]: { goal, setup, turns }
  }` (or similar consistent shape — Smith's Gate 1 AC requires uniform
  format across entries). Rendered by `ui.js` in an overlay that does
  **not** go through `showScreen()` — per Smith's Gate 1 requirement that
  opening it must not lose table state, it needs its own show/hide
  toggle layered on top of whichever screen is active, not a screen swap.

### D11. Solo play needs no architecture change
Confirmed during PRD drafting (Cypher grepped `src/` — no player-count
gate exists anywhere): US-17 is a **regression-test-only** item for this
sprint. Neo should add a dedicated `npm test`/e2e case with exactly one
player dealt/played/drawn through a full round, not new implementation.

## v1.2 Decisions (resolves PRD Feasibility Flag 4)

### D12. `table` generalizes to `zones`, keyed by globally-unique card ids
`state.table: MiddleCard[]` becomes `state.zones: { id, name, cards:
MiddleCard[] }[]`. A default zone (`id: 'table', name: 'Table'`) is
always present in `createInitialState`, so every existing single-pile
story (US-6, US-12/13/14) keeps working with zero call-site changes for
`REVEAL`/`PICKUP` and only an optional new field on `PLAY`:
- `PLAY {..., zoneId?}` — defaults to `'table'` if omitted. Existing
  `PLAY` calls from Sprint 1/2 need no changes.
- `REVEAL {playerId, cardId}` and `PICKUP {playerId, cardId}` **keep
  their existing signatures unchanged** — card `id`s are already globally
  unique (assigned once per physical card at deck-build time, D1's
  `deck.js`), so the reducer searches across all zones for the matching
  id instead of requiring the caller to know which zone it's in. This
  avoids churn in Phase-9-era UI code that already calls
  `revealCard(cardId)`/`pickupCard(cardId)`.
- New `CREATE_ZONE {name}`: appends `{id: <generated>, name, cards: []}`.
- New `MOVE_CARD {playerId, cardId, toZoneId}`: relocates a card between
  zones, **preserving its existing `owner`/`faceUp`** — moving is not
  revealing. Authorization mirrors D8's `REVEAL` rule: a still-hidden
  privately-owned card (`faceUp: false, owner !== null`) can only be
  moved by its owner; anything visible (`faceUp: true` or `owner ===
  null`) can be moved by any player, per US-19's "put or take" AC.
- `viewFor()`'s per-card redaction (D7) is unchanged, just applied to
  every zone's `cards` array instead of one `table` array. Zone
  existence, name, and card *count* are always public (US-19 AC);
  individual card visibility within a zone still follows D7.

### D13. Live cursor is the real feature; "card motion" is a lightweight lift cue, not pixel-tracked dragging
Resolves the motion half of Flag 4. **No new transport mechanism** — this
reuses D4's existing best-effort motion channel and `createMotionThrottler`
exactly as built (it's already generic: arbitrary `kind`/`data` keyed by
an arbitrary throttle key).
- **Cursor** (US-22, the reliable core of this story): while a player's
  pointer is down anywhere on the game screen, broadcast `kind: 'cursor'`
  with position **normalized to the game screen's bounding box (0.0-1.0
  on each axis)**, not raw pixels — devices have different viewport
  sizes, a percentage is the only value that means the same thing on
  every client. Receivers render a small labeled dot at that percentage
  position within their own game screen. Throttled/coalesced like every
  other motion message; a dropped frame just costs smoothness.
- **Card motion** (US-22's second AC, scoped deliberately narrow): full
  pixel-accurate synchronized dragging of a specific card across
  independent browser layouts is a much bigger feature (each client's
  DOM layout differs) and isn't what "the table feels live" actually
  needs. Scoping it as a **lift cue**: starting to drag a card the
  dragger can see broadcasts `kind: 'card-lift', data: {cardId, active}`;
  any receiver who can *also* see that card (same D7 visibility rule)
  applies a "lifted" CSS state (scale/shadow) to their own rendering of
  it for as long as `active`. This satisfies "see the motion, not just a
  cursor, for cards I can already see" without needing shared coordinate
  math across devices. A viewer who can't see the card (private, not
  theirs) gets nothing extra — consistent with D7, never a side channel.
- Explicitly out of scope, matching US-22's non-negotiable AC: motion
  data for **hand** cards stays a boolean-only cue (today's US-11
  behavior, unchanged) — hand slot positions are never broadcast, since
  position/timing could leak which card is which.

### D14. Hand order persistence lives entirely client-side, in a new small pure module
Resolves the Sprint-1 tech debt US-23 explicitly calls out. **No
`state.js` change** — hand order was never part of authoritative state
and doesn't need to be; it's a per-viewer display preference.
`src/handOrder.js` (new, pure functions, unit-testable in isolation):
- `reconcileOrder(previousOrder: string[], currentCards: Card[]):
  string[]` — keeps existing ids in their prior position, appends newly
  seen ids (arrival order), drops ids no longer present. Called every
  time a new view arrives, before rendering the hand.
- `sortByRank(cards)`, `sortBySuit(cards)` — pure sort helpers; a sort
  button calls one of these and replaces the current order with the
  result (still just reordering `main.js`'s in-memory id list, never sent
  anywhere).
- Manual drag-reorder (existing, US-11-era code) is updated to mutate
  this same order list instead of only the DOM, so it and the new sort
  buttons operate on one shared source of truth instead of two competing
  ones (Smith's Gate 1 "sort vs. drag shouldn't fight" requirement).

### D15. Incremental dealing is a new, non-destructive reducer action
`DEAL_MORE {cardsPerPlayer}`: identical card-distribution logic to
`DEAL`, but does not clear existing hands first — cards are appended.
Same "not enough cards left" guard. Kept as a separate action from `DEAL`
rather than a flag on it, because the two have meaningfully different
semantics (start-of-round reset vs. mid-round top-up) and conflating them
into one action with a mode flag would make both harder to reason about
for no real code savings.

### D16. Pass marker reuses existing actor-authorization, no new mechanism
`state.passed: { [playerId]: boolean }`, initialized `false` on `JOIN`
(same pattern as D9's scores), **cleared on `RESET`** (unlike scores —
explicit `passed: {}` in `RESET`'s returned state, since a pass is
round-scoped per US-25 AC). `TOGGLE_PASS {playerId}` flips the caller's
own entry. Self-only authorization needs **no new code**: `main.js`'s
existing dispatch path already overwrites a guest-originated action's
`playerId` with the verified transport-level sender id before calling
`reduce()` (see `session.on('data', ...)` in `main.js`) — the same
mechanism that already makes `DRAW`/`PLAY` "act as yourself only" today.
Public to all viewers unconditionally in `viewFor()`, like scores.

## v1.3 Decisions (resolves PRD Feasibility Flag 5)

### D17. Personal per-seat zones are ordinary zones with an optional `ownerId`
`state.zones` entries gain one new optional field: `ownerId: playerId |
null` (existing zones — the default table pile, anything created via
`CREATE_ZONE` — are unaffected, `ownerId` simply absent/`null`, so this
is additive, not a breaking change to D12). `JOIN` now also internally
appends one zone with `ownerId: action.playerId` (reusing `CREATE_ZONE`'s
own zone-construction logic rather than duplicating it, named from the
joining player's name at that moment — names aren't editable after join,
so no staleness risk). `ownerId` affects **UI placement only** (drawn at
that player's seat) — every reducer case (`PLAY`, `MOVE_CARD`, `REVEAL`,
`PICKUP`) treats a personal zone exactly like any other zone, same "put
or take is open to all" authorization already established by US-19,
deliberately not special-cased. "Not user-deletable" (US-27 AC) needs
**zero new guard code**: there has never been a `DELETE_ZONE` action for
*any* zone, personal or shared, so this guarantee already holds by
omission.

### D18. Seating is a per-viewer client-side presentation, not new state
Each client computes its own seat order locally from `view.players` (join
order, unchanged) and `myId`: rotate the array so the viewer is first
("at the bottom"), everyone else follows in their existing relative
order around the rest of the table. Pure `ui.js`/`main.js` rendering
logic — no new field on `state`, no protocol change, and no coupling
found to anything that currently assumes roster order is *visual* order
(`renderRoster`/`renderMiniHand` just iterate `players` in whatever order
they arrive in; nothing reads position as meaning). Every player's screen
computes its own rotation independently — no synchronization needed since
each rotation is a pure function of already-shared data (the roster) plus
a purely-local value (`myId`).

### D19. Live card-drag broadcast extends D13's existing motion channel — restores PRD Principle 6
D13 scoped "card motion" down to a boolean lift cue for build-cost
reasons. The user has now explicitly asked for the fuller version (true
live position while dragging, best-effort/approximate explicitly
accepted) — this doesn't contradict D13's reasoning, the cost/benefit
the user is choosing has changed, and what's being asked for is in fact
exactly the PRD's original Principle 6. No new transport mechanism: one
more `kind` (`'card-drag'`) on the existing best-effort motion channel
(D4), broadcasting `{ originId, cardId: string | null, x, y }` at the
same throttle/coalesce rate already used for cursor (US-22's rate is
adequate — card-drag is not meaningfully higher-frequency than cursor
tracking, both are pointer-driven).

**Privacy rule (resolves Smith's Gate 1 amendment on US-29):** `cardId`
is included in the broadcast **if and only if the card's current
`faceUp` is `true` at drag-start** — i.e., it's already public to
literally everyone. This single condition is provably sufficient and
correct given the existing authorization rule for what's draggable at
all (`MOVE_CARD`/D12: a still-hidden card can only be moved by its
owner): any card a player is allowed to drag is either already
`faceUp: true` (visible to everyone, safe to name) or `faceUp: false`
and owned by the dragger themself (visible *only* to the dragger, so
by construction invisible to every possible receiver of this broadcast).
There is no third case where a receiver could legitimately see a card
the dragger cannot. When `cardId` is omitted, every receiver renders a
generic anonymous card-back at the broadcast position — this also
mechanically satisfies Smith's "zone-level not hand-slot-level" privacy
requirement (already established for cursor, US-22 Open Question 2):
since no card identity is ever sent for a not-yet-public card, there is
no hand-slot-precision to leak in the first place, only an approximate
position near the dragger's seat.

On drag-end without a completed drop, the broadcaster simply stops
sending; receivers clear the ghost via the same TTL-staleness pattern
`markCursorStale`/`removeRemoteCursor` already implement for cursors —
no new cleanup mechanism. The actual `PLAY`/`MOVE_CARD` reliable-state
message on a real drop remains the sole source of truth throughout, per
D4 — this channel is presentation-only and never a second path to
mutate game state.

**Drop-target highlighting** (Smith's Gate 1 amendment on US-28) is pure
client-side UI state (which zone element the pointer is currently over
during a drag), no state/protocol involvement — implementation detail
for Neo, not a binding decision here.

**Superseded:** the "Full pixel-synchronized card dragging... deferred"
item in Open Items Carried Forward below is removed — this sprint
delivers it (in best-effort/approximate form, as the user explicitly
accepted, not frame-perfect).

## v1.4 Decisions (Sprint 5, US-31)

### D20. Desktop table width is a pure CSS breakpoint tier — no geometry/JS change
`#screen-game`'s `max-width` currently flatlines at 760px above the
480px mobile floor, with no further tier for laptop/desktop viewports.
Confirmed by reading `src/seating.js` directly: `seatPosition()` places
every seat and personal zone as a **percentage** of `.table-surface`
(fixed 42%-radius circle, no pixel math, no width-dependent branch), and
`.table-surface` itself has no independent `max-width` — it just inherits
`#screen-game`'s width minus its own fixed `3rem` side margins. That
means widening the outer container is *sufficient* on its own to give
seats, personal zones, and the hand row (`#hand-area`, flex+`overflow-x`)
more physical room — the geometry already scales, it was just never
handed a wider box to scale into. No changes to `seating.js`, `main.js`,
or any reducer/protocol code are needed; this is scoped to `style.css`
only.

Two new tiers, layered on the existing 480px/760px pattern (unchanged
below 1024px, satisfying Smith's Gate 1 amendment that mobile/tablet is
untouched):
- `@media (min-width: 1024px)`: `#screen-game { max-width: 1100px; }`
- `@media (min-width: 1440px)`: `#screen-game { max-width: 1300px; }`

1024px/1440px chosen to line up exactly with Smith's requested UAT
checkpoints (small laptop / common desktop) — testing sits right at each
breakpoint transition, not just in the middle of a tier, which is the
stronger test (catches an off-by-one at the boundary, not just "does it
look fine somewhere in the range"). The 1300px final cap is deliberate,
not incidental: unbounded/100vw growth on an ultra-wide or 4K monitor
would just stretch the same layout thin (Cypher's AC explicitly rules
this out) — 1300px keeps the table looking designed at any width at or
above 1440px, including monitors much wider than that.

**Explicitly unaffected, by design:** `#game-deck-area`/`#table-area`'s
existing `max-width: 13rem` pot footprint (D-less, pre-existing —
intentionally bounded separately from the seat/zone ring per its own
comment in `style.css`, to avoid the two visually overlapping) and fixed
physical card dimensions (`.card`, `.mini-card-back`, etc.) — a card
doesn't get bigger because the window did; only the *spacing* between
table elements grows. `.screen`'s base 480px (host/join forms) is also
untouched — forms don't get more usable by getting wider, per Smith's
Gate 1 note.

## v1.5 Decisions (resolves PRD Feasibility Flags 6 & 7)

### D21. Card stack/overlap is one new `layout` field, resolved via a position-aware `PLAY`/`MOVE_CARD`
**Corrects Cypher's Flag 6 proposal**: a plain `stacked: boolean` isn't
enough — Smith's Gate 1 established *two* distinct non-default states
(stack vs. overlap/fan), not one on/off flag. Card gains one new
optional field: `layout: 'stack' | 'overlap' | undefined`. `undefined`
(the default — every existing card, unchanged) renders exactly as
today, byte-for-byte backward compatible. The field means "how this
card renders relative to whatever immediately precedes it in the
zone's `cards` array" — direction-agnostic, so it works identically
whether the card was inserted before or after its neighbor.

**`PLAY`/`MOVE_CARD` become position-aware**, both gaining new optional
params. **Revised at Phase 30 review — the original `beforeCardId`
spelling could not express this decision's own rule** (see the ruling
below); the action params are:
- `targetCardId` (string, optional): the existing card the drop was
  aimed at. Omitted = append at the end, **identical to today's
  behavior** — no existing call site (`DEAL`, `DEAL_MORE`, any test)
  needs to change.
- `side` (`'before' | 'after'`, default `'after'`): which side of the
  target the dropped card lands on.

Both reducer cases share one `placeCard()` helper (with `withLayout()`
under it) rather than duplicating splice-or-push and the layout rule
twice.

**Morpheus ruling (Phase 30 review): revision ACCEPTED — this was a
genuine internal inconsistency in D21, not Neo redefining the API.** As
originally written, this decision specified `beforeCardId` + `layout`
while *also* specifying Smith's Gate 2 rule that the layout may need to
land on the target rather than the dropped card. Those two statements
are incompatible: "insert before T" and "insert after T's predecessor"
denote the *same* insertion point but must write `layout` to *different*
cards, so a bare `beforeCardId` provably cannot carry the distinction.
`targetCardId` + `side` is the minimal repair — it keeps
before-card-insertion as the internal primitive while preserving the one
fact the rule actually depends on (which card the player aimed at).
Worth noting for future decisions: this is the second time this sprint
that an implementation-stage read caught a defect in an
architecture-stage document (cf. D23's data clump). Writing the *rule*
and the *parameters* in separate passes is what let them drift — they
should be checked against each other before a decision is called done.
- `layout` (`'stack' | 'overlap'`, optional): sets the moved/played
  card's own `layout` hint. Omitted clears any prior `layout` the card
  had (dragging back out to empty zone space returns it to normal flat
  spacing, per US-32/33 AC) — the reducer explicitly strips a stale
  `layout` key rather than leaving one from a previous position behind.

**Smith Gate 2 correction — which card actually gets the `layout` write
is not always the dropped card.** D21's draft above implicitly assumed
the moved/played card is always the one that receives `layout`. That's
right for two of the three drop regions but silently wrong for the
third: dropping in the **before-side** overlap halo of a target `T`
inserts the dragged card `X` immediately before `T` in the array — `T`
is now the one adjacent *after* `X`, so per D21's own field semantic
("layout describes a card's relation to whatever precedes it") it's
**`T`**, not `X`, whose `layout` needs to be set/updated to `'overlap'`
(X itself keeps whatever — usually none — describes its relation to
its own new predecessor). Getting this backwards would visually overlap
the wrong pair of cards on a before-side drop. **Single corrected rule,
covers all three regions with no direction-specific branching**: after
computing the new array order, `layout` always belongs to *whichever
card of the newly-adjacent pair now comes second* — for on-card-body
(stack, always an insert-after) that's `X`; for beside-after (overlap)
that's also `X`; for beside-before (overlap) that's `T`. One rule
applied post-insertion, not two cases to remember.

**`MOVE_CARD`'s same-zone no-op is removed.** Today `if (fromZoneId ===
toZoneId) return state;` — that was correct when a same-zone move was
meaningless (no reordering existed). It now needs to actually reorder,
so the early-return is deleted; the same remove-then-reinsert logic
already used for a cross-zone move handles a same-zone reorder
identically, no separate code path.

**No privacy/authorization changes** — confirms Cypher's flagged
question (a) in Flag 6. Every existing `MOVE_CARD`/`PLAY` authorization
rule (a still-hidden card only its owner may move; a shared face-down
card by anyone) applies completely unchanged; `layout`/`beforeCardId`
only affect *where and how* an already-authorized move renders, never
*whether* it's authorized. Stacking two anonymous face-down backs
together reveals nothing new either — redaction (D7) already hides
identity before layout is ever a factor.

**No interaction with the live card-drag broadcast (D19)** — confirms
Cypher's flagged question (b). D19's ghost is a best-effort, purely
presentational preview of *live pointer position while dragging*;
`layout`/`beforeCardId` are committed-state-on-drop only, decided once
at the moment of a real `PLAY`/`MOVE_CARD` dispatch. `protocol.js`
needs zero changes.

**UI (`src/ui.js`) drop-target detection**: `renderZonePanel`'s single
zone-level `drop` handler needs to also detect, at drop time, which
card (if any) is under the pointer and which region of it — on-card
body vs. beside-card halo, per Smith's Gate 1 mechanism — and pass
`{ targetCardId, region }` through `opts.onDropCard`. `moveToControl`
(the "Move to…" dropdown) is **unchanged** — it still only offers
other zones, matching Smith's note that within-zone stack/overlap is a
drag-only interaction, not something a dropdown needs to expose.

**CSS**: a card whose `layout` is `'stack'` or `'overlap'` gets a
negative `margin-left` pulling it onto its immediate predecessor —
large enough to fully cover it but for a corner-index peek (`stack`),
smaller/partial so every card stays independently readable
(`overlap`). No `z-index` needed: normal DOM paint order already puts
a later sibling over an earlier one once their boxes overlap.

### D22. Deck operations reuse existing helpers, but `SPLIT_DECK` needs its own small loop, not `dealCards()` as-is
**Confirms** most of Cypher's Flag 7 proposal, **corrects one part**:
`dealCards()`'s actual contract is "deal exactly `cardsPerPlayer` cards
to each of `players`, erroring if the deck doesn't have
`cardsPerPlayer × players.length` cards" — a fixed-count-per-destination
model. `SPLIT_DECK`'s requirement (US-36 AC) is "deal the *entire*
remaining deck round-robin across N piles" — an exhaust-the-deck model
with no fixed per-pile count. These are genuinely different contracts,
not the same function with different inputs, so forcing `SPLIT_DECK`
through `dealCards()` unchanged would be wrong, not just imperfect
reuse. `SPLIT_DECK` gets its own small round-robin loop (same *pattern*
as `dealCards`, one card at a time per destination in rounds, just
exhausting `deck` instead of stopping at a fixed count) — still no
duplication of anything, since the two loops were never actually the
same operation.

- **`SHUFFLE_DECK`** (host-only, matching `DEAL`/`DEAL_MORE`/`RESET`):
  `{ ...state, deck: shuffle(state.deck, rng) }` — reuses the existing
  `shuffle()` helper `RESET` already calls. Hands/zones/scores/passed
  genuinely untouched (no `...` spread omissions to get wrong — every
  other field just flows through via the object spread).
- **`SPLIT_DECK { pileCount }`** (host-only): requires `pileCount <=
  state.deck.length` (Smith's Gate 1 guard — every pile gets ≥1 card),
  else throws `Cannot split into N piles: only X cards left`, mirroring
  `dealCards`'s existing error message style exactly. Creates
  `pileCount` new zones via the existing `makeZone()` helper (D17),
  named "Pile 1".."Pile N", each `faceDown: true` per card (matches how
  every other face-down zone card already renders/redacts — D7 applies
  with no new logic). Deals `state.deck` round-robin across the new
  zones' `cards` arrays until exhausted.
- **`PICKUP`** needs one small fix while touching this area: it already
  strips `owner`/`faceUp` when a card returns to a hand
  (`const { owner, faceUp, ...plainCard } = card`) — extend that
  destructure to also strip `layout` (D21), so a stacked/overlapped
  card doesn't silently carry a stale zone-only field into a hand array
  where it's meaningless.
- **UI**: `Draw` stays exactly where it is (Smith's Gate 1 reversal of
  US-34's original premise — highest-frequency action stays next to its
  own effect). New `Shuffle`/`Split` controls go in a new button row
  under `#game-deck-area`, host-only visibility via the same
  `role !== 'host'` hidden-toggle pattern `resetBtn`/`dealMoreBtn`
  already use. `Split`'s pile-count input reuses the `deal-more-count`
  number-input pattern (`min="2" max="20"`), not a `window.prompt()`.

### D23. Unified `Pile` storage model — `deck`/`hands`/`zones` become one `state.piles` array
**User-directed mid-sprint architecture change** (2026-08-16): deck,
hands, discard/sets/runs zones, and Split's new piles are all
structurally "a named collection of cards with a visibility rule" —
today's code treats them as three separately-shaped top-level state
slices (`deck: Card[]`, `hands: {[playerId]: Card[]}`, `zones: Zone[]`)
with duplicated logic between them. D22 already hit this directly:
`SPLIT_DECK` needed its own round-robin loop because `dealCards()`'s
hand-shaped contract didn't fit dealing into zones. Unifying the
storage model resolves that duplication for real, instead of adding a
third parallel implementation of the same pattern.

**Shape:**
```
Pile = {
  id: string,
  kind: 'deck' | 'hand' | 'zone',   // the Pile *type*; visibility behavior derives from it
  ownerId: string | null,           // null = shared (deck, discard, Split piles); playerId = a hand or personal zone
  name: string,
  cards: Card[]                     // zone piles additionally carry {owner, faceUp, layout?} per card (D7)
}
state.piles: Pile[]   // replaces state.deck, state.hands, state.zones entirely
```

**Visibility is a property of the pile type, derived — not stored
per-card on every pile** (revised during Phase 29 implementation; see
"Neo implementation revision" below):

| `kind`   | visibility rule | who sees contents | user's own wording |
|----------|-----------------|-------------------|--------------------|
| `'deck'` | `hidden`        | nobody (count only) | the draw stock |
| `'hand'` | `in-hand`       | `ownerId` only (count to all) | "In Hand" |
| `'zone'` | `mixed`         | per-card `{owner, faceUp}` (D7) | "Open" / "Mixed" |

A `'zone'` pile is the general case: each card carries its own D7
`{owner, faceUp}`, so a zone reads as "open" when every card is face-up
and "mixed" when they differ — one mechanism covers both, exactly as it
has since D7, rather than needing a separate pile type per case.

**Neo implementation revision (Phase 29, accepted — flagged for review
rather than applied silently):** this decision originally specified that
*every* card in *every* pile uniformly carry `{owner, faceUp}`, with the
deck as a "degenerate case." Implementing it showed that to be strictly
worse than deriving visibility from `kind`:
1. **It duplicates data.** A hand card's `owner` would always equal its
   own pile's `ownerId`, and a deck card's `{null, false}` is constant
   across the whole pile — a textbook data clump, with the attendant
   risk of the two disagreeing.
2. **It contradicts the user's own framing.** The request named
   visibility as a property *of a pile* ("A Pile can be open..., In
   Hand..., and Mixed"), not of each card.
3. **It would have forced `viewFor` to strip fields back off** to keep
   `myHand` wire-identical, adding work purely to undo the uniformity.
4. **It shrinks the diff.** Deck and hand cards keep their existing
   plain `{id, rank, suit}` shape, so `DEAL`/`DRAW` needed no
   add-then-strip logic at all.

`PILE_VISIBILITY` + the exported `pileVisibility(pile)` in `state.js`
are the concrete expression of "use the Pile as a base to derive the
various Pile types and the behaviors."

**Morpheus ruling (Phase 29 code review): deviation ACCEPTED.** All four
of Neo's reasons hold, and the decisive one is (1): storage uniformity
is only a virtue when the uniform fields carry independent information.
A hand card's `owner` would have been a permanent copy of its own pile's
`ownerId` — two places to express one fact, i.e. exactly the kind of
drift D17 was careful to avoid. The Pile abstraction itself is still
uniform (every pile is `{id, kind, name, ownerId, cards}`); what varies
is the *card* payload, and that variance is real rather than incidental:
a card in a hand has no visibility of its own to express, while a card
in a zone genuinely does. Accepted cost, stated plainly: "is this card
visible?" now has a two-step answer (check the pile's kind; if `mixed`,
check the card). That is inherent to the "Mixed" pile type the user
asked for, not an artifact of this encoding.

**Invariant (added at review — load-bearing for Phase 32):** *exactly
one `kind: 'deck'` pile exists at all times.* `deckOf()` relies on it
(`.find(...).cards`, deliberately unguarded — a missing deck pile is a
programming error, not a runtime condition to handle). Both construction
sites (`createInitialState`, `RESET`) satisfy it and nothing removes it.
**`SPLIT_DECK` (Phase 32) must not delete or re-`kind` the deck pile
when splitting** — the natural-looking "the deck is now N piles, so drop
the deck" implementation would break every later `DRAW`/`DEAL` with an
opaque `Cannot read properties of undefined`. Split leaves an empty deck
pile in place.

**Redaction (`viewFor`) keeps its two existing distinct behaviors —
this is a storage unification, not a privacy/wire-format change:**
- `kind: 'hand'`, `ownerId === viewer` → full cards, unredacted (today's
  `myHand`).
- `kind: 'hand'`, `ownerId !== viewer` → collapse to `{count}` only,
  **never per-card entries** — preserves today's exact
  `otherHandCounts` behavior; a competitor's hand does not start
  leaking individual (even redacted) card ids just because storage
  unified.
- `kind: 'deck'` → `{count}` only, same as today's `deckCount`.
- `kind: 'zone'` → today's existing `redactMiddleCard` per-card
  redaction, completely unchanged.
- **`viewFor`'s output shape is byte-for-byte identical to today**
  (`myHand`, `otherHandCounts`, `zones`, `deckCount`, ...) — this is the
  key scope-limiter: `ui.js`/`main.js`/`protocol.js` need **zero**
  changes, since they only ever consume `viewFor`'s output, not
  `state.piles` directly. The refactor is contained entirely inside
  `state.js`.

**No data-migration concern.** The app is explicitly ephemeral — no
accounts, "nothing survives past the browser tab" (README) — so there
is no persisted old-shaped state anywhere to migrate. Every session
starts fresh from `createInitialState()`. This is a pure code-shape
refactor validated by the existing test suite, not a live-data
migration problem — meaningfully lower risk than a typical schema
change.

**Consolidation this unlocks** (resolves D22's own noted duplication):
one generic `dealRoundRobin(deck, destinationCount, cardsPerDestination,
describeShortfall)` replaces `dealCards()` **and** `SPLIT_DECK`'s
dedicated loop from D22. `cardsPerDestination` as a number = "exactly
this many each" (Deal/Deal More, the only mode that can fail for lack of
cards, hence the caller-supplied `describeShortfall` so each action
words its own error); `null` = "deal until the stock is exhausted"
(Split). One function, one tested implementation, not three reducer
cases each re-deriving round-robin dealing. `DEAL`/`DEAL_MORE`
collapsed into a single shared reducer case differing only by a
`fresh` flag (clear hands first or append), since post-D23 that is
genuinely their only difference.

**Read API — selectors, not raw `state.piles` indexing.** `state.js`
exports `deckOf(state)`, `handOf(state, playerId)`, `handsOf(state)`,
and `zonesOf(state)` so "which pile kind am I looking at" is stated once
rather than re-derived at every call site. `handsOf()` deliberately
includes only players who actually have a hand pile — hand piles are
created on demand and dropped outright by `RESET`, which is what keeps
it `{}` before any deal and again after a reset, matching the pre-D23
`state.hands` semantics exactly.

**Sequencing**: this must land as its **own phase, before** the D21/D22
feature work, not layered on top of the old three-slice model and
migrated later — building `layout`/`insertCard`/`SPLIT_DECK` directly
against the unified `Pile` shape the first time avoids redoing them.
Mouse's phase plan should put this first.

### D24. Zone room grows at the existing desktop breakpoints, bounded by the seat-ring geometry
**Context (user-directed, mid-Sprint-6):** US-32/33 shipped working
stack/overlap, but Phase 31 found the feature had nowhere to be used —
shared zones are capped at `max-width: 13rem` with `max-height: 9rem`,
and personal seat zones ("your zone", the literal target of the request)
at `max-width: 9rem`, about two and a half cards wide. A five-card run
does not fit.

**The root cause is a units mismatch, not a number that was simply too
small.** The pot cap is **absolute** (`13rem` = 208px) while personal
zones are positioned at a **relative** radius (26% of the surface,
`seatPosition(..., 26)`). When 13rem was chosen, the surface was ~700px
wide and that was the right call — the two genuinely would have
collided. D20 then widened the table to ~990–1190px on desktop, which
moved the zone ring outward proportionally while the pot stayed 208px.
The headroom is new; the cap was never revisited against it.

**Two premises in the first draft of this decision were wrong, and only
measuring caught them.** Recorded rather than quietly corrected, because
both were the kind of plausible assumption that would have shipped a
regression:
1. *"The pot is centred, so clearance is a width problem."* It was not
   centred — it sat in normal flow just below the deck area, near the
   top of the surface, while personal zones ring the surface's true
   centre. So the pot and the ring were never concentric.
2. *"Clearance is bounded by zone width."* It is bounded by **height**.
   `top` is a percentage of surface height, and the surface is far wider
   than it is tall, so the 26% ring is a flat ellipse: at 1024px the
   ring is ~199px above/below centre while a *loaded* personal zone (a
   card plus its Pick up / Move to… controls) is ~218px tall on its own.
   An empty zone is a fraction of that — budgeting from one would have
   been meaningless.

**Measured, on the real loaded layout** (a card in a personal zone, at
1024px: surface 768px, ring ±199px, zone half-height 109px → 90px of
clearance from centre, so the pot's half-height must stay under it):

| tier | surface min-height | pot cap | seat zone | measured outcome |
|------|--------------------|---------|-----------|------------------|
| `<1024px` | 26rem (unchanged) | 13rem × 9rem | 9rem | unchanged — see below |
| `≥1024px` | 48rem | 20rem × 10rem | 11rem | no overlap |
| `≥1440px` | 52rem | 24rem × 12rem | 12rem | no overlap |

The surface itself has to grow taller, not just let the pot grow —
otherwise the ring stays where it is and a taller pot immediately
overruns it (verified: growing the pot alone put *both* personal zones
on top of it at every desktop width).

**Vertical room is the scarce axis; horizontal room is the win.** The
pot cap goes 13rem → 24rem wide but only 9rem → 12rem tall. That suits
the actual request: runs and sets lay out horizontally, and the pot
scrolls vertically as it always has.

**Below 1024px: byte-for-byte unchanged, and verified so.** The phone
tier is already over-subscribed — measured on the committed baseline,
*both* personal zones overlap the pot at every width, 900px included.
That is the known, still-open mobile density item. An earlier revision
of this change applied the centring at all widths and measurably made
900px worse; it is now scoped to `≥1024px` precisely so this tier is
left for that item to address properly.

Reusing D20's breakpoints rather than inventing percentage-based caps is
deliberate: percentages would couple zone sizing to the seat-ring maths
in a way that silently re-breaks the click-through bug the original
13rem cap was introduced to fix. Fixed values per tier, checked against
the budget above, keep that invariant inspectable.

**Required regression guard:** the invariant this cap protects has been
violated for real before (a personal zone covering a pot control, caught
only because the e2e suite clicked a button that had become
unclickable). Growing the cap without a test that measures actual
overlap would be trading a documented bug for an undocumented one — so
Phase 32 must assert, via `getBoundingClientRect()` at each breakpoint,
that no personal zone intersects the pot. Same objective-measurement
technique Sprint 4 used to pin down the density threshold.

### D25. Pile types declare their own actions, in one pure table
User request (2026-08-20): "add action types to the Pile derived types so
we can have a universal way of identifying what actions can be performed
on what type of pile", with hover revealing a card's actions, clicking
one highlighting the piles that can receive it, and the card moving there.

`src/pileActions.js` (pure, DOM-free, unit-tested — same rationale as
`seating.js`/`handOrder.js`/`dropTarget.js`) holds three things:
- `ACTIONS` — every action with its label and the *kind* of destination
  it needs (`zone`, `hand`, or `null` for in-place).
- `actionsForCard(pile, card, viewerId)` — what a specific card offers,
  applying the same D7/D12 visibility and ownership rules the reducer
  enforces. A non-owner is offered nothing on someone else's still-hidden
  card, because offering an action the host would reject is a lie.
- `targetsForAction(action, piles, ctx)` — which piles may receive it,
  i.e. exactly what should light up as a drop target. `move` excludes the
  card's current pile, since that is a no-op.

**This is the presentation half only.** The reducer keeps validating
every action it receives (D3 host authority) — this table decides what to
*offer*, never what is *permitted*. Keeping both means the affordances
and the authorization can disagree, so the tests assert they agree on the
cases that matter (shared vs. private face-down, own vs. other hand).

**Status: model landed and tested; the hover/highlight UI is not wired
yet.** Rendering currently still shows per-card control buttons rather
than hover-revealed actions.

### D26. Host-only persistence: a versioned snapshot of `state.piles`, with hands stripped at save time

> **SUPERSEDED by D31 (Sprint 11).** The hand-stripping half of this
> decision is no longer in force. Its reason — guest ids regenerated on
> every join, so a restored hand belonged to nobody — was removed by D27,
> which made identity a client-held `playerKey`. The rest of D26 (versioned
> snapshot, host-only, fail-safe on corrupt blobs) still stands. Left in
> place rather than edited, so the reversal is visible.
US-37. The host is already the sole owner of authoritative state (D3),
so persistence belongs there and nowhere else - guests hold only a
redacted view and have nothing worth saving.

**What is saved.** `{ version, savedAt, code, deckConfig, piles, players,
scores, passed }` under one localStorage key. D23's unification is what
makes this cheap: the whole game is one `piles` array plus three small
maps, so the snapshot is `JSON.stringify(state)` rather than a
hand-maintained serializer that drifts from the reducer.

**Hands are stripped when the snapshot is written, not when it is read.**
This is the load-bearing decision. Hand piles are keyed by a guest's
PeerJS id, which is regenerated on every join (`new Peer()` in
`session.js`), so a restored hand belongs to nobody - and matching by
display name is unsafe, since names are neither unique nor verified (a
live Sprint 6 table had two players named "Drew"). Stripping at *save*
time rather than at restore time means:
- the file on disk never contains anyone's private cards at all, so a
  shared or backed-up browser profile can't leak a hand;
- there is no code path that could ever restore a hand to the wrong
  player, because the data isn't there to mis-assign.
`players`/`scores`/`passed` are kept - they're public info already
(`viewFor`), and scores surviving a refresh is most of the value.

**Reclaiming the table code.** The host's peer id is self-generated
(`generateShortCode()`), so the snapshot stores it and the restore path
re-requests the same code via `new Peer(code)`. Guests can then rejoin
with the code they already have. If the broker refuses it (still held,
or taken), fall back to a fresh code and say so - never fail silently.

**Failure is always "start clean".** A missing, unparseable, or
wrong-`version` snapshot is discarded with a message; it never
half-restores. `version` exists so a future shape change is a clean
discard rather than a crash on someone's stale blob.

**Nothing is transmitted.** The snapshot is written and read on the
host's machine only. `viewFor` and the protocol are untouched, so the
D7 redaction invariant is unaffected by this decision entirely.

**Save cadence:** debounced on state change (the host already funnels
every mutation through one `dispatch`), so a burst of motion doesn't
thrash localStorage.

**Module:** `src/persistence.js` - pure functions over a storage object
(`{getItem,setItem,removeItem}`), so it unit-tests against a fake map
with no browser. Same rationale as `seating.js`/`pileActions.js`.

**Smith Gate 2: approved, with one correction and one addition.**
- **Correction - "hands stripped at save" changes what the host is
  agreeing to, so the prompt wording from Gate 1 amendment 1 must
  change with it.** The snapshot cannot restore hands *even in
  principle*, so the prompt should say hands "weren't saved" rather than
  "can't be restored" - the latter implies the data exists and we're
  declining to use it. Small wording, but it's the difference between a
  limitation and a choice, and the host may reasonably want to know
  their own cards were never on disk.
- **Addition - the snapshot must record the deck's *remaining* contents,
  which is genuinely secret.** Stripping hands is not sufficient on its
  own: `piles` includes the `deck` pile in full order, and knowing the
  deck order is exactly as game-breaking as knowing a hand. That's
  acceptable *because it never leaves the host's own machine* - the same
  browser already holds the live authoritative state in memory - but it
  should be stated in the decision rather than left implicit, since the
  "nothing private is on disk" claim is otherwise overstated.
- Everything else holds: versioned discard-on-mismatch, code
  re-request with an explicit fallback message, nothing transmitted.

### D27. `playerKey` is the identity; the peer id is only an address
User's proposal (2026-08-20), adopted essentially as stated: the host
issues each client a UUID on connect, both ends store it, and the client
presents it on reconnect to get its seat and cards back.

This closes the problem D26 had to route around. A PeerJS id is
regenerated on every join, so anything keyed by it is orphaned the
moment someone refreshes - which is why hands could not be restored and
why "reconnect after refresh" sat open for six sprints. Separating the
two concepts fixes both at once:
- **`playerKey`** - a UUID minted by the host, stable for as long as the
  player is in the game. Everything in game state keys off it:
  `players[].id`, `ownerId`, hand piles.
- **peer id** - where that identity is currently reachable. Held only in
  a transport-level `peerToKey` map, never in game state.

**The host decides identity; the client only remembers it.** A presented
key is accepted only if it names a player already in this game *and* no
live peer is currently using it. An unknown key gets a fresh seat rather
than an error, so a stale key from an old table can never wedge a join;
an in-use key also gets a fresh seat, so a second tab sharing a key
can't hijack a live player's hand.

**Threat model, stated not implied:** a `playerKey` is a bearer token -
whoever holds it can claim that seat and see that hand. That is the same
strength as the table code itself, and matches the PRD's existing
"reasonable effort, not a security guarantee" promise (US-5) for a
same-room game. It would not be adequate for a public/remote product.

**Identity is announced only once the connection is open.** Sending to a
still-`connecting` peer is the known trigger for PeerJS's "Maximum call
stack size exceeded" (backlog), so the announce waits for `connected`
and is de-duplicated per peer.

**Not yet done:** hands still aren't written to disk (D26), so a *host*
reload still can't return them - only a guest reconnect can. Now that
hands are keyed by a stable identity they *could* be persisted safely;
that is a deliberate follow-on decision, not an oversight.

**Module:** `src/identity.js` - pure, DOM-free, unit-tested.

**US-39 addendum - remembering *where* you were.** `playerKey` says who
you are; a second small record (`recard:last-session` = `{code, name}`)
says which table you were in. Together a reload rejoins the live game
with nothing typed. The host equivalent is `hostName` on its own
snapshot, so restoring doesn't ask for a name it already knows.

**Resume lands on the table, not the share screen.** This supersedes
Smith's Gate 1 amendment 3 on US-37, and the reason it can is US-39:
guests now rejoin on their own, so the host no longer has to re-share a
code to get players back. Requiring "Deal & Start" to reach your own
restored table was also actively wrong - it begins a *new round*, when
the entire point of restoring is to continue the interrupted one. The
one exception is a host whose code could not be re-claimed: the code
guests remembered is then stale, so that path still shows the share
screen with an explicit note.

**Auto-rejoin is deliberately conditional.** It fires only when the
remembered code matches the code being opened *and* we hold the name we
used there. A bare shared `?join=CODE` link therefore still stops at the
form - otherwise opening someone else's invite on a browser that had
played before would silently sign you in under the previous player's
name and seat. A corrupt or half-written record reads as "no memory"
rather than a broken rejoin loop, and the session record is cleared when
the host actually ends the session, so we never retry a table that is
gone.

## v1.6 Decisions (Sprint 9, US-40)

### D28. Touch drag is a pointer-driven *recognizer* that calls the same drop code as native DnD — never a second implementation of "what a drop does"

**The problem.** `src/ui.js` drives every card movement with native HTML5
drag-and-drop (`draggable = true`, `dragstart`/`drag`/`dragover`/`drop`,
`e.dataTransfer`). That API is mouse-only: a finger fires *none* of those
events. Five shipped interactions — drag-to-play (US-28), hand reorder
(US-23), stack (US-32), overlap (US-33) and the live drag ghost (US-29) —
are therefore entirely absent on the PRD's primary device.

**Options considered.**
1. *Replace native DnD with pointer events everywhere.* One uniform code
   path, which is genuinely attractive. Rejected for this sprint: it
   rewrites five e2e-verified interactions at once, and it throws away
   behaviours the browser gives us free on desktop (drag image, Escape to
   cancel, OS cursor feedback) that we would then have to rebuild and
   re-verify. The right move if a third input mode ever appears; too much
   blast radius for the one that adds touch.
2. *A third-party touch-DnD shim.* Rejected: D1 (no build step, no
   runtime dependencies) still holds, and this would be unaudited code
   sitting directly on the privacy-sensitive card path.
3. **Chosen: a small pure gesture recognizer plus a binder that reuses
   the existing handlers.**

**The load-bearing rule.** The native `drop` listeners currently compute
placement *inline*. Before any touch code is written, those bodies are
extracted into named functions — `performZoneDrop(row, zoneEl, cardId,
point, opts)` and `performHandReorder(container, draggedId, beforeEl,
onReorder)` — and the native listeners are rewritten to call them. Touch
then calls **the same functions**. There must be exactly one
implementation of what a drop means, because if touch and mouse ever
compute placement separately they will drift, and only one of the two is
covered by the desktop e2e suite. This extraction is a pure refactor and
must be green *before* the touch layer exists.

**`src/touchDrag.js` — a pure state machine, no DOM.** Same rationale as
`dropTarget.js` (D21), `seating.js` (D18) and `handOrder.js` (D14): the
interesting part is the gesture logic, and it is only directly testable
if it is not tangled up with element lookups. It consumes timestamped
pointer samples and emits `lift` / `move` / `drop` / `cancel`:

```
idle ──pointerdown──► pending ──HOLD_MS elapsed, still within slop──► lifted
                        │                                              │
                        ├── moved > SLOP_PX before the hold ──► idle   ├── move ──► dragging
                        └── pointercancel / pointerup ───────► idle    └── pointerup ──► drop
```

- `HOLD_MS = 250` — Smith Gate 1: press-and-hold, matching the gesture
  `ui.js` already binds for the D13 lift cue, rather than a rival one.
- `SLOP_PX = 8` — **this is what keeps the page scrolling.** A finger
  that travels more than 8px before the hold elapses is a scroll and can
  never become a drag. Smith's Gate 1 analysis rules out any
  direction-based test: `#hand-area` is `overflow-x: auto` *and* hand
  reorder is horizontal, while playing a card is vertical *and*
  `#table-area` is `overflow-y: auto`. Neither axis is free in either
  region, so "which way did it move" cannot disambiguate anything here.
  Time-plus-slop can.
- If the browser starts scrolling first, we receive `pointercancel` and
  abandon — the same terminal state, arrived at from the other side. The
  two mechanisms agree rather than race.
- `touch-action: none` is applied to the source element **only while
  lifted** (a class, removed on cleanup). Setting it up front would kill
  scrolling on every card permanently — the exact failure Smith's AC
  forbids.

**The drag visual is a floating clone, not the moved element.** The
source gets `.card-dragging` (dimmed, stays in place) and a
`.touch-drag-ghost` clone follows the finger under `document.body`.
The alternative — transforming the source itself — is a trap here: hand
cards carry an *inline* `transform` for the US-30 fan (`rotate(...)
translateY(...)`), so dragging would have to overwrite and later restore
it, and any drop that is a no-op (dropping in dead space) re-renders
nothing and would strand a card mid-air. A clone has no state to restore:
cleanup is `ghost.remove()`, which is correct by construction.

**Hit-testing.** The binder calls `setPointerCapture` so moves keep
arriving outside the source element; because capture stops event
retargeting, the drop target is found with
`document.elementFromPoint(x, y)` and `.closest('[data-zone-id]')` /
`.closest('.hand-card')`. The ghost is `pointer-events: none` so it
never hit-tests as itself.

**Consequences.**
- Drop feedback (`zone-drag-over`, `drop-onto`/`drop-before`/
  `drop-after`) is driven from the shared `showDropHint` path, so touch
  gets identical feedback to mouse — Smith AC, and free once the
  extraction above is done.
- `onCardDrag` / `onHandMotion` fire from the recognizer's `move` and
  `lift`/`drop`, so US-29's live ghost reaches other players from a
  touch drag with no protocol change at all. D19's channel is unchanged.
- A `cancel` clears the ghost *and* sends the `onCardDrag(null)` stop
  signal immediately (Smith Gate 1 amendment 5) — the 2s motion TTL
  stays what it was meant to be, a backstop for dropped packets.
- The e2e must run in a `hasTouch` context driven by `page.touchscreen`.
  A mouse emits pointer events too, so a mouse-driven "touch" test would
  pass on precisely the code path a finger fails — which is how this gap
  stayed invisible for six sprints.

**Smith Gate 2 (2026-08-20) — approved, with 3 corrections.**

1. **The existing lift cue has to move onto the recognizer, or the
   player holding the card is the last to know they picked it up.**
   `ui.js` binds the D13 cue to raw `pointerdown` — it fires the
   *instant* a finger lands. D28 puts local lift confirmation 250ms
   later. So as written, everyone else at the table sees "Drew is
   holding a card" before Drew sees anything at all, and — worse — a
   finger that merely brushes a card while *scrolling* broadcasts a
   phantom lift to the whole table and then silently abandons. The cue
   must fire from the recognizer's `lift`, so that what the table sees
   and what the holder sees are the same event.
2. **Offset the ghost above the finger.** A ghost centred under the
   touch point is covered by the hand holding the phone, and so is the
   `drop-onto`/`drop-before` hint underneath it — the feedback this
   story exists to provide would be delivered exactly where it cannot be
   seen. This has no mouse equivalent, which is precisely why a design
   derived from the mouse path misses it.
3. **The lift confirmation must be unmistakable, not tasteful.** It is
   the *only* feedback in the entire gesture: nothing marks the 250ms
   pending state, so a user whose hold didn't take gets silence and no
   way to tell a failed gesture from a broken app. Given that, the
   transition into `lifted` has to be impossible to miss.

Noted as a required property rather than a change: the ghost must be a
clone of the **rendered** element, never re-rendered from card data — a
redacted card is only redacted in the DOM, so cloning is safe by
construction and re-rendering would not be.


## v1.7 Decisions (Sprint 10, US-41/US-42)

### D29. Dealing is a *pile-level* action, and that is why it cannot ride D25's per-card hover row

The obvious implementation — add `'deal'` to `actionsForPileKind('deck')`
— is wrong, and Smith's Gate 1 objection is the symptom rather than the
cause. D25 answers **"what can this CARD do"**: its actions act on the
card you are hovering, and they are offered on that card. Dealing does
not act on the hovered card at all; it acts on the whole pile. Adding it
to that table would offer "Deal" on every back in the stack, in a hover
row, one row from Draw — an irreversible action reachable by passing a
cursor over a card.

So this sprint adds a second, deliberately separate concept:

```js
// pileActions.js, alongside actionsForCard
export function pileLevelActions(kind, { isHost }) // -> ['deal', 'reshuffleDeal']
```

Pure and DOM-free like the rest of that module. Card-level and pile-level
actions stay different functions because they are different questions,
rendered by different mechanisms: card actions in the hover row, pile
actions in a persistent control strip attached to the pile itself.

**This is also what resolves Smith's blocker rather than patching it.**
`renderDeck` currently hides its whole container when the count reaches
zero, so putting deal "on the deck" would make it vanish exactly when it
is most needed. Because the control strip is a sibling of the card stack
rather than part of it, the `hidden` short-circuit now applies to *the
stack only*: an empty deck renders as an empty-deck slot with its
controls still present. The fix falls out of the structure instead of
needing a special case.

**Reducer: no new actions.** `DEAL`/`DEAL_MORE` are already one case
differing by a `fresh` flag (D15/D23), and `RESET` already gathers and
reshuffles. "Reshuffle & deal" is `RESET` followed by `DEAL` — two
existing dispatches, not a third code path that could drift from either.

### D30. `expectedPlayers` is host-local trigger state, never game state

It goes in `main.js` beside `role`, not in the reducer. Three reasons,
each of which would be a bug if ignored:

- **Guests have no use for it** and broadcasting it would put a host's
  setup preference into every client's view for nothing.
- **It must not reach the D26 snapshot.** A persisted expected-count
  would re-arm auto-start on a host reload and deal over a restored
  table — destroying the round the restore just rescued.
- **It is a trigger, not a limit** (Smith Gate 1 answer 2). A capacity
  cap would live in the reducer and would wrongly reject a *reconnecting*
  player, who arrives looking exactly like a new one.

**Firing exactly once, without a flag.** The guard is not a boolean but a
condition that is already true only once: auto-start fires only while the
host is still on the share screen, pre-game. Once the game screen is up
the trigger is structurally dead, so a player leaving and rejoining
mid-game cannot re-deal — and unlike a flag, this survives a host reload
with no extra state to persist or reset.

**Implementation correction (Phase 47).** D30 as first written counted
*seats*, and the once-only guard was "the host is still on the share
screen". Both were wrong, and only building it showed why:

- `showScreen` hides `#screen-host`, not `#host-share` (a div inside it),
  so the share-screen check never became true - it was dead code. The
  real signal is the game screen being visible.
- Counting seats deals to a peer that is still `connecting`. The client
  isn't ready to receive, so it never gets the `identity` message and
  reconnects as a stranger - leaving a **ghost seat holding the dealt
  cards** beside a live seat holding none. Observed as a roster reading
  `Dan - disconnected (6 cards)` next to `Dan - connected (0 cards)`.
  Auto-start therefore counts **connected** players, which is the same
  settled-state condition D27 already uses for the identity announcement,
  rather than a timing guess.
- The trigger is additionally zeroed *before* `startGame`, because
  `startGame` dispatches before it changes screen, so the re-render that
  dispatch causes re-enters the check with the old screen still showing.

Empty field = no auto-start = today's behaviour exactly (Smith Gate 1
answer 3). Auto-start reads the cards-per-player input at the moment it
fires (Gate 1 amendment 4), which is the same value the manual button
would have read.

**Smith Gate 2 (2026-08-20) — approved, with 2 corrections.**

1. **Making a destructive action discoverable raises the price of having
   no confirmation.** `Reshuffle & Reset` has never had a confirm, and
   that was survivable while it sat in a button row nobody looked at.
   This sprint's entire purpose is to move dealing somewhere people
   actually look — so the same click now lands under the cursor of a host
   who came to deal one more card. It wipes every player's hand, and the
   other players see their cards vanish with no warning and no stated
   cause. **Reshuffle & deal needs a confirm.** This is not a
   pre-existing-condition argument: the risk is new because the
   discoverability is new.
2. **`renderDeck` is called twice — `#host-deck-area` *and*
   `#game-deck-area`** (`main.js`). A control strip "attached to the
   pile" therefore appears on the host share screen too, immediately
   beside `Deal & Start`, offering a second way to deal with *different*
   semantics. Two adjacent deal controls that do different things is
   worse than the one badly-placed control we started with. The strip
   belongs on the game screen only; the share screen keeps `Deal &
   Start`, which is the "begin the game" action, not the "deal" one.

Noted, not blocking: a host who sets an expected count and then reloads
loses it (D30 deliberately does not persist it). That is the safe
direction — the alternative re-deals a restored table — but the host
should not have to wonder. Fine to ship; worth a line in the UI if it
ever bites.


## v1.8 Decisions (Sprint 11, US-43/44/45)

### D31. D26 is reversed, deliberately and on the record: hands ARE persisted now

D26 stripped hands at save time, and gave a specific reason: hands were
keyed by a PeerJS id that guests regenerate on every join, so a restored
hand belonged to nobody, and the obvious fallback (match by display name)
was unsafe because names are neither unique nor verified.

**D27 removed that reason.** The identity is now a client-held
`playerKey`, presented on reconnect and resolved by `resolvePlayer` —
which already refuses an unknown key a seat that isn't its own. So the
condition D26 was waiting for has been met, and continuing to strip
hands would be following the letter of a decision whose premise no
longer holds.

The snapshot keeps hand piles. Restoration is by `playerKey` only —
never by name — and an unrecognised key still gets a fresh seat, exactly
as it does for a live join. There is no new matching logic: hand piles
carry `ownerId`, `ownerId` is a `playerKey`, and the existing identity
path does the rest.

**What this costs, stated rather than implied.** Hands now land on disk
in the host's browser profile. That is a real reduction in the privacy
property this project advertised, and the README changes with it in the
same sprint. It is a change of *degree* rather than kind — the snapshot
already stored the deck's full remaining order, which breaks a game as
thoroughly as any hand — but "already partly true" is not a licence to
leave the docs wrong. `SNAPSHOT_VERSION` is bumped, so older blobs
(which have no hands) are discarded rather than half-restored.

### D32. Reconnection is the client retrying, not the host tracking anything

The host has no way to reach a client that has lost it. So the retry
belongs entirely to the client, and the host's only job is to be
reachable again on the same code — which it already is, because a host
re-claims its own table code on restore (D26/US-37).

- On losing the host, the client **stops calling `forgetSession`**. That
  call is what makes reconnection impossible today: it erases the code
  and name at exactly the moment they become useful. It moves to the
  points where the session is genuinely over — an explicit leave, or the
  retry budget being exhausted.
- Retries back off (1s, 2s, 4s… capped) to a bounded budget, then stop
  and offer a manual retry (Smith Gate 1 answer 1). A loop with no end
  is a battery cost the player never agreed to.
- `session-ended` splits into two outcomes: **`host-lost`** (retryable,
  the message says so) and **`session-ended`** (final). Smith Gate 1 #2:
  a client that is about to retry must never first be told the session
  is over, and must not be scared and then corrected.

### D33. The wait list is computed from the snapshot, and it is not "all players"

```js
// persistence.js, pure and unit-testable
export function expectedReturners(snap) // -> players connected at save time
```

Smith's Gate 1 blocker, expressed as a function. The snapshot stores
`state.players` verbatim, `connection` included, so someone who quit long
before the host reloaded is still in that list. Waiting for all of them
waits forever for people who are never coming, and the auto-resume never
fires — a worse dead-end than the one this replaces. The wait list is
therefore *players whose `connection` was `connected` when the snapshot
was written*, minus the host itself.

**Resume follows Sprint 10's correction, not Sprint 10's first draft.**
It counts **connected** players (never seats), it is guarded by a
condition that is only true before the game resumes, and the trigger is
cleared *before* resuming rather than after — all three of which Sprint
10 got wrong first and had to correct in D30. "Start anyway" clears the
same trigger, so the two paths cannot both fire.

**Smith Gate 2 (2026-08-20) — approved, with 3 corrections.**

1. **D31 falsifies wording I wrote, and the wording is user-facing.** The
   restore prompt says *"Players' hands were not saved, so you will need
   to deal again."* That was my own Sprint 7 Gate 1 amendment, and its
   whole purpose was to state an unrecoverable cost before the click.
   After D31 it is simply false, and false in the direction that makes a
   host decline a restore they would have accepted. Every place that
   states the old guarantee changes in this sprint: the prompt, the
   README, and D26's own entry (marked superseded, not edited away).
2. **The retry budget has to outlast a human reading a dialog.** D32 says
   the host "is reachable again on the same code" — but only if the host
   *accepts* the restore, and that is a `window.confirm` waiting on a
   person who has just been surprised by a reload. Clients start retrying
   immediately; the host may take 30–60 seconds to arrive, read, and
   decide. A budget tuned to network flakiness will expire while the host
   is still reading. And if the host *declines*, they get a new code and
   every retrying client is hammering one that no longer exists until its
   budget runs out — so the budget being finite is what protects them.
3. **A client that reconnects mid-wait must not land on a blank table.**
   Retrying clients will arrive while the host is still on the waiting
   screen, before resume. If they get a normal game view they will see an
   empty table with none of their cards and reasonably conclude the game
   is gone — and quit, which is precisely the outcome this sprint exists
   to prevent. They need the same "waiting for players" state the host
   sees, including who else is still missing.


## Module Layout
```
index.html              entry page, host/join screens, game screen
style.css                styling
src/deck.js               Card + Deck: build/shuffle/deal (pure logic)
src/state.js               host-side authoritative state + reducer(action) -> state
src/session.js              PeerJS wiring: create/join, connection roster, send/recv envelope
src/protocol.js              message envelope helpers: state vs. motion, throttling/coalescing
src/ui.js                     DOM rendering: hand, table, roster, connection status
                                 v1.3: top-down table/seat layout, drag-and-drop
                                 (D17-D19), live card-drag ghost rendering
src/qrcode.js                  small vendored QR renderer (no external network call at runtime)
src/presets.js                  v1.1: static game-preset lookup (US-15)
src/rulesReference.js            v1.1: static rules-reference content (US-18)
src/handOrder.js                  v1.2: pure client-side hand-order reconcile/sort (US-23, D14)
src/seating.js                      v1.3: pure per-viewer seat rotation + seat geometry (D18),
                                     unit-testable in isolation rather than only verified via DOM
                                     position assertions in e2e
src/pileActions.js                  v1.5/v1.7: per-card actions (D25) AND the separate
                                     pile-level action table (D29) - two questions, two
                                     tables, deliberately not merged
src/touchDrag.js                    v1.6: pure press-and-hold drag recognizer (D28) - turns
                                     timestamped pointer samples into lift/move/drop/cancel,
                                     with no DOM access, so the gesture rules are unit-testable
src/main.js                        wires session + state + ui together
tests/deck.test.js                  node:test unit tests for deck.js
tests/state.test.js                  node:test unit tests for state.js reducer (incl. D7-D9: middle
                                      redaction, REVEAL authorization, PICKUP, scores, solo/1-player;
                                      v1.2: D12 zones/CREATE_ZONE/MOVE_CARD, D15 DEAL_MORE, D16 pass)
tests/handOrder.test.js               v1.2: node:test unit tests for handOrder.js (D14)
tests/seating.test.js                 v1.3: node:test unit tests for seating.js (D18)
```

## Testing Strategy
Pure logic (`deck.js`, `state.js`, `protocol.js`) is unit-tested with
Node's built-in `node:test` (`npm test`) — no framework dependency needed.

Full P2P flow **is** automatable (revised 2026-08-15 — originally assumed
not to be): `tests/e2e.smoke.mjs` drives two real Playwright browser
contexts against the actual PeerJS broker/WebRTC (`npm run test:e2e`),
covering host/join, deal, play/draw propagation, and the host-disconnect
banner. Playwright is a devDependency only — no runtime/build-step impact
on the shipped static site (D1 still holds). Smith/Trin can still do
additional manual two-tab testing for anything the smoke test doesn't
cover (visual/UX judgment calls, not just functional correctness).

## UI Conventions
- **Interactive elements are ≥44×44px** (iOS HIG / Material minimum),
  including secondary/small buttons. Added 2026-08-15 after Smith's
  Sprint 2 close-out test measured `.fd-btn`/`.score-btn` at ~25×20px
  and ~19×17px — a real touch-accuracy defect, not a style nit — see
  `docs/DECISIONS.md`. State this once here instead of rediscovering it
  per phase.

## Open Items Carried Forward (not blocking v1)
- **3+ players at ~1024px: a personal seat zone overlaps the shared pot.**
  Surfaced at Sprint 9 while adding touch coverage; D24's grown zone caps
  had only ever been measured against a two-player seat ring. Distinct
  from the phone-density item below (that one is about crowding at 5+ on a
  narrow screen; this is a desktop-width geometry error at 3).
- Reconnect-after-refresh (PRD Open Question 4) — deferred, still open
  after Sprint 3.
- Max players — soft cap at 8, enforced in UI copy only, not hard-blocked.
- Custom card backs/themes — deferred.
