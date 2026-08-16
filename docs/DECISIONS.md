# Decisions — Recard

Recorded by Oracle. Format: Context, Decision, Consequences.

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
