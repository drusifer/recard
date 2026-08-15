# PRD — Recard (working title)

**Owner:** Cypher (PM)
**Status:** Draft v0.1
**Last updated:** 2026-08-15

## Vision
A web app that replaces a physical deck of cards. People sitting in the same
room, each on their own device, connect peer-to-peer and get a shared virtual
deck they can shuffle, deal, draw from, and play to a table — for whatever
card game they already know the rules to. The app does not referee any
specific game; it is a deck-and-table simulator, not a rules engine.

## Problem
Groups of people together in person often want to play a card game but don't
have a physical deck on hand. Existing "play cards online" apps assume remote
play and require a backend server/account. This product targets the
same-room case with no server infrastructure to run or pay for.

## Target User
Friends/family/coworkers physically co-located, each with a phone or laptop
and a browser, who want a deck of cards without installing an app or
standing up any infrastructure.

## Core Product Principles
1. **Game-agnostic** — simulates a deck (or several), not any one game's rules.
2. **No server infrastructure** — no backend to deploy, host, or pay for.
   (Note: establishing a peer-to-peer connection typically still requires a
   small signaling step to exchange connection info — see Feasibility Flag
   below. "No server infra" means no app server/database to operate, not a
   guarantee of zero signaling.)
3. **Zero install** — open a browser tab and play.
4. **Same-room** — optimized for players who can see each other and talk;
   not building remote/matchmaking play in v1.
5. **Ephemeral** — no accounts, no persistence beyond the session.
6. **Live, best-effort motion** — card movement (hand organizing, playing a
   card, drawing) should animate on other players' screens as it happens,
   not just snap to a final state. "Best-effort" means it's fine to drop or
   coalesce intermediate frames under load/packet loss — the end state must
   stay correct, but every micro-movement doesn't need a delivery guarantee.

## In Scope (v1)
- Create a session/table as host; get a shareable code or QR for others in
  the room to join.
- Join a session via code/QR, no install, no account.
- Choose deck configuration (standard 52, +/- jokers, multiple decks combined).
- Shuffle and deal cards privately to each player's hand.
- Play a card from hand to a shared table/discard area visible to everyone.
- Draw from the deck or pick up from a shared pile.
- See public info for other players (card counts, table state) without
  seeing their hand contents.
- Host can reset/reshuffle for a new round without restarting the session.
- Live-replicate card movement to other clients on a best-effort basis: hand
  reorganization shows as motion (not card identity) per the privacy
  principle; playing/drawing a card shows both motion and the now-public
  result.

## Out of Scope (v1)
- Enforcing rules for any specific game (no turn logic, no scoring, no win
  detection).
- Remote / cross-room play, matchmaking, or spectating.
- Accounts, persistent stats, leaderboards.
- Voice/video chat (basic reactions/text chat may be a stretch goal).

## Key User Stories
See `docs/USER_STORIES.md`.

## Feasibility Flag → Morpheus
"No server infra" plus "peer-to-peer" is a technical constraint, not just a
product one. WebRTC (the likely mechanism) still needs *some* out-of-band
signaling to exchange session descriptions before a direct P2P channel opens
— even for two devices on the same table. Need Morpheus to assess and
propose a signaling approach that stays consistent with "nothing for the
product owner to host/operate," e.g.:
- Manual copy/paste or QR-code exchange of connection offers (no network
  service at all), vs.
- A free/public signaling broker or STUN/TURN service (small external
  dependency, still "no infra we run").
Flagging rather than deciding — this determines join UX (Story 2) and is
core architecture.

## Feasibility Flag → Morpheus (2): Live Movement Sync
New requirement (2026-08-15): hand-organizing and card-play movements should
replicate to all clients live, best-effort (see Principle 6, US-11). Over a
P2P mesh this implies a continuous small-message broadcast (e.g. drag
position deltas) separate from the authoritative game-state messages (deal,
play, draw). Need Morpheus to confirm this is workable on the same P2P
channel(s) chosen for signaling/state sync, and whether "best-effort" should
be implemented as unordered/unreliable delivery (e.g. WebRTC data channel in
unreliable mode) vs. reliable delivery that the UI simply throttles.

## Open Questions
1. Max players per table? (assume 2–8 until told otherwise)
2. Is game state fully freeform (players just drag/tap cards like a real
   table) or do we model structured zones (hand / discard / draw pile /
   table) that a host can configure per game? (assumed: structured zones,
   generic enough to fit most trick-taking/shedding/rummy-style games)
3. Custom card backs/themes — v1 or later?
4. Reconnect behavior if a player's browser refreshes or drops mid-session?

## Success Criteria (v1)
- A host can start a session and 3+ other players can join from their own
  devices in under a minute, with no install and no account.
- Players can complete a full round of a simple game (e.g. War or a basic
  shedding game) using only the app as the deck.
