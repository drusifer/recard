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

## Repository Structure Memory
- `agents/`: Contains persona-specific documentation and state.
  `agents/chat_archive/`: archived CHAT.md snapshots by sprint moniker
  (current: `CHAT_SPRINT_1_2.md`).
- `docs/`: Global documentation (PRD.md, ARCHITECTURE.md, DECISIONS.md, USER_STORIES.md).
- `task.md`: Single source of truth for the current sprint (maintained by Mouse). Sprint 1 + Sprint 2 both DONE as of 2026-08-15.
- `src/`: app source — deck.js, state.js (reducer + viewFor redaction),
  protocol.js, session.js, ui.js, qrcode.js, presets.js, rulesReference.js, main.js.
- `tests/`: unit tests (`*.test.js`, run via `npm test`, 41 passing) +
  `e2e.smoke.mjs` (`npm run test:e2e`, real 2-browser Playwright/WebRTC).
- `index.html`/`style.css`: the static site itself.
