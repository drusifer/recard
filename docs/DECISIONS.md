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
