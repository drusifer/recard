# Project Memory

This file serves as a consolidated index of project-wide decisions, historical context, and key milestones. It is maintained by the Oracle and reviewed by all agents to ensure consistency.

## Project Context
- **Project Name:** Recard
- **Start Date:** 2026-08-15
- **Key Objectives:** A web app that replaces a physical deck of cards for
  people playing a card game in the same room. Peer-to-peer, no server
  infrastructure to run/operate. Sharpened 2026-08-15 (v1.1, user's own
  words): ships composable primitives (deal, private hand, play a card
  public/shared-hidden/privately-hidden, reveal, draw/pick up, manual
  score), not any one game's rules — "just enough structure to support
  common card game mechanics." See `docs/PRD.md`.

## Major Decisions
| Date | Decision | Rationale | Consequences |
|------|----------|-----------|--------------|
| 2026-08-15 | Static site, PeerJS + public broker, star topology, reliable-state/best-effort-motion message split (D1-D6) | "No server infra" + P2P + live motion sync all needed to coexist; see full rationale | See `docs/DECISIONS.md`; no full-mesh complexity, host is a documented single point of failure |
| 2026-08-15 | QR code image descoped to v1.1, ship join-code + Copy Link | Unverifiable hand-rolled QR encoder is worse than none | US-1/US-2 AC updated; QR moved to Deferred/Stretch |
| 2026-08-15 | Full P2P flow is e2e-automatable (Playwright, real WebRTC) | Originally assumed manual-only; proven otherwise | `tests/e2e.smoke.mjs` is now the strongest verification tool in the project |
| 2026-08-15 | v1.1: middle-zone cards get `owner`/`faceUp`, one redaction rule (D7-D11) — orientation/reveal/pickup, score, presets, rules reference, solo play | Generalized D3's existing hand-privacy pattern instead of inventing a new one; user confirmed both face-down forms (community + hole-card) were wanted | 6-phase sprint ("clear backlog"), all e2e-verified; see `docs/DECISIONS.md` |
| 2026-08-15 | v1.2: `table` generalizes to named `zones`, live cursor + lightweight card-lift cue, client-side hand-order module (fixes Sprint 1 tech debt), `DEAL_MORE`, pass marker (D12-D16) | Every decision reused an existing v1/v1.1 mechanism (D3/D4/D8/D9's patterns) instead of inventing a new one | 8-phase sprint ("zones, presence, hand tools"), zero new protocol surface, all e2e-verified; see `docs/DECISIONS.md` |
| 2026-08-15 | v1.3: top-down table with per-viewer seating, personal per-seat zones, drag-and-drop play/move, live real-time card-drag broadcast (D17-D19) | User explicitly restored the PRD's original Principle 6 (true live motion) that D13 had scoped down; zero new protocol messages, one new zone field + one new client module + one new motion kind | 6-phase sprint ("top-down table redesign"), all e2e-verified; real 5+-player mobile density finding reported honestly as improved-not-resolved, see `docs/DECISIONS.md` |
| 2026-08-16 | v1.4: desktop table width - two `@media` tiers on `#screen-game` (1024px->1100px, 1440px->1300px) (D20) | User: "I need more room on desktop browsers"; `seating.js` geometry already percentage-based, so pure CSS was provably sufficient, verified before deciding | First Fast-Track (1-phase) sprint, zero JS/state/protocol change; Trin's UAT found a real AC-coverage gap in Neo's own tests and a real (non-blocking) 2-player vertical-seat-geometry limitation, see `docs/DECISIONS.md` |
| 2026-08-24 | (table gap, D21-D52: Sprints 6-21 shipped via background agents, tracked in CHAT.md/ARCHITECTURE.md/USER_STORIES.md rather than backfilled here - see each persona's state.md "Shutdown prep catch-up" note) | | |
| 2026-08-24 | Sprint 22: `dropRule` enum retired for real polymorphism (`canAccept`/`resolveDropTarget` owned per pile module); 3 new Pile kinds (`foundation`/`cascade`/`rankAdjacent`) proven against Solitaire + Spit specifically; `GameConfig.zones` lets a preset auto-build its table (D53) | User asked to "complete the refactor to Zone/Pile APIs" - checked for a concrete driver first (none existed for D38's original separate Zone-type catalog), user's follow-up reframed the real ask as polymorphism + two named games | 6-phase sprint (62-67), zero regressions on any existing kind, 288/288 unit + 2 clean e2e runs; one pre-existing e2e flake found+disclosed (not caused by this sprint), see `docs/USER_STORIES.md` backlog |

## Repository Structure Memory
- `agents/`: Contains persona-specific documentation and state.
  `agents/chat_archive/`: archived CHAT.md snapshots by sprint moniker
  (current: `CHAT_SPRINT_1_2.md`; Sprint 3 archived this groom too, see
  below).
- `docs/`: Global documentation (PRD.md, ARCHITECTURE.md, DECISIONS.md, USER_STORIES.md).
- `task.md`: Single source of truth for the current sprint (maintained by Mouse). Sprints 1-3 DONE; Sprint 4 implementation (Phases 21-26) DONE as of 2026-08-15, Stage 3 close-out in progress.
- `src/`: app source — deck.js, state.js (reducer + viewFor redaction),
  protocol.js (incl. v1.3's `cardDragPayload`, D19), session.js, ui.js,
  qrcode.js, presets.js, rulesReference.js, handOrder.js (v1.2, D14),
  seating.js (v1.3, D18), main.js.
- `tests/`: unit tests (`*.test.js`, run via `npm test`, 86 passing) +
  `e2e.smoke.mjs` (`npm run test:e2e`, real 2-browser Playwright/WebRTC;
  now also covers personal zones, drag-and-drop play/move, and live
  card-drag broadcast privacy).
- `index.html`/`style.css`: the static site itself.
