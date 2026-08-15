# User Stories — Recard (v1 draft)

Owner: Cypher (PM). Status: Draft v0.1, pending Smith UX review (Gate 1).

---

### US-1: Create a table
**As** a host, **I want** to start a new session and get a shareable
code/QR, **so that** others in the room can join without an account.
**AC:**
- Creating a session requires no login/signup.
- A join code (short, human-readable) and a copyable join link are both
  shown. (Scanned QR image deferred to v1.1 — see Deferred/Stretch; a
  hand-rolled QR encoder couldn't be verified to actually scan in this
  dev environment, so v1 ships the safer zero-typing option: Copy Link.)
- Session is unique per table instance.
- Host sees a live roster of who's connected, and each entry's connection
  state (connected / connecting / disconnected) — no silent P2P failures
  (Smith, Gate 1: Nielsen #1 Visibility of System Status).

### US-2: Join a table
**As** a player, **I want** to join by entering a code or scanning a QR,
**so that** I can play from my own device with zero setup.
**AC:**
- Joining works from a fresh browser tab with no prior visit.
- Player picks a display name on join.
- Join fails gracefully with a clear message if the code is invalid/expired.
- While the P2P connection is being established, the player sees an
  explicit "connecting..." state, not a blank/frozen screen (Smith, Gate 1:
  Nielsen #1).

### US-3: Configure the deck
**As** a host, **I want** to choose deck composition (standard 52, +/-
jokers, multiple decks), **so that** the table matches the game we're
playing.
**AC:**
- Host can select deck options before dealing.
- Choice is visible to all joined players before play starts.

### US-4: Shuffle and deal
**As** a host, **I want** to shuffle and deal a chosen number of cards to
each player, **so that** we can start the game the way we would with a
physical deck.
**AC:**
- Shuffle uses a fair randomization (no visible bias, no host card-reveal
  during shuffle).
- Dealt cards appear only in the receiving player's own hand view.

### US-5: Private hand
**As** a player, **I want** my hand visible only to me, **so that** the
game stays fair like a physical hand of cards.
**AC:**
- Other players cannot see hand contents, only hand count.
- Rotating/reordering a device does not leak hand contents to onlookers
  more than a physical hand would (reasonable-effort, not a security
  guarantee).

### US-6: Play to the table
**As** a player, **I want** to play a card from my hand to a shared area,
**so that** everyone can see what's been played.
**AC:**
- Played cards appear in real time for all connected players.
- Table/discard area reflects order of play where the game needs it.

### US-7: Draw or pick up
**As** a player, **I want** to draw from the deck or pick up from a shared
pile, **so that** I can follow whatever game rules we're using.
**AC:**
- Draw removes a card from the deck and adds it to the drawing player's
  hand only.
- Remaining deck count updates for all players.

### US-8: See public table state
**As** a player, **I want** to see other players' card counts and the
shared table/discard area, **so that** I have the same public information
I'd have at a physical table.
**AC:**
- Card counts per player update live.
- No hand contents are ever sent to other players' clients (not just
  hidden in the UI).

### US-9: Reset for a new round
**As** a host, **I want** to reshuffle and redeal without ending the
session, **so that** we can play multiple rounds/games in one sitting.
**AC:**
- Reset returns all cards to the deck before reshuffling.
- Reset does not require players to rejoin.

### US-10: Zero install
**As** a player, **I want** everything to work in a normal mobile/desktop
browser, **so that** I don't need to install anything to play.
**AC:**
- No native app, browser extension, or plugin required.
- Works on at least one current mobile browser and one desktop browser.

### US-11: Live movement replication
**As** a player, **I want** to see other players' hand-organizing and
card-play movements happen live on my screen, **so that** the table feels
shared and responsive instead of static, like watching hands move at a
physical table.
**AC:**
- Reorganizing my own hand animates on other clients as motion only — card
  identity/rank/suit is never revealed by the animation (consistent with
  US-5 privacy).
- Playing a card from hand to the table animates the move and reveals the
  card as part of that action (it's public once played, per US-6).
- Drawing a card animates the move (deck → hand) without revealing the
  drawn card's identity to other players.
- Delivery is best-effort: under packet loss/high latency it is acceptable
  to drop or coalesce intermediate motion frames, as long as all clients
  converge on the correct final state (hand contents, table contents, deck
  count).
- No player action blocks or waits on another player's animation finishing.

---

## Deferred / Stretch
- Scannable QR code image for joining (v1 ships join-code + Copy Link
  instead; descoped 2026-08-15, see CHAT.md Neo→Cypher).
- In-app text chat or reactions.
- Custom card backs/themes.
- Reconnect-to-session after refresh/drop.
- Configurable game "zones" beyond hand/deck/discard/table.
