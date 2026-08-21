# Decisions — Recard

Recorded by Oracle. Format: Context, Decision, Consequences.

**Superseded as of 2026-08-21 (Sprint 14 groom).** This narrative log
stops at D20 (Sprint 5) — D21 onward were recorded directly in
`docs/ARCHITECTURE.md`'s per-sprint "## vX.Y Decisions" sections instead
and never backfilled here, a gap flagged twice (Sprint 12 and Sprint 13
groom notes) with no action taken until now. Rather than a
lower-confidence retroactive backfill of 23 decisions' worth of
narrative, this file is now explicitly superseded: **`docs/ARCHITECTURE.md`
is the single source of truth for every decision from D21 onward.**
D1-D20 below remain accurate and are not being rewritten.

## 2026-08-15 — v1 architecture (D1-D6)

**Context:** Cypher's PRD required a same-room, peer-to-peer card game app
with "no server infrastructure," which is in tension with WebRTC's need
for out-of-band signaling, and later with a live "best-effort movement
sync" requirement (US-11) added mid-sprint.

**Decision:** Morpheus recorded six binding decisions in
`docs/ARCHITECTURE.md`:
- D1: static site, no build step.
- D2: PeerJS + its public signaling broker (accepted as a small external
  dependency, not infra we operate) instead of manual copy/paste offer
  codes.
- D3: star topology, host-browser-authoritative state.
- D4: two message classes — reliable "state" messages are the only source
  of truth; best-effort "motion" messages are cosmetic-only and safe to
  drop.
- D5: join via PeerJS ID as a join code + copyable link.
- D6: no persistence/reconnect in v1; host tab closing must show an
  explicit "session ended" message (Smith's Gate 2 condition), not a
  silent freeze.

**Consequences:** Full-mesh P2P complexity was avoided for v1 at the cost
of the host being a single point of failure (accepted and documented, not
hidden — see D6 and README "Known v1 limitations"). The state/motion
message split meant US-11 could be implemented without ever risking game
state correctness, even though motion delivery is unreliable-by-design.

## 2026-08-15 — QR code image descoped to v1.1

**Context:** `docs/USER_STORIES.md` originally required a scannable QR
code for joining (Gate 1). Implementing a correct QR encoder (Reed-Solomon
error correction, mask scoring) from scratch was judged too high-risk to
ship unverified — there was no camera/scanner available in the dev
environment to confirm a hand-rolled encoder actually produces a scannable
code, and vendoring a third-party encoder would have required a build
step, which D1 rules out.

**Decision (Neo, accepted by Cypher):** v1 ships a join code + a "Copy
Link" button instead of a QR image. Scannable QR moved to
Deferred/Stretch in `docs/USER_STORIES.md`.

**Consequences:** Slightly less zero-friction than a camera scan, but a
verified-working feature beats an unverified one. Revisit in v1.1 with a
real device available to confirm scannability.

## 2026-08-15 — P2P flow is automatable after all

**Context:** `docs/ARCHITECTURE.md`'s original Testing Strategy assumed
the full P2P flow could not be automated in this environment and would
need manual two-tab verification by Smith/Trin.

**Decision:** Neo built `tests/e2e.smoke.mjs` using Playwright with two
real browser contexts against the actual PeerJS public broker and real
WebRTC — no mocking. It covers host/join, deal, play/draw propagation,
the host-disconnect banner, and (added during phase 5) US-11 motion
propagation via a real drag gesture.

**Consequences:** `ARCHITECTURE.md`'s Testing Strategy section was
updated to reflect this. Playwright is a devDependency only (no runtime
impact, D1 still holds). This is now the strongest verification tool in
the project — every phase gate from Phase 4 onward cited real e2e output,
not just code review.

## 2026-08-15 — v1.1 architecture (D7-D11): card orientation, score, presets

**Context:** Post-launch, the user asked for card orientation (face-up/
face-down play, turning a card over), a shared "middle" for multi-player
interaction (poker/gin rummy style), quick-start game presets, simple
score tracking, an in-app rules reference, and confirmed solo play. The
user explicitly reframed the product's own vision mid-request: "the goal
is not to capture every rule of every game but rather to allow any game
to be played by supporting basic operations... just enough structure to
support common card game mechanics" — recorded verbatim in
`docs/PRD.md`'s Vision section as the standing test for future scope.

**Decision:** Morpheus recorded five more binding decisions:
- D7: middle-zone cards get `owner`/`faceUp` fields, redacted via one
  rule (`faceUp || owner === viewer`) — the same per-viewer redaction
  mechanism D3 already used for hands, generalized to a second zone
  rather than inventing a new mechanism. This single rule covers all
  four visibility cases the user asked for (public, shared-hidden,
  privately-owned-hidden, privately-owned-revealed) — including the
  hole-card case the user confirmed was wanted alongside the community-
  card case, after Cypher had flagged rather than assumed which one(s).
- D8: three reducer actions — `PLAY` (now takes `visibility`), `REVEAL`
  (authorization: shared → anyone, private → owner only), `PICKUP`
  (face-up only).
- D9: `scores` is a flat map, `ADJUST_SCORE` accepts only ±1 (matches the
  user's "just a simple set of buttons" framing), untouched by `RESET`.
- D10: presets (`src/presets.js`) and the rules reference
  (`src/rulesReference.js`) are pure static client-side data — zero
  `state.js`/protocol surface, since none of it varies at runtime or
  needs to sync between clients.
- D11: solo play (1 player) needed no architecture change — Cypher had
  already grepped `src/` before writing the story and found no
  player-count gate anywhere; Sprint 2 added a regression test, not new
  implementation, to make that guarantee explicit and durable.

**Consequences:** Every new privacy/visibility requirement fit the
existing D3 pattern instead of requiring a new one, which kept the
sprint's actual code changes small relative to its product scope (6
phases, mostly additive). Smith's Gate 1 added several UX requirements
(ownership visibility even when face-down, a confirm-step specifically
for revealing *private* cards, reused tap/drag gestures) that the e2e
suite (Phase 11) now directly verifies, including the confirm-cancel path
Neo's own ad-hoc check hadn't covered but Trin's independent UAT did.

## 2026-08-15 — v1.2 architecture (D12-D16): zones, presence, hand tools

**Context:** Post-v1.1, the user asked for named work areas beyond one
shared middle pile (multiplayer layouts like a discard pile separate from
a shared draw pile), a livelier sense of "the table feels live" (cursor/
motion visibility), a fix for Sprint 1's retro-flagged tech debt (manual
hand drag-reorder gets silently wiped by the next state broadcast),
incremental/staged dealing, and a simple pass marker.

**Decision:** Morpheus recorded five more binding decisions:
- D12: `state.table` generalizes to `state.zones` (named, each with its
  own card list). Card ids are already globally unique, so `REVEAL`/
  `PICKUP` need no signature change — they search across all zones.
  `PLAY` gets an optional `zoneId` (defaults to the original single
  zone). New `CREATE_ZONE`/`MOVE_CARD` actions; `MOVE_CARD`'s
  authorization mirrors D8's `REVEAL` rule (owner-only while still
  hidden, anyone once visible).
- D13: live cursor (broadcast position normalized 0.0-1.0 to the game
  screen's own bounding box, so it means the same thing across different
  viewport sizes) reuses D4's existing best-effort motion channel with
  zero new transport. Full pixel-synchronized card dragging was
  deliberately scoped down to a lightweight "lift cue" (broadcast
  `{cardId, active}`, receivers who can already see that card per D7 show
  a lifted state) rather than solving cross-client layout-independent
  drag math, which the actual "table feels live" goal didn't need.
- D14: hand order (sort buttons + manual drag-reorder) is a new pure
  client-side module (`src/handOrder.js`), never part of authoritative
  state. `reconcileOrder()` keeps existing ids in position across a state
  update, appends new ones, drops gone ones — the actual fix for the
  Sprint-1 tech debt, and both sort buttons and drag-reorder write into
  the same order list so they can't fight each other (Smith Gate 1).
- D15: `DEAL_MORE` is a new, separate reducer action from `DEAL` (same
  distribution logic, but doesn't clear existing hands first) rather than
  a flag on `DEAL` — the two have different enough semantics
  (round-start reset vs. mid-round top-up) that conflating them would
  cost clarity for no savings.
- D16: pass marker (`state.passed`, cleared on `RESET` unlike scores)
  needed zero new authorization code — `main.js`'s existing
  guest-action-id-overwrite (the same mechanism that already makes
  `DRAW`/`PLAY` "act as yourself only") already enforces self-only
  toggling.

**Consequences:** No new protocol/transport surface across all five
decisions — D12-D16 each generalize or reuse an existing v1/v1.1
mechanism (D3/D4/D8/D9's actor-auth pattern) rather than inventing a new
one, consistent with the pattern D7 set last sprint. Phases 18-19 (UI
wiring + formal e2e coverage) needed zero `state.js`/`protocol.js`
changes as a result - confirmed in code review, not just predicted. One
real pre-existing test-infrastructure gap surfaced during this sprint's
regression testing (native HTML5 drag-and-drop doesn't fire from
synthetic input in this headless environment) and was fixed at the test
level only; see `agents/oracle.docs/lessons.md` Sprint 3 section.

## 2026-08-15 — v1.3 architecture (D17-D19): top-down table redesign

**Context:** Post-v1.2, the user asked for a visual/interaction overhaul:
a top-down table with players seated around it, a personal area in front
of each seat, drag-and-drop instead of tap+dropdown as the primary
interaction, and seeing other players' card movements live. Three
forking questions were confirmed with the user before drafting stories
(not assumed): drag snaps to the existing named-zone model rather than
freeform per-pixel placement; every player auto-gets one personal zone;
and — corrected mid-draft by the user — live card-drag should be true
real-time position broadcast (best-effort/approximate explicitly
accepted), not just an animated jump on drop.

**Decision:** Morpheus recorded three more binding decisions:
- D17: personal zones are ordinary `zones` entries with one new optional
  field, `ownerId: playerId | null`. `JOIN` auto-creates one (reusing
  `CREATE_ZONE`'s own construction logic, not duplicated); every reducer
  case treats it exactly like any other zone - `ownerId` only matters for
  UI seat placement. "Not user-deletable" needed zero new guard code,
  since no zone (personal or shared) has ever had a delete action.
- D18: seating is a per-viewer client-side rotation (`seatedOrder`) plus
  pure geometry (`seatPosition`) - no new state or protocol field. Each
  client computes its own seat order from the same shared roster; the
  viewer always lands at the bottom. Both functions were extracted into
  a new `src/seating.js` (mid-sprint, in direct response to user
  feedback - "unit tests form the base of the pyramid" - mirroring the
  existing `handOrder.js` precedent) so the geometry is verified by real
  unit tests, not only indirectly through DOM position assertions.
- D19: live card-drag broadcast extends D13's existing best-effort
  motion channel with one new kind, restoring the PRD's original
  Principle 6 rather than contradicting D13's earlier build-cost
  reasoning - the user explicitly accepted the tradeoff D13 had
  previously declined. Privacy rule: a dragged card's id is broadcast
  iff it's already face-up at drag-start, proven sufficient by the
  existing `MOVE_CARD` authorization rule (nothing draggable at all can
  be visible to a receiver but invisible to the dragger). The pure
  privacy predicate (`cardDragPayload`) was written test-first, per the
  user's TDD request partway through this sprint - the test import
  failed before the function existed, then passed once implemented.

**Consequences:** Zero new protocol messages across all three decisions
- one new zone field, one new client-side-only module, one new `kind` on
an already-generic channel. A real, measured UX finding came out of the
Phase 26 density pass Smith's Gate 1 had specifically asked for: an
~8-player table badly overlaps on a 390px screen, and objective
`getBoundingClientRect()` measurement (not just a screenshot read)
pinpointed the degradation starting exactly at 5 players, not sooner or
later. A first fix (table surface scales with player count) measurably
helped but didn't fully resolve it - the existing 44px touch-target
floor (Sprint 2) puts a hard lower bound on how compact a seat card
carrying score controls can get. Reported honestly as "improved, not
resolved" rather than overclaimed; see `agents/smith.docs/` for the
Stage-3 close-out disposition.

## 2026-08-16 — v1.4 architecture (D20): desktop table width

**Context:** User report - "I need more room on desktop browsers."
`#screen-game`'s `max-width` flatlined at 760px (itself the result of an
earlier Smith finding, set relative to a 480px phone baseline) with no
further tier for laptop/desktop viewports, so a 27" monitor rendered the
same cramped-relative-to-screen table as a small laptop. Deliberately
scoped away from the still-open 5+-player mobile density backlog item
(D17-D19's Consequences above) - opposite problem, same code area, not
conflated into one fix.

**Decision:** Morpheus recorded D20: two new `@media` breakpoint tiers
on `#screen-game` - `min-width:1024px` -> `max-width:1100px`,
`min-width:1440px` -> `max-width:1300px` - chosen to land exactly on the
UAT checkpoints Smith requested at Gate 1, and deliberately bounded
(not unconstrained on an ultra-wide/4K monitor) per Cypher's AC. Verified
in `src/seating.js` *before* deciding anything: `seatPosition()` already
places every seat/zone as a percentage of `.table-surface`, which has no
independent `max-width` of its own - so widening the outer container is
provably sufficient on its own. **Zero JS/state/protocol changes** -
pure CSS, the smallest-scoped sprint in the project's history (1 phase,
1 story).

**Consequences:** Trin's UAT added two checks beyond the story's own AC,
both real gaps, not restatements: (1) an objective `.table-surface`
width measurement (582px -> 922px across the range) actually proving the
AC's "used by content, not padding" claim, which the 4 fixed-width
checkpoints alone didn't verify; (2) a continuous-resize monotonicity
sweep through both breakpoints (Smith's Gate 2 request), catching the
class of bug a snapshot-only test can't. A real, non-blocking finding
surfaced during that same measurement: with exactly 2 seated players,
`seatPosition()`'s angle math places both seats at `leftPct=50`
(directly above/below each other, not side-by-side), so a 2-player
table's seats don't visibly spread out from this width increase even
though the surface under them does - pre-existing geometry, not a D20
defect, out of this story's scope. 3+-player tables get real horizontal
seat spread. Logged for awareness, not filed as a bug.
