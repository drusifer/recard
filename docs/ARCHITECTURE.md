# Architecture — Recard

**Owner:** Morpheus (Tech Lead)
**Status:** v1 shipped; v1.1 decisions below (D7-D11) are binding for the
current sprint (US-12..18, "clear backlog").
**Last updated:** 2026-08-15

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

## Module Layout
```
index.html              entry page, host/join screens, game screen
style.css                styling
src/deck.js               Card + Deck: build/shuffle/deal (pure logic)
src/state.js               host-side authoritative state + reducer(action) -> state
src/session.js              PeerJS wiring: create/join, connection roster, send/recv envelope
src/protocol.js              message envelope helpers: state vs. motion, throttling/coalescing
src/ui.js                     DOM rendering: hand, table, roster, connection status
src/qrcode.js                  small vendored QR renderer (no external network call at runtime)
src/presets.js                  v1.1: static game-preset lookup (US-15)
src/rulesReference.js            v1.1: static rules-reference content (US-18)
src/main.js                       wires session + state + ui together
tests/deck.test.js                 node:test unit tests for deck.js
tests/state.test.js                 node:test unit tests for state.js reducer (incl. D7-D9: middle
                                     redaction, REVEAL authorization, PICKUP, scores, solo/1-player)
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
- Reconnect-after-refresh (PRD Open Question 4) — deferred.
- Max players — soft cap at 8, enforced in UI copy only, not hard-blocked.
- Custom card backs/themes — deferred.
