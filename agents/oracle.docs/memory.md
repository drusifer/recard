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
| 2026-08-25 | Zone and Pile split into genuinely separate Web Components (`renderPileShell`/`renderZonePanel`); Deck becomes a real Pile routed through `view.zones` instead of a bespoke `<deck-zone>` (D54) | Prior renderer conflated box-drawing, move/resize wiring, and pile-card rendering in one function - user drove the split incrementally across several corrections until Zone/Pile were separate in code, matching what D53 had already made separate in data | 303->308 unit green, stylelint clean, `lint:design` tracked 33->12->10->7->6 (back to pre-session baseline); found+fixed 2 real pre-existing bugs (table-zone's own wirePanelLayout id, seat-zone className wipe); `tests/e2e.smoke.mjs` NOT updated (flagged, deferred), `handPile.redactCard` privacy gap still open, see `docs/ARCHITECTURE.md` D54 |
| 2026-08-25 | Sprint 23: `SPLIT_PILE`/`TAKE_PILE`/`SET_PILE_ORIENTATION` generalized onto `zone`/`discard` piles; Zone becomes a real, declaratively-configured `state.zones` entity with its own `type` (D55) | User's 4th direct correction mid-design: Zone needed real named/typed entities in `GameConfig`, not a pile-level `groupId` field - Morpheus caught+fixed its own earlier "Zone IS Pile" premise error against D54's own prior work before shipping | 322/322 unit green, `lint:design` 14/14 identical, live-verified Solitaire+Gin Rummy; Phases 68-71 landed, Phase 72 (pile-title drag-drop between zones) still open in `task.md` |
| 2026-08-26 | D56: `Pile`/`Zone` flat per-kind modules rewritten as real `extends Pile`/`extends Zone` class hierarchies (`FoundationPile extends RunPile extends MeldPile`) | User: "the code is a mess... lay down the path to only using derived types" - confirmed real duplication first (`redactCard`/`cardActions` copy-pasted across 4+ files) before designing; user then rejected the drafted 5-phase migration outright ("okay to break things, no backward compat, delete stale tests") - landed as one direct pass instead | 341/341 unit green, `lint:design` unchanged at its pre-existing 5-violation baseline (isolated via a correctly-SCOPED `git stash`, see lessons.md); `Actionable`/`Movable`/`Resizable` mixins REJECTED after checking the components already share `renderPileShell`/`wirePanelLayout` - no real duplication there to remove; `ScoreZone`/`SetPile` are documented, unwired placeholders - folding score into replicated state is a separate future feature request, not part of this cleanup; Trin UAT + Morpheus review both passed with independent verification (mutation tests, LOC count), see `docs/ARCHITECTURE.md` D56 |
| 2026-08-26 | D57: piles/zones/cards all genuinely Movable (drag-and-drop) - delivers `task.md` Phase 72 (pile-title drag between zones, plus "drop here to ungroup") and a new `CREATE_PILE` action (a card dropped on a zone's own empty space atomically spawns a new pile there) | Direct user bloop request; found and resolved a real mechanical conflict along the way (native HTML5 drag vs. `attachPanelDrag`'s pointer-tracking can't share one element - `preventDefault()` on pointerdown suppresses native `dragstart`) | 354/354 unit green (Trin's own mutation pass caught a pre-existing test whose name overclaimed foundation/cascade/rankAdjacent coverage - fixed for real, not just noted); also fixed a real D56-era gap in the same pass (`MOVE_PILE` never actually read the `reparentable` flag, which was itself wrong on 3 classes); Smith fixed a missing cursor affordance live and filed one real, not-blind-fixable UX gap (the ungroup target's own visibility), see `docs/ARCHITECTURE.md` D57 |

## Repository Structure Memory
- `agents/`: Contains persona-specific documentation and state.
  `agents/chat_archive/`: archived CHAT.md snapshots by sprint moniker
  (current, newest last: `CHAT_SPRINT_1_2.md`, `CHAT_SPRINT_3_4.md`,
  `CHAT_recard-sprint-9.md`, `CHAT_recard-sprint-10.md`,
  `CHAT_recard-sprint-11.md`, `CHAT_SPRINT_12_22.md`).
- `docs/`: Global documentation (PRD.md, ARCHITECTURE.md, DECISIONS.md, USER_STORIES.md).
- `task.md`: Sprint history log (maintained by Mouse), current through Sprint 22 (Phases 62-67).
- `src/`: app source — deck.js, state.js (reducer + viewFor redaction),
  protocol.js (incl. v1.3's `cardDragPayload`, D19), session.js, ui.js,
  qrcode.js, presets.js, rulesReference.js, handOrder.js (v1.2, D14),
  seating.js (v1.3, D18), panelLayout.js (local per-viewer panel
  move/resize + preset layout seeding), touchDrag.js, pileActions.js,
  main.js; `src/piles/{Pile,DeckPile,HandPile,DiscardPile,CascadePile,
  RankAdjacentPile,MeldPile,RunPile,FoundationPile,SetPile,pileTypes}.js`
  (D42/D53/**D56**) - real `extends Pile` class hierarchy as of D56,
  replacing the earlier flat-module-per-kind shape;
  `src/zones/{Zone,SharedZone,PerPlayerZone,ScoreZone,zoneTypes}.js`
  (D55/**D56**) - same treatment; `SetPile`/`ScoreZone` are documented,
  unwired placeholders, not live features.
  `src/components/` (D54) - `<zone-panel>`, `<pile-panel>`, `<fan-pile>`,
  `<deck-stack>`, `<score-zone>`, `<header-actions>` as native Web
  Components.
- `tests/`: unit tests (`*.test.js`, run via `npm test`, 308 passing as
  of D54) + `e2e.smoke.mjs` (`npm run test:e2e`, real 2-browser
  Playwright/WebRTC) - **stale as of D54**, predates the Zone/Pile
  component split, dedicated update pass still open.
- `index.html`/`style.css`: the static site itself.
