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

## v1.1 backlog: card orientation + shared "middle" interaction (2026-08-15)

New requirement, added after v1 launch: support face-up/face-down play,
turning a card over, and a shared "middle" area that any player can
interact with — enough to support games like poker (community cards) and
gin rummy (shared discard pile), not just deal/play/draw to a fixed public
table. This generalizes the existing "table" (US-6/US-7/US-8) rather than
replacing it — "the middle" and "the table" are the same zone.

**Resolved 2026-08-15:** the user confirmed both face-down forms are
wanted — some games have cards hidden from *everyone* until revealed
(community cards), others have cards hidden from *other players but
visible to whoever placed them* (hole cards). Stories below cover both
via a single `owner` concept, per PRD Feasibility Flag 3's proposed
`owner`/`faceUp` model. This is the general-primitive framing the user
asked for: one mechanic ("a card in the middle can be public, privately
owned, and/or face-down") that covers both games, not two special cases.

**Smith UX requirements (Gate 1, cross-cutting across US-12/13/14):**
these apply across the whole middle-zone feature, not just one story —
recording them once here instead of duplicating into each AC block.
1. **Ownership must stay visible on public cards, not just private ones.**
   A public middle card played by a specific player (e.g. an exposed meld
   in front of them) needs a visible owner marker — otherwise players
   can't tell whose card is whose once several are on the table
   (Nielsen #6 Recognition, not recall).
2. **Revealing a *private* card needs a confirm step; revealing a *shared*
   card does not.** Turning over a shared/community card is normal game
   flow (US-13) and should stay one tap. Revealing your own private card
   is different in kind — it's irreversible and gives away information
   that was yours to keep, so it needs one extra confirming tap
   ("Reveal this to everyone?") before it happens (Nielsen #3 User
   Control and Freedom — don't let a stray tap give away a hole card).
3. **Reuse existing interaction patterns, don't invent new ones.** The
   visibility choice in US-12 and the reveal action in US-13 should build
   on the tap-to-play / tap-to-draw patterns already shipped in v1, not
   introduce a different gesture vocabulary (e.g. long-press vs. tap vs.
   drag all meaning different things depending on the card) (Nielsen #4
   Consistency and Standards).
4. **Face-down cards must look identically anonymous to non-owners.**
   Already an AC on US-12, restating as a hard UX requirement: there must
   be zero visual signal (size, border, position jitter, load order) that
   would let an observant player distinguish one face-down card's
   identity from another's before it's revealed. A privacy bug that
   leaks through animation timing is still a privacy bug.

### US-12: Play a card to the middle with a chosen visibility
**As** a player, **I want** to choose how a card I play to the middle is
visible, **so that** I can play hidden-information games (community
cards, hole cards, a face-down pile) as well as fully-open ones.
**AC:**
- Three visibility choices when playing to the middle: **public**
  (today's US-6 — face-up, visible to all), **shared face-down** (no
  owner — hidden from *every* client, community-card style), and
  **private face-down** (owned by the playing player — hidden from
  everyone else, but the owner can still see it, hole-card style).
- Privacy holds at the data layer for both face-down variants: a client
  never receives rank/suit for a card it's not allowed to see (same
  precedent as US-5/US-8), not just hidden in the UI.
- All middle cards (any visibility) count toward public info (e.g., "3
  cards in the middle") even when identity is hidden.
- A privately-owned face-down card is visually distinguishable to its
  owner (they can see it) but looks identical to any other face-down
  card to everyone else — no "this looks slightly different" leak.
- The three-way choice (public / shared-face-down / private-face-down)
  must not turn every play into an extra confirmation step — public is
  the common case (today's one-tap play) and should stay one tap; the
  other two are the exception and can cost one extra tap/gesture (Smith,
  Gate 1: Nielsen #7 Flexibility and Efficiency of Use — don't punish the
  common path for the sake of the rare one).

### US-13: Reveal a card in the middle
**As** a player, **I want** to reveal a face-down middle card, **so that**
hidden-information games can progress (flipping the flop, a showdown
reveal of a hole card).
**AC:**
- A **shared** face-down card (no owner) can be turned over by *any*
  connected player — matches the app's existing no-turn-enforcement
  design (PRD: "does not referee any specific game").
- A **privately-owned** face-down card can only be revealed by its owner
  — this is a permission boundary, not a free-for-all, since it's the
  one case where someone other than the actor could otherwise force
  another player's private information public.
- Revealing broadcasts the real card identity to all clients from that
  point on; it cannot be undone (no "turn back face-down").
- Revealing an already-face-up card is a no-op, not an error.
- A face-down card you're *not* allowed to reveal (someone else's private
  card) must look/behave differently enough from one you can — e.g. no
  "reveal" affordance appears on tap/hover for cards you can't reveal —
  so players don't attempt an action that silently fails or produces a
  confusing error (Smith, Gate 1: Nielsen #5 Error Prevention).

### US-14: Pick up a specific card from the middle
**As** a player, **I want** to pick up a chosen card from the middle into
my hand, **so that** I can draw from a shared discard-style pile (gin
rummy) rather than only the sealed deck.
**AC:**
- Any face-up middle card can be picked up by any player into their hand.
- Face-down middle cards cannot be picked up (picking up a card you can't
  identify would leak or corrupt hidden information) — turn it over first.
- Picking up removes the card from the middle for everyone and adds it to
  the picking player's hand only, same privacy handling as a normal draw.

---

## v1.1 backlog: quick-start game presets + score keeping (2026-08-15)

New requirement, added after v1 launch: reduce setup friction with named
presets for common games, and let players track a running score.

**Scope note — score keeping vs. the "no rules engine" principle:** PRD
Principle 1 and "Out of Scope (v1)" both say the app doesn't enforce game
rules or scoring. Read literally, "score keeping" collides with that. The
existing principle exists to stop the app from turning into a rules
engine (interpreting hands, computing win conditions, enforcing turns) —
not to ban a shared running tally players update themselves. Resolving as:
**score keeping = a dumb per-player number the app stores and displays,
never computes or interprets.** No card-value math, no win detection, no
per-game scoring formulas. If that's not what was meant, flag it back —
"the app calculates poker/gin rummy scores for you" is a fundamentally
different (and much bigger) feature than this story describes.

### US-15: Quick-start game presets
**As** a host, **I want** to pick a named preset (e.g. "Gin Rummy," "War,"
"Hearts," "Poker — 5 card draw," "Texas Hold'em," "Custom") instead of
manually setting deck/joker/cards-per-player options, **so that** getting
a specific game started takes one tap instead of guessing configuration.
**AC:**
- Selecting a preset fills deck config (US-3) and cards-per-player (US-4)
  with sensible defaults for that game; host can still adjust before
  dealing (presets are a starting point, not a lock).
- "Custom" (today's manual-entry flow) always remains available — presets
  are additive, not a replacement for freeform setup.
- Preset list is a static, client-side lookup — no new server-side
  concept, no feasibility flag needed; this sits entirely on top of
  existing US-3/US-4.
- Presets that use the shared middle (e.g. Texas Hold'em community cards)
  depend on US-12/13/14 landing first; presets that don't (Gin Rummy, War,
  Hearts) can ship independently.
- **Smith UX requirement (Gate 1):** selecting a preset must show what it
  actually sets (decks, jokers, cards-per-player) before the host commits
  — a bare game name isn't enough for someone unfamiliar with a preset's
  specifics to trust it (Nielsen #6 Recognition, not recall — don't make
  the host guess or go verify elsewhere).

### US-16: Simple score tracking
**As** a player, **I want** a running score number next to each player's
name with simple +/- buttons, **so that** we can keep score across rounds
without a separate pad of paper.
**AC:**
- Each player has a visible score value, starting at 0, shown to everyone
  (public, like card counts — not private).
- Updating a score is just two buttons (+1 / -1) next to that player's
  name — no numeric keypad/typing required (user: "just a simple set of
  buttons for updating the score").
- **Resolved (Smith, Gate 1):** everyone can adjust everyone's score.
  Matches the physical mental model this app is standing in for (anyone
  at the table can usually write on a shared scoresheet), and keeps the
  UI simple (no per-player permission state to track or explain).
- Score persists across a Reset/reshuffle (US-9) — resetting the deck for
  a new round should NOT zero the scoreboard, since score tracking spans
  rounds by definition. A separate explicit "reset scores" action zeros it.
- The app never computes a score value itself — no card-value math, no
  automatic scoring on play/win. Purely a shared counter moved by buttons.

---

## v1.1 backlog: solo play + rules reference (2026-08-15)

### US-17: Play solo (solitaire)
**As** a single player, **I want** to host a table and play by myself,
**so that** I can play solitaire-type games without needing anyone else
to join.
**AC:**
- A host can deal and play a full round with zero other players joined —
  not a degenerate/unsupported edge case of the group flow.
- Confirmed 2026-08-15: the existing v1 architecture already supports
  this with no code changes (host is added as a player via `JOIN` on
  table creation; `DEAL`/`state.players.length` never assumed more than
  one). This story exists to make it an explicit, tested guarantee — add
  regression coverage so a future change doesn't accidentally introduce a
  ">1 player" gate — not because new engineering is expected.
- Solo play still gets the full primitive set: hand, middle (public/
  shared-face-down/private-face-down per US-12/13), draw, score (US-16).

### US-18: In-app rules reference
**As** a player, **I want** to look up how to play a common card game from
within the app, **so that** I don't need to leave and search the web
mid-session.
**AC:**
- A reference/help view lists common games (starting with whatever US-15
  presets exist: Gin Rummy, War, Hearts, 5-Card Draw, Texas Hold'em, ...)
  with a short, plain-language rules summary for each.
- Content is static and bundled with the app (consistent with "no server
  infra," ARCHITECTURE.md D1) — no live lookup/network dependency to view
  it.
- Reachable without leaving/losing the current table session (a panel or
  separate screen, not a navigation away from the game).
- Out of scope for this story: the app enforcing any of these rules — the
  reference is purely informational, matching the sharpened Vision
  (primitives, not rule enforcement). If a preset (US-15) exists for a
  game, its rules-reference entry should be reachable from that preset's
  selection UI, not just a separate disconnected list.
- **Smith UX requirements (Gate 1):**
  - Every game entry follows the same short format (goal, setup, basic
    turn structure) — Nielsen #4 Consistency; a reference that reads
    differently game to game is harder to scan under time pressure
    (people look this up *mid-setup*, not for leisure reading).
  - Opening the reference must not lose table state — if a game is
    mid-round, checking a rule and closing the reference returns to
    exactly where play was (Nielsen #1 Visibility of System Status /
    Nielsen #3 User Control — this is exactly the kind of "two screens
    fighting each other" bug class Gate-close testing already caught
    once this sprint; don't reintroduce it here).

---

## Deferred / Stretch
- Scannable QR code image for joining (v1 ships join-code + Copy Link
  instead; descoped 2026-08-15, see CHAT.md Neo→Cypher).
- In-app text chat or reactions.
- Custom card backs/themes.
- Reconnect-to-session after refresh/drop.
