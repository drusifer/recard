# Architecture — Recard

**Owner:** Morpheus (Tech Lead)
**Status:** v1 — binding for this sprint
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
src/main.js                    wires session + state + ui together
tests/deck.test.js              node:test unit tests for deck.js
tests/state.test.js              node:test unit tests for state.js reducer
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

## Open Items Carried Forward (not blocking v1)
- Reconnect-after-refresh (PRD Open Question 4) — deferred.
- Max players — soft cap at 8, enforced in UI copy only, not hard-blocked.
- Custom card backs/themes — deferred.
