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
