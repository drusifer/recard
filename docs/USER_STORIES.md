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

## v1.2 backlog: zones, live presence, hand tools, pass marker (2026-08-15)

New requirement, added after v1.1 launch. Generalizes "the middle" (a
single shared pile, US-12/13/14) into multiple named zones, adds visual
presence for the deck/other hands, live cursor/motion feedback, hand
sorting, incremental dealing, and a pass marker.

**Open questions (flagging, not assuming):**
1. "Incremental dealing" is genuinely ambiguous between two different
   features: (a) the deal *animates* card-by-card instead of appearing
   instantly (a visual-pacing nice-to-have), or (b) the host can deal
   *additional* cards to everyone later in the round without wiping
   existing hands (a new mechanic — today's `DEAL` action always resets
   every hand to empty first). **US-24 below assumes (b)** since it's the
   one that actually changes what's possible to play (some games deal in
   stages), and (a) is easy to layer on top later as pure animation
   polish. Flag back if (a) was the actual ask.
2. "See the motion, or at least see my cursor" for card drags — hand
   contents are private (US-5), so literally showing an opponent's hand
   card moving would leak its identity. **US-22 below scopes this as:
   live cursor/pointer position always (privacy-safe, works for any
   drag), plus real card-motion visualization specifically for cards
   already visible to the viewer** (zone-to-zone moves of face-up cards,
   or your own private zone cards). Not assuming players want to see
   *where in their hand* an opponent's cursor is hovering vs. just "they're
   near their hand" — scoped to zone-level position, not hand-slot-level,
   to avoid re-opening a privacy question by accident.

### US-19: Named zones for laying out cards
**As** a player, **I want** multiple named areas on the table (not just
one shared pile), **so that** games like Gin Rummy can have separate
melds, a discard pile, etc., all visible and usable by anyone.
**AC:**
- The middle generalizes to a list of zones, each with a name and its own
  cards (existing US-12/13/14 visibility rules — public / shared
  face-down / privately-owned face-down — apply per-card within any
  zone, unchanged).
- Any player can create a new zone (a name, nothing fancier) and move any
  card they're allowed to see between hand ↔ zone or zone ↔ zone — "put
  or take" access is open to all players, per the request, consistent
  with the app's no-turn-enforcement design.
- All zones are visible to all players (zone existence and card counts
  are always public, even if individual cards within a zone are hidden
  per their own visibility rule).
- A default zone always exists so existing single-pile play (War, poker
  community cards) keeps working without every game needing to create
  zones first.
- **Smith UX requirement (Gate 1):** zone names must always be visible as
  labels on the table, never just implied by position (Nielsen #6
  Recognition, not recall). Creating a zone requires typing a name (no
  silent "Zone 4" auto-numbering) so the table stays legible as more
  zones accumulate over a session.

### US-20: See the deck, not just a number
**As** a player, **I want** the draw deck rendered as a visible stack,
**so that** the table looks and feels like it has a real deck on it, not
just a text counter.
**AC:**
- The deck renders as a face-down card stack; the remaining count is
  still shown (as a label/badge), not replaced.
- Purely presentational — no change to draw mechanics (US-7).

### US-21: See other players' hands as closed cards
**As** a player, **I want** to see a row of face-down cards for each
other player representing their hand, **so that** the table reads as
"everyone has cards in hand," not just a name and a number.
**AC:**
- Renders one face-down card per card in that player's hand count —
  purely visual, no new data is sent (already-public hand *count* is all
  this needs, per US-8's existing privacy guarantee).
- Does not replace the existing text roster row, sits alongside it.
- **Smith UX requirement (Gate 1):** must stay compact as hand size and
  player count grow — a full-size card-back per card, per opponent, for
  3+ players with 10+ cards each would flood the screen (Nielsen #8
  Aesthetic and Minimalist Design). Use a condensed/overlapping
  representation, not one full card slot per card.

### US-22: Live drag motion and cursor visibility
**As** a player, **I want** other players to see me actively moving a
card (or at least see my cursor), **so that** the table feels live and
responsive, closer to sitting across from someone.
**AC:**
- Best-effort, cosmetic-only, per the existing motion model (Principle 6,
  US-11, ARCHITECTURE.md D4) — dropping frames under load only costs
  smoothness, never correctness.
- At minimum: while a player is dragging anything, other clients see a
  labeled cursor/pointer indicator tracking their live position.
- Where privacy allows (see Open Question 2 above): actual card motion is
  shown, not just a cursor, for drags of cards the viewer can already see
  the identity of.
- Never reveals a hand card's identity via motion alone (same invariant
  as today's US-11 AC) — motion data must not let a viewer infer rank/
  suit through position, timing, or any other side channel.
- **Smith UX requirement (Gate 1):** cursor indicators must be labeled
  (whose cursor) and visually light (small, not a full-opacity blocking
  element) — Nielsen #1 Visibility of System Status without turning into
  visual noise when 4+ players are all moving things at once.

### US-23: Sort my hand by suit or rank
**As** a player, **I want** one-tap buttons to sort my hand by suit or by
rank, **so that** I don't have to manually drag cards into order.
**AC:**
- Two buttons ("Sort by rank", "Sort by suit") reorder the local hand
  display.
- **Fixes existing tech debt** (Sprint 1 retro backlog item 2): today's
  manual drag-reorder is purely cosmetic and gets wiped by the next state
  broadcast — sorting would have the exact same bug if built on the same
  foundation. This story includes making hand order durable client-side
  (survives state updates: existing cards keep their position, newly
  drawn/dealt cards append, removed cards drop out) so both drag-reorder
  and the new sort buttons actually stick.
- Sorting is local-only — never broadcast, never affects other players'
  views (consistent with hand privacy, US-5).
- **Smith UX requirement (Gate 1):** sort buttons and manual drag-reorder
  must not fight each other — sorting sets an order, dragging afterward
  should still work from that new order rather than snapping back
  (Nielsen #3 User Control and Freedom — one action shouldn't silently
  undo another).

### US-24: Incremental dealing
**As** a host, **I want** to deal additional cards to everyone later in a
round without discarding hands already dealt, **so that** games that deal
in stages are possible.
**AC:** (see Open Question 1 — this story assumes interpretation (b))
- A "Deal More" action adds N cards to every player's existing hand
  without clearing it first (today's `DEAL` always resets hands to empty
  — this is a genuinely new action, not a change to existing `DEAL`,
  since some games really do want the reset-then-deal behavior too).
- Throws the same "not enough cards left" guard as today's deal.
- **Smith UX requirement (Gate 1):** "Deal More" must be visually and
  spatially distinct from "Deal & Start" so a host mid-game can't
  mis-tap and accidentally trigger the wrong one (Nielsen #5 Error
  Prevention) — different label, not adjacent buttons of the same style.

### US-25: Pass marker
**As** a player, **I want** to mark myself as having passed, **so that**
everyone can see who's passed without asking out loud.
**AC:**
- A per-player toggleable marker, visible to all (like a small "Passed"
  tag next to their roster row).
- Self-toggle only — unlike score (anyone can adjust anyone's), a pass
  marker represents *your own* declared state, so only you can set/clear
  yours (consistent with US-13's precedent: actions that represent a
  personal declaration get an authorization boundary, shared actions
  don't).
- Clears on `RESET` (new round) — unlike score, which intentionally spans
  rounds, a pass is round-scoped by definition.

### "More fun" (general)
Not a discrete deliverable — addressed by the above (a livelier, more
game-like table) plus the prior sprint's UX overhaul. Not tracking as a
separate story.

---

## v1.3 backlog: top-down table redesign (2026-08-15)

New requirement, added after v1.2 launch: redesign the game screen as a
top-down card table — players seated around it, each with a personal
zone in front of their seat, the viewer's own hand spread below, cards
played and moved by drag-and-drop, and other players' card movements
visible live as they happen. This is a visual/interaction overhaul of
the existing zone (US-19/D12) and motion (US-11/US-22/D13) systems, not
a new data model — see PRD Feasibility Flag 5 for the architecture
proposal.

**Forking questions confirmed with the user before drafting (not
assumed):**
1. Drag targets **snap to zones** (today's named-zone model, drag
   replaces/augments tap as the gesture), not freeform per-pixel
   placement. Freeform would need per-card x/y coordinates synced across
   clients with differently-sized/shaped screens — "the same spot"
   isn't well-defined between players, and it's not what the request
   needs (a real table still has clearly-implied zones — cards in front
   of you, a discard pile — even though nothing is drawn on the felt).
2. Every player **auto-gets one personal zone** at their seat, created
   on `JOIN`, always present (can't be deleted) — in addition to any
   shared zones (discard, community cards, etc.) created the existing
   way (US-19).
3. **Corrected mid-draft**: other players' card movement should be
   **true real-time position broadcast** (you see the card itself
   following their drag, live, the whole time they're moving it), not
   just an animated jump when they release it. Best-effort/approximate
   is explicitly fine — this is actually the PRD's original Principle 6
   ("live, best-effort motion... should animate on other players'
   screens as it happens"), which D13 had scoped down to a lighter lift
   cue for build-cost reasons; this sprint restores the fuller version
   the user actually wants, extending D13's existing throttled motion
   channel rather than replacing it.

**Assumptions stated inline (not fork-worthy, but worth being explicit
about):**
- Each viewer renders **themselves at the bottom of their own screen**,
  with other players distributed around the rest of the table relative
  to that — this is a *per-viewer* relative seating arrangement, not one
  shared absolute layout, since "top-down table" only reads correctly
  from your own point of view. Seat order otherwise follows join order.
- Drag is **additive, not a replacement** for the existing tap-to-play
  and "Move to…" dropdown — phones are the primary target device (PRD
  Target User) and drag gestures are harder to land precisely on a small
  touchscreen than a tap, so the existing lower-friction paths stay.
- Dragging a card out of your hand and dropping it on your own personal
  zone (or any shared zone) is a normal **public** play, matching
  today's "primary tap = public play" precedent (US-12). The existing
  small face-down buttons remain the way to play face-down — drag isn't
  overloaded with a mid-drag visibility choice.

**Smith Gate 1 amendments (2026-08-15, approved with additions):**
- US-26: the viewer's own seat must carry an explicit visual marker (not
  just "it's the one at the bottom") — a "You" label or equivalent —
  since position alone is ambiguous the first time someone opens the
  screen (Nielsen #6 Recognition, not recall). Density check required at
  this sprint's close-out test specifically at the soft-cap player count
  (~8, per `docs/ARCHITECTURE.md`), not just 2-3 players, given every
  seat now carries a name, personal zone, and mini-hand indicator all
  needing to fit around one table edge.
- US-28: a valid drop target must visually highlight while a dragged card
  is over it, and revert when it isn't (Nielsen #1 Visibility of System
  Status) — without this, drag-and-drop has no affordance for "this is
  droppable here" beyond guessing, which is worse UX than the tap model
  it's supplementing.
- US-29: the anonymized-card-back broadcast must follow the **exact same
  zone-level-not-hand-slot-level granularity boundary already adopted for
  cursor position** (US-22 Open Question 2) — the origin point rendered
  for other viewers must never be precise enough to imply *which slot* in
  the dragger's hand the card came from, only that it came from "near
  their seat." This is a new channel carrying an actual card silhouette
  (not just a dot), so it needs its own explicit restatement of that
  privacy boundary, not just inherited by association with US-22.
- US-30: overlapping/fanned cards must still show enough of each card
  (rank+suit corner index) to be individually identifiable without
  needing to tap/select it first — overlap is a layout choice, not
  permission to hide information a player already has (their own hand,
  US-5).

### US-26: Top-down table with seats around it
**As** a player, **I want** the game screen to look like a real card
table viewed from above, with every player seated around it, **so that**
the app feels like sitting at a table instead of a stacked list of
panels.
**AC:**
- The table is drawn as a single visual surface (not separate stacked
  "Table"/"Players" panels like today); seats are arranged around its
  edge, one per player, each labeled with that player's name and
  connection status.
- The viewer's own seat is always at the bottom of their screen; other
  players are distributed around the remaining edge, closest-to-furthest
  in join order either direction from the viewer (exact geometry is an
  implementation UI detail, not a product decision).
- Existing per-player info (connection state, score, pass marker, the
  compact closed-hand fan) still appears at or near that player's seat —
  this redesign changes *where* it's drawn, not what it shows.

### US-27: A personal zone in front of every seat
**As** a player, **I want** my own area on the table in front of my
seat, **so that** cards I've played land somewhere clearly "mine" instead
of one shared undifferentiated pile.
**AC:**
- Every player gets exactly one personal zone, auto-created on `JOIN`,
  positioned at their seat, always present (not user-deletable, unlike
  manually-created shared zones from US-19).
- Cards in a personal zone follow the exact same per-card visibility
  rules as any other zone (public / shared face-down / privately-owned
  face-down, US-12) — a personal zone is a *position* on the table, not
  a new privacy mechanism.
- Shared zones (the default table pile, any player-created zone from
  US-19) remain and are drawn in the table's open center area, distinct
  from any player's personal zone.

### US-28: Drag-and-drop to play and move cards
**As** a player, **I want** to drag a card from my hand or from a zone to
where I want it, **so that** playing feels like handling a physical card
instead of tapping buttons and menus.
**AC:**
- Dragging a card from your hand and dropping it on a zone (your own or
  a shared one) plays it there — same underlying action `PLAY` already
  performs today, just triggered by a drop instead of a tap.
- Dragging a card already on the table from one zone to another performs
  the existing `MOVE_CARD` action (US-19), same authorization rules
  (still-hidden private cards can only be moved by their owner).
- Existing tap-to-play and the "Move to…" dropdown **still work
  unchanged** — drag is an additional gesture, not a replacement (Smith
  Gate 1 precedent: don't cost the common/simple path anything extra,
  and phones make precise dragging harder than a tap for some players).
- Dropping outside any valid target is a no-op (card returns to where it
  was) — never a silent action on an unintended zone.

### US-29: See other players actually moving their cards, live
**As** a player, **I want** to see a card actually move across the table
in real time when another player drags it, **so that** the table feels
alive instead of state just snapping between frames.
**AC:**
- While another player is dragging a card, its live position broadcasts
  to everyone (best-effort, throttled/coalesced like today's cursor and
  hand-motion cues — dropped frames are fine, per PRD Principle 6; the
  final committed state via `PLAY`/`MOVE_CARD` is always the source of
  truth regardless of what any intermediate frame showed).
- **Privacy holds throughout the drag, not just at the end**: if the
  card isn't yet visible to a given viewer (still in the dragger's
  private hand, or a still-hidden face-down card only its owner may
  move), that viewer sees an anonymous card-back following the live
  position — never the rank/suit — exactly the same visibility rule
  already applied to committed state (US-12/D7), just applied
  continuously during the drag instead of only at rest.
- A card already visible to a viewer (face-up on the table, moving zone
  to zone) shows its real face while being dragged, live.
- If a drag never completes (e.g. connection drops mid-drag), the ghost
  card clears on the same TTL/timeout basis as today's cursor indicator
  — never left stuck on-screen indefinitely.

### US-30: Hand spread below the table
**As** a player, **I want** my own hand shown as a fanned spread below
the table instead of a plain row, **so that** it reads like cards held
in hand rather than a UI list.
**AC:**
- Purely visual — no change to what actions are available per card
  (tap-to-play, drag, the small face-down buttons, sort, all unchanged
  in *function*, only in layout/presentation).
- Must still be usable one-handed on a phone at a realistic hand size
  (this sprint's own density risk — see Smith Gate 1 requirement below).
- **Smith UX requirement (Gate 1):** a fanned/overlapping layout must not
  make any card's tap target smaller than the existing ≥44×44px floor
  (`docs/ARCHITECTURE.md` UI Conventions) — overlap is visual, not
  interactive; every card must stay individually, reliably tappable.

### US-31: The table uses the room it actually has on desktop
**As** a player on a laptop or desktop browser, **I want** the table to
use the available screen width instead of staying locked to a
phone-width layout, **so that** I'm not playing on a postage-stamp table
in the middle of an otherwise-empty browser window.
**AC:**
- Above a defined desktop breakpoint, `#screen-game`'s width grows well
  past today's flat 760px cap — bounded at a deliberately-chosen max
  (not unconstrained full-bleed on a 4K monitor, which would just stretch
  the same cramped layout thin) — exact breakpoint/cap is Morpheus's
  sizing call at Gate 2, not prescribed here.
- Below the breakpoint, today's mobile-optimized layout (480px/760px
  caps) is **unchanged** — this is additive room for wide viewports, not
  a rework of the mobile layout the team just spent Sprint 4 protecting.
- The extra width is actually used by the table content (seats, zones,
  hand spread get more breathing room/spacing) — not just wider empty
  padding around a still-narrow game area.
- The existing ≥44×44px interactive-element floor
  (`docs/ARCHITECTURE.md` UI Conventions) holds at every width tested —
  widening should only ever help this, but state it explicitly given
  Sprint 2's touch-target regression history.
- No horizontal scroll/overflow introduced at any width from ~320px
  through at least 1920px.

**Explicitly out of scope for this story:** the open 5+-player mobile
density backlog item (needs a real compact-seat redesign, tracked
separately in `agents/cypher.docs/state.md`) — this story is about
desktop under-use of space, not mobile crowding, and the two shouldn't
be conflated into one fix.

**Smith UX amendments (Gate 1, 2026-08-16):**
- Confirmed against the actual stylesheet: `.screen` (host/join forms)
  is already correctly narrow at 480px and **out of scope** — this story
  only concerns `#screen-game`. A form doesn't get more usable by
  getting wider; don't let implementation drift into widening the
  host/join screens too.
- `#screen-game`'s current 760px cap is itself the result of a prior
  Smith finding ("more room... on anything wider than a phone") — this
  story is a legitimate follow-on to that same finding, not a new
  complaint contradicting it: 760px was right relative to a 480px
  baseline, but was never re-evaluated against actual desktop/laptop
  widths (1024px+), which is exactly today's user report.
- For testability at Trin's UAT stage, AC's "at least 1920px" needs at
  least two concrete named checkpoints in between, not just the two
  ends — recommend explicitly testing 1024px (small laptop) and 1440px
  (common desktop) in addition to the phone and ultra-wide extremes, so
  a reflow bug in the middle of the range can't hide between two passing
  checks at the edges.

### US-32: Stack a card onto another to build a set
**As** a player, **I want** to drop a card directly onto another card in
a zone and have it pile tightly on top, **so that** I can group
same-rank cards (a "set") into one compact pile instead of a spread-out
row.
**AC:**
- Dropping a dragged card onto a specific region of a target card
  already in a zone (see US-33 for the other region/mode) stacks it
  tightly on that card: the new card renders directly on top, offset
  only enough to show a corner-index peek of the card(s) underneath (not
  fully hidden — a stacked pile must never make a lower card
  unidentifiable at a glance, still readable via the corner index like
  every other card in this app).
- The stacked card becomes adjacent to the target in the zone's
  underlying card order (existing `MOVE_CARD` semantics extended, not
  replaced) — this is real, shared, authoritative state, synced to
  every player identically (a table layout is shared game state, unlike
  hand order which is private per player).
- Existing behavior is fully preserved: dropping into empty zone space
  (not onto any card) still appends normally with today's flat spacing
  — stacking is an additional, deliberate gesture, not a change to the
  default drop behavior (Smith Gate 1 precedent, US-28: additive, never
  a replacement for the simple path).
- A stack can be added to repeatedly (stack a third, fourth card the
  same way) and can be un-stacked by dragging a card out to empty zone
  space, returning it to normal flat spacing.
- No mid-drag popup/prompt to choose the mode (Smith's own established
  precedent in `dropCardOnZone`: "don't overload drag with a mid-drag
  choice," originally applied to face-down play) — mode is determined
  by *where* on the target card you drop, a spatial affordance, not a
  dialog.
- Privacy/authorization is unchanged: stacking a card follows the exact
  same `MOVE_CARD` authorization rule already in place (a still-hidden
  card can only be moved/stacked by its owner; a shared face-down card
  by anyone).

### US-33: Overlap cards in sequence to build a run
**As** a player, **I want** to drop a card so it fans out next to
another card instead of piling on top, **so that** I can lay out
sequential cards (a "run") as a readable overlapping row instead of a
flat spread that takes up too much space.
**AC:**
- Dropping a dragged card onto the other region of a target card (the
  region US-32 doesn't use) inserts it adjacent to the target in the
  zone's card order, rendered with a partial overlap — enough that
  every card in the sequence stays individually identifiable (unlike
  US-32's tight stack, every card here shows enough of itself to read
  rank/suit without interaction), reading as one continuous fanned run
  rather than a disconnected row.
- Same shared/authoritative-state, same additive-not-replacement, same
  no-mid-drag-popup, and same unchanged-authorization requirements as
  US-32 — the two modes share one mechanism, differing only in the
  render offset and where on the target card you drop.
- Dropping before vs. after the target card (which side of it) puts the
  new card on the correct side of the sequence — a run needs to support
  building in either direction, not just appending at one end.

**Smith UX requirement (Gate 1, expected):** the exact drop-region split
on a target card (e.g. which half/edge means stack vs. overlap) and its
visual affordance (how a player discovers this without documentation)
need a concrete HCI proposal — flagged here for Smith to own at Gate 1,
not prescribed by Cypher.

**Explicitly out of scope:** validating that a stacked/overlapped group
is actually a legal set or run in any specific game's rules (matches the
PRD's standing "primitives, not per-game rules" yardstick — the app
offers the layout mechanism, the players decide what it means).

---

**Smith Gate 1 amendments (2026-08-16):**

1. **Concrete drop-region mechanism (both stories)**: dropping directly
   ON a target card's own body (its bounding box) = **stack**. Dropping
   in the space immediately beside a card — within roughly one card-
   width of it, closer to that card than to any other — = **overlap**,
   inserted before (dropped on the left/above side) or after (right/
   below side) per US-33's own AC. This maps directly to the user's own
   language ("stacking ON TOP of" a card vs. "overlapped ON" other
   cards) and reuses the app's existing drag-over highlight pattern
   (`.zone-drag-over`, Nielsen #1) rather than inventing a new visual
   language: extend that same live highlight to the individual
   card/gap under the pointer during drag-over — a glow directly on the
   card body signals "will stack here," a thin insertion-line beside it
   signals "will overlap here" — so the mode is discoverable by
   watching the drag itself, not by reading documentation (Nielsen #6).
   Chosen over bisecting the small ~50×69px card into two internal
   halves: the on-card/beside-card split gives each mode a more
   generous, more discoverable hit region than two cramped sub-areas of
   one small card would.
2. **Scope correction on touch/mobile**: checked `src/main.js`/`ui.js`
   directly — the existing drag-and-drop mechanism (US-28, and every
   story extending it, including this one) is built entirely on native
   HTML5 `draggable`/`dragstart`/`drop` events, which do not fire from
   touch gestures on a real mobile browser without a polyfill this
   project doesn't have. **This is a pre-existing limitation, not
   something US-32/US-33 introduces or regresses** — drag has always
   been a desktop/mouse-only *additive* gesture (US-28's own AC: tap-to-
   play and the "Move to…" dropdown are the accessible path, unchanged).
   AC for both stories is scoped to desktop/mouse accordingly. A tap-
   based way to choose stack/overlap (e.g. extending the "Move to…"
   dropdown) is a reasonable future idea, logged to Cypher's backlog —
   not required for this sprint, since mobile never had within-zone
   position control before either, so nothing regresses by not adding
   it now.

**Gate 1: Approved with the above 2 amendments.**

---

### US-34: Deck controls grouped where the deck actually is
**As** a player, **I want** Draw and the other deck operations shown
together near the deck itself, **so that** I don't have to hunt for
deck actions mixed into my hand's button row.
**AC:**
- No behavior change to `Draw` itself (existing `DRAW` action, unchanged
  authorization — any player) — this is a placement/grouping fix, not
  new logic. Moved out of the "Your hand" panel's button row into a new
  button row directly under the deck visual (`#game-deck-area`) in the
  table panel, alongside Split and Shuffle (US-35/US-36).
- `Add Zone`/`Deal More` (host-only) stay where they are — this story
  only regroups *deck*-acting controls, not zone-management controls;
  don't conflate the two into one bigger reshuffle of the whole panel.

### US-35: Shuffle the deck without resetting the round
**As** a host, **I want** to reshuffle just the remaining deck, **so
that** I can randomize draw order mid-round without wiping every
player's hand and the whole table (today's only reshuffle,
`Reshuffle & Reset`, does both at once).
**AC:**
- New `Shuffle` control, host-only (matches `Deal`/`Deal More`/`Reset`'s
  existing host-only pattern — no new authorization concept).
- Reshuffles `state.deck` in place. Hands, zone contents, scores, and
  passed markers are all **untouched** — this is the one thing today's
  `Reshuffle & Reset` does NOT offer (a non-destructive shuffle), not a
  duplicate of it.
- `deckCount` (the only deck info any viewer ever sees, per the existing
  privacy model) is unchanged by a shuffle — a shuffle only reorders,
  never changes how many cards remain.

### US-36: Split the deck into multiple draw piles
**As** a host, **I want** to split the remaining deck into several
separate piles, **so that** I can set up games needing more than one
draw pile — solitaire-style layouts especially, which often want many
piles, not just two.
**AC:**
- New `Split` control, host-only, prompts for a pile count (2 or more —
  explicitly not limited to exactly two, per the user's own correction:
  "I need a bunch of draw piles" for solitaire).
- Creates that many new face-down zones (auto-named "Pile 1".."Pile N")
  and deals the remaining deck across them round-robin — reuses the
  exact same distribution logic `DEAL`/`DEAL_MORE` already use, just
  targeting new zones instead of hands, per the standing "generalize an
  existing mechanism instead of inventing a new one" pattern the team
  has followed since D3.
- Each pile is a real zone like any other: any player can draw
  from/move cards into it afterward using existing zone mechanics
  (`MOVE_CARD`/`PICKUP`) — Split is a one-time setup action, not a new
  ongoing game concept.
- **Assumption, stated not silently decided** (user declined to answer
  the clarifying question directly and asked to proceed with
  assumptions flagged instead): even distribution via round-robin
  dealing, not a specific per-pile size (e.g. Klondike's asymmetric
  1,2,3,4,5,6,7 tableau). Manually trimming piles afterward via existing
  drag/move is the fallback for asymmetric layouts — matches the PRD's
  "primitives, not per-game rules" yardstick rather than hardcoding one
  game's specific setup. A future per-pile-size input is a reasonable
  enhancement if this MVP proves insufficient, not built now.
- Splitting an empty deck, or requesting more piles than remaining
  cards, must fail with a clear message (Nielsen #9) rather than
  silently creating empty piles or crashing — matches `DEAL_MORE`'s
  existing "not enough cards left" guard pattern.

---

**Smith Gate 1 amendments (2026-08-16), US-34/35/36:**

1. **US-34 reversed — don't move `Draw`.** Checked the actual layout
   before agreeing to relocate anything: `Draw` sits right next to
   `#hand-area`, the exact place its effect (a new card in your hand)
   lands — this is the single highest-frequency action non-host players
   take, and moving it away from its own effect trades a real,
   repeated-every-turn cost for a one-time discoverability nicety
   (Nielsen #7: place frequent actions where the expert/repeat user
   already looks, don't relocate them for a novice-discoverability gain
   that a label already solves). **Revised scope**: leave `Draw` exactly
   where it is; US-34 becomes "add a new `Deck` controls row under the
   deck visual for the two genuinely new one-time/setup actions, Split
   and Shuffle" — those aren't per-turn actions, so proximity to the
   deck visual (where their effect is obvious) matters more than
   proximity to the hand.
2. **US-35: no confirm dialog.** Checked `resetBtn`'s own handler — even
   `Reshuffle & Reset` (destructive: wipes hands/zones) has no
   `window.confirm` gate today. Shuffle is explicitly non-destructive
   per its own AC, so it should have strictly *less* friction than
   Reset already has, not more — no confirm needed, don't add one
   defensively.
3. **US-36: reuse the existing number-input pattern, not a JS prompt.**
   `Deal More` already solved "host enters a small number, host-only
   button" via a paired `<input type="number">` + button
   (`#deal-more-count`/`#deal-more-btn`) — Split's pile-count input
   should be the same pattern, not a blocking `window.prompt()`, for
   visual/interaction consistency (Nielsen #4) with the control right
   next to it.
4. **US-36: cap pile count, and require every pile gets ≥1 card.**
   Zones are never deletable once created (D17 - "no `DELETE_ZONE`
   action for any zone," an existing accepted limitation this story
   inherits, not introduces) — Split creating several zones at once
   raises the stakes of a fat-fingered large number more than the
   existing single-zone `Add Zone` does. Concrete guard: reuse
   `deal-more-count`'s own `min`/`max` convention (propose `min="2"
   max="20"` on the pile-count input) and require `pileCount <=
   deck.length` (every pile gets at least 1 card) as the single
   "not enough cards" guard condition — covers both an empty deck and
   a too-large pile count with one check, no separate zero-card-pile
   case to reason about.

**Gate 1: Approved with the above 4 amendments** (in addition to the 2
already approved for US-32/33 earlier this sprint). Full US-32..36 set
cleared for Morpheus architecture.

### US-37: A host refresh doesn't destroy the game
**As** a host, **I want** the table to survive my browser refreshing or
crashing, **so that** an accidental reload doesn't wipe a game in
progress and force everyone to start over.
**AC:**
- The host's authoritative state is saved to that browser's local
  storage as it changes, and offered back on next load.
- Restoring is **offered, never automatic** — the host is asked, and can
  decline and start fresh. Silently resurrecting a finished game would
  be worse than losing an unfinished one.
- Guests store nothing. Only the host persists (this is the host's
  authoritative state, per D3).
- Nothing about the save changes what any player can see: the saved blob
  is the host's own state, on the host's own machine, and is never
  transmitted. The existing per-viewer redaction (D7) is untouched.
- A stale or corrupt save must fail safe — start a clean table with a
  clear message, never crash on load or half-restore.

**THE CENTRAL PROBLEM, flagged not assumed — hands cannot be safely
restored to their owners.** Verified in the code, not guessed:
`session.js` gives the host a peer id it generates itself
(`generateShortCode()`), so a host *can* re-claim the same table code on
reload. But guests get `new Peer()` — **a fresh random id every time** —
and hands are keyed by exactly that id (`handPileId(playerId)`,
`ownerId`). So a restored game contains hands owned by ids that no
longer exist, and a rejoining player is, as far as state is concerned, a
stranger.

Three ways out, and the choice materially changes the story:
1. **Restore the table, not the hands** (proposed scope). Deck, zones,
   piles, scores and pass markers survive; hands are dropped and the
   host re-deals. Simple, safe, no identity guessing.
2. **Match rejoining players by name.** Rejected as unsafe: names are
   not unique and are not verified. This was not hypothetical — a live
   two-player table during Sprint 6 had *both* players named "Drew".
   Handing someone another player's hole cards because their display
   names collided is a privacy failure, not an edge case.
3. **Give each browser a stable identity token** so rejoins are
   reliable. This is the right long-term answer and is what makes hand
   restoration safe — but it requires *guest-side* storage, which this
   story's "host only" framing excludes. Noted as the follow-on.

**Proceeding on option 1** and saying so plainly, rather than shipping
option 2's silent mis-assignment.

**Explicitly out of scope:** reconnecting live guests (backlog item 1,
open 5 sprints), and restoring hands (needs option 3).

**Smith Gate 1 amendments (2026-08-20):**
1. **The prompt must state what restoring costs, not just offer it.**
   Option 1 drops every hand — so a host who accepts a bare "Restore
   previous game?" loses cards without being told. The prompt has to say
   so up front ("...players' hands can't be restored and will need
   re-dealing"). An unrecoverable consequence disclosed *after* the
   click is a Nielsen #3 failure, and this one is unrecoverable in the
   strong sense: the save is consumed.
2. **Show the save's age.** "Restore the game from 3 minutes ago" and
   "from 6 days ago" deserve very different answers, and only the host
   knows which is right. Show it rather than pick a silent expiry.
3. **Say that players must rejoin.** A restored table has zero connected
   players — the host will otherwise sit looking at a table wondering
   why the roster is empty (Nielsen #1). The restore path should land
   the host on the share-code screen, not a game screen with nobody in
   it.
4. **Declining must not silently discard the save**, at least not on the
   first decline — a mis-click on "no" would otherwise destroy the only
   copy. Clear it when a *new* table is actually created instead.

**Gate 1: Approved with the above 4 amendments.** Option 1 is the right
call and the name-collision reasoning is sound - offering to restore
hands by name-match would be the kind of privacy failure that's hard to
even notice happened.

---

## v1.5 backlog: stable identity + remembering the table (2026-08-20)

*Backfilled by Oracle at Sprint 9 close: US-38 and US-39 shipped in
Sprint 8 but were only ever written down in CHAT.md, `task.md` and D27.
A story that exists only in a handoff message is a story nobody can
review later.*

### US-38: My cards come back if my browser reloads
**As** a player, **I want** to refresh or recover my tab without losing
my seat and my hand, **so that** a stray reload doesn't cost me a game.
**AC:**
- On reconnecting, I get my *own* seat and my *own* cards back — the
  same card ids, not a fresh deal.
- The roster does not gain a phantom extra player.
- An unknown identity gets a fresh seat, and an identity that is
  *already live* also gets a fresh seat — presenting someone else's
  token must never hand over their hand.
- Design (the user's own): the host issues a UUID when a client
  connects, both ends store it, and the client presents it on reconnect.
  The peer id stays what it always was — an address, not an identity.
  See D27.

### US-39: Rejoining shouldn't make me type anything
**As** a player, **I want** a reload to put me straight back at the
table, **so that** recovery isn't a second round of setup.
**AC:**
- A client that was actually in a table remembers the code and name and
  rejoins on its own, with nothing typed.
- A bare shared `?join=` link still asks for a name — remembering
  applies to a table you were in, not to any link you happen to open.
- The host's own name is remembered too, so restoring a saved table
  needs no retyping.


---

## v1.4 backlog: touch parity (2026-08-20)

Context, checked in the code before writing the story rather than
assumed. `src/ui.js` moves cards with **native HTML5 drag-and-drop**
(`wrapper.draggable = true`, `dragstart`/`drag`/`dragover`/`drop`,
`e.dataTransfer`). Native DnD is a mouse-only API: on a touchscreen
those events never fire at all — there is no polyfill in this repo
(confirmed by grep; Smith recorded the same finding during Sprint 6).

So every drag-based interaction the last four sprints built —
drag-to-play (US-28), drag-to-reorder your hand (US-23), stack a card
onto another (US-32), overlap into a run (US-33), and the live drag
ghost other players see (US-29) — **is entirely unavailable on a
phone.** The PRD names phones as the primary device (people around a
real table). This is the largest gap between what the app claims and
what it does.

### US-40: Move cards with my finger
**As** a player on a phone or tablet, **I want** to drag cards with my
finger exactly the way a mouse user drags them, **so that** the app I
was told to bring to the table actually works on the device I brought.

**AC:**
- Dragging a card with a finger does everything a mouse drag does:
  - play a card from my hand onto a zone (US-28),
  - move a card already on the table from one zone to another (US-28),
  - reorder my own hand (US-23),
  - stack onto a card (US-32) or overlap beside one (US-33), using the
    same drop regions,
  - show the same live drag ghost to other players (US-29).
- The **same drop feedback** appears during a touch drag as during a
  mouse drag: the zone highlights, and the target card shows the
  `drop-onto` / `drop-before` / `drop-after` hint. Feedback that only
  exists on mouse means the touch user is dragging blind (Nielsen #1).
- **A tap is still a tap.** Every existing non-drag path stays: tap to
  play, the "Move to…" dropdown, the sort buttons. Drag is one more way
  in, never the only way (this was Smith's explicit Gate 1 condition on
  US-28 and it still holds — precise dragging is harder on a
  touchscreen, so the low-friction paths matter *more* here, not less).
- **The page must still scroll.** Starting a vertical scroll gesture on
  or near a card must scroll the page, not begin a drag. A UI that eats
  scroll is worse than one that can't drag.
- Mouse behaviour is unchanged. Nothing in this story is allowed to
  regress the desktop drag paths that Sprints 4–6 verified.
- Verified on a **real touch-input e2e run**, not by code inspection —
  the whole point of this story is that reading the code is what made
  the gap invisible for six sprints.

**Deliberately out of scope:** multi-touch gestures (pinch/rotate),
long-press context menus, and the still-open 5+-player mobile density
item (that needs a compact-seat redesign, tracked separately since
Sprint 4 — this story is about *input*, not layout).

**Open question for Smith (flagged, not assumed):** should a touch drag
start immediately on finger-down, or only after a short press-and-hold?
Immediate is more responsive and matches the mouse; press-and-hold is
the conventional mobile idiom and is the easy way to keep scrolling
working. There is a third option — start on finger-down but only commit
to a drag once the finger has moved further horizontally than
vertically — which preserves both without a delay. I have a preference
(the third) but this is a feel judgement on the primary device, so it
is Smith's call, not mine.

**Smith Gate 1 amendments (2026-08-20):**

1. **Cypher's preferred answer to the open question is wrong for this
   app's geometry, and I checked the CSS rather than reasoning from the
   general case.** "Start a drag once the finger moves further
   horizontally than vertically" fails here because *both* axes are
   already spoken for, in opposite directions in the two regions you
   drag in:
   - `#hand-area` is `overflow-x: auto` — the hand **scrolls
     horizontally** (deliberate, D-era fan layout: a big hand fans
     sideways rather than wrapping). And hand reorder (US-23) is *also*
     a horizontal drag. Two meanings, one axis.
   - Playing a card is a **vertical** gesture — the hand sits below the
     table (US-30) — while `#table-area` is `overflow-y: auto` and
     `.seat-zone .card-row` is `overflow-x: auto`.
   There is no free axis in either region, so direction-intent cannot
   disambiguate anything. Rejected.

2. **The answer is press-and-hold to lift — and the app already speaks
   this gesture.** `src/ui.js` already binds `pointerdown`/`pointerup`
   on table cards for the US-22/D13 card-lift cue, and its own comment
   calls it "press-and-hold". Pointer events therefore already reach
   cards on touch, and holding a card already means something to every
   other player at the table. Touch drag should *extend that existing
   vocabulary*, not invent a second, competing one. ~250ms.

3. **The lift must be visibly confirmed before the finger moves.**
   Otherwise the user cannot tell whether they have picked a card up or
   are about to scroll, and the only way to find out is to move — which
   commits them to whichever one it was. The card must visibly change
   (lift/scale/shadow) at the instant the hold registers, the same
   instant the existing cue goes out to everyone else. Nielsen #1.

4. **Do not ship a hidden gesture as the fix for "mobile doesn't
   work."** A gesture nobody is told about is not parity. The
   tap-to-play and "Move to…" paths stay (already in the AC), *and*
   the hold needs a visible one-line hint where a touch user will
   actually meet it.

5. **A lift that turns into nothing must clean up after itself.** If the
   hold registers and the finger then ends in dead space, the card
   returns home *and* the broadcast lift cue clears immediately. The
   existing 2s motion TTL is a backstop for dropped packets, not a
   substitute for ending a gesture properly.

6. **The e2e must use a real touch-input context** (`hasTouch`,
   `page.touchscreen`), not mouse-driven pointer events. A mouse
   emits pointer events too, so a mouse-driven test would pass on
   exactly the code path that fails on a finger — which is precisely
   the failure mode that hid this gap for six sprints.

**Gate 1: Approved with the above 6 amendments.** The story is the right
call and the priority argument is correct: this is the widest gap
between what the app claims and what it does.


---

## v1.7 backlog: dealing lives on the deck; tables start themselves (2026-08-20)

Both requested by the user immediately after asking *"how to re-deal?"* —
which is the finding. Checked the code before writing these, per the
Sprint 7 lesson:

- `Reshuffle & Reset` dispatches `RESET` **only**. It rebuilds and
  reshuffles the deck and clears every hand — and does not deal. So the
  button whose name most sounds like "re-deal" leaves everyone holding
  nothing, and the *only* way back to a dealt table is `Deal More (no
  reset)`, a button in a generic row at the bottom of the screen whose
  name says it is for something else.
- `DEAL` and `DEAL_MORE` are already **one reducer case** differing by a
  single `fresh` flag (D15/D23), so nothing below needs new state logic.
- `pileActions.js` (D25) already answers "what can this pile do" from one
  table: `actionsForPileKind('deck')` returns `['draw']`. Dealing is
  simply missing from a list that already exists.

### US-41: Deal from the deck, where the cards are
**As** the host, **I want** dealing to be an action on the deck itself,
**so that** I don't have to know that the button called "Deal More (no
reset)" in an unrelated row is the only way to put cards back in hands.
**AC:**
- The deck pile offers **Deal** (host-only), alongside the Draw it
  already offers, through the same D25 action mechanism every other pile
  uses — not a bespoke control.
- It offers **Reshuffle & deal**: gather everything back, reshuffle, deal
  N to each player. This is the "re-deal" that has no single control
  today, and the reason this story exists.
- The floating `Deal More (no reset)` button and its orphaned number
  input leave the generic button row.
- `Reshuffle & Reset` stays — it clears *zones* too, which is a table
  reset, not a deal.
- Guests see neither action; dealing is host-only exactly as it is now.
- Deal N when the deck holds fewer than N × players must fail the way it
  already does — a clear message, no partial deal.

### US-42: A full table starts itself
**As** the host, **I want** the game to begin on its own once everyone
I'm expecting has joined, **so that** I'm not watching a roster waiting
to click a button.
**AC:**
- At table creation the host sets **how many players to expect**.
- When that many have joined, the table deals and everyone lands on the
  game screen, with no host click.
- **Manual start stays.** Someone always drops out, and a host who wants
  to start with 3 of an expected 4 must be able to. Auto-start is a
  convenience, never the only way in.
- Auto-start fires **once**. A player leaving and rejoining must not
  re-deal a game in progress — that would destroy the round.
- The host can see what the table is waiting for before it happens.

**Open questions for Smith (flagged, not assumed):**
1. US-41: the deal count needs to come from somewhere. Inline number
   input beside the deck, or a prompt on the action? Inline is fewer
   clicks; a prompt keeps the deck area uncluttered.
2. US-42: what happens if a *fourth* player joins a table expecting
   three — block the join, or let them in and simply not re-trigger?
3. US-42: does the expected count default to something, or must the host
   choose? A required field adds friction to a screen that currently has
   none.

**Smith Gate 1 amendments (2026-08-20):**

**Answers to the three questions.** (1) **Inline**, and reuse the number
input that already exists rather than inventing a control — it is the same
value, just finally next to the thing it acts on. (2) **Let them in and
don't re-trigger.** Blocking a join is hostile and, worse, wrong: a
reconnecting player can look like a new one. "Expected players" is a
*start trigger*, not a capacity limit, and it must be named so that a host
never reads it as "maximum". (3) **Optional, empty by default.** Empty
means no auto-start — today's behaviour exactly. A host who ignores the
field must see no change at all.

1. **BLOCKER — an empty deck currently hides the deck entirely.**
   `renderDeck` starts `if (count <= 0) { container.hidden = true; }`. Put
   dealing on the deck and the moment the deck runs out there is *no deal
   control anywhere on screen* — which is precisely the dead-end that
   prompted this sprint, reintroduced in a new place and harder to find.
   **Reshuffle & deal must stay reachable with an empty deck.** An empty
   deck is exactly when a host most needs it.
2. **Reshuffle & deal is destructive and belongs at a different weight
   than Draw.** It ends the current round irreversibly. The D25 action row
   is a *hover* row — actions there are reached by passing over a card,
   not by aiming at a button. An irreversible action offered on hover,
   one row away from the harmless Draw, is a mis-click that costs a game.
   It needs the same danger treatment `Reshuffle & Reset` already carries,
   and it must not sit immediately adjacent to Draw.
3. **Say what the table is waiting for, before it happens.** "Starting
   when 4 players have joined — 2 so far." Without it the screen changes
   under the host with no stated cause (Nielsen #1), and a host whose
   fourth player never arrives has no idea why nothing is happening.
4. **Auto-start deals the cards-per-player value showing at that moment.**
   Say so, because the host may still be adjusting it when the last
   player joins. This is a race the host cannot see, so the rule has to be
   stated rather than discovered.

**Gate 1: Approved with the above 4 amendments.** The framing is right —
this is a discoverability fix wearing a feature request, and putting deal
where the deck is fixes the actual defect.


---

## v1.8 backlog: restart waits for the table (2026-08-20)

Requested by the user: *"when restarting a game wait for all players to
reconnect; clients should auto-reconnect on a timer; during the restart
say which clients are still disconnected and automatically restore the
game once all the clients are back."*

Two things in the code decide the shape of this, both checked before
writing (Sprint 7 lesson):

1. **`persistence.js` strips hands at save time** — `piles.filter(p =>
   p.kind !== 'hand')`. So "restore the game once all the clients are
   back" currently restores a table with **no cards in anyone's hand**.
   The request is hollow without changing that.
   D26 stripped hands for a specific, then-correct reason: hands were
   keyed by a PeerJS id guests regenerated on every join, so a restored
   hand belonged to nobody. **Sprint 8's D27 removed that reason** — the
   identity is now a client-stored `playerKey` presented on reconnect.
   Sprint 8's own launch note called hand persistence the deliberate
   follow-on. This is it.
2. **The guest erases the very thing it would need to come back.** On
   `session-ended`, `main.js` calls `forgetSession(window.localStorage)`,
   dropping the remembered code and name. A guest therefore *cannot*
   auto-reconnect after a host restart: the memory is destroyed at
   exactly the moment it becomes useful.

### US-43: My cards survive the host restarting
**As** a player, **I want** my hand to still be mine after the host
reloads, **so that** a host's accidental refresh doesn't cost everyone
their cards.
**AC:**
- Hands are saved with the rest of the table and restored to their
  owners by `playerKey` (D27) — never by name.
- A hand is only ever returned to a client that presents the matching
  key. An unknown key still gets a fresh seat, exactly as today.
- **This changes a stated privacy property and must be stated, not
  slipped in.** The README currently says hands are never written to
  disk. After this they are — on the host's own machine, in the host's
  own browser profile. The marginal cost is small (the snapshot already
  stores the deck's full remaining order, which breaks a game just as
  thoroughly) but "small" is not "none", and the docs must change with
  the behaviour.

### US-44: Clients come back on their own
**As** a player, **I want** my client to keep trying to rejoin after the
host disappears, **so that** I'm not the one who has to notice, and
re-enter a code, before the game can continue.
**AC:**
- When the host connection drops, the client retries on a timer instead
  of dead-ending — and **stops erasing the remembered table**, which is
  what makes retrying possible at all.
- The client says what it is doing ("Reconnecting…", with attempt or
  next-retry visible). A silent retry loop is indistinguishable from a
  frozen app.
- Retrying is abandonable: a player who is done must be able to stop and
  leave rather than watch a spinner forever.
- Retries must back off, not hammer the broker every second.
- A genuinely ended session (host gone for good) must still reach a
  clear end state rather than retrying invisibly and forever.

### US-45: The host waits for the table, and says who's missing
**As** a host, **I want** the restored game to wait for everyone and
tell me who hasn't come back yet, **so that** I'm not guessing whether
to start over.
**AC:**
- Restoring lands on a **waiting** state that lists the players the
  saved game expects, marking each as back or still missing **by name**.
- When every expected player has reconnected, the game resumes
  automatically — no host click.
- The host can start anyway without waiting for a straggler. Someone
  always leaves for good, and a table that can only resume at full
  strength is a table that can be held hostage by one closed tab.

**Open questions for Smith:**
1. US-44: how long should a client retry before giving up — or should it
   retry indefinitely until the player cancels?
2. US-45: if a player who was in the saved game never returns, should
   the host be able to drop them from the table (freeing their cards)?
3. US-43: is persisting hands acceptable at all, given it reverses a
   privacy property this project stated publicly in its README?

**Smith Gate 1 amendments (2026-08-20):**

**Answers.** (1) **Retry with backoff, to a cap, then stop and offer a
manual retry.** Never indefinitely and never silently: a loop with no end
is a battery drain the player never agreed to, and an app that looks busy
forever is worse than one that admits it failed. (2) **Not this sprint.**
"Start anyway" already removes the hostage problem, and dropping a player
raises a question nobody has answered — where do an absent player's cards
go? Deferring is a real answer; inventing a discard rule inside this
sprint is not. (3) **Yes, conditionally.** The host's own machine already
holds the deck's full remaining order, which breaks a game exactly as
badly as a hand does, so this is a change of degree. But the README says
otherwise *today*, so the doc changes in this sprint or the feature does
not ship. That is the Sprint 7 lesson applied to ourselves.

1. **BLOCKER — do not wait for players who had already left.** The
   snapshot stores `state.players` verbatim, including each player's
   `connection` at the moment it was written. Someone who quit an hour
   before the host reloaded is still in that list. Waiting for "all
   players in the saved game" therefore waits forever for people who are
   never coming, and the auto-resume never fires — turning the feature
   into a worse dead-end than the one it replaces. **Wait only for
   players who were connected when the game was saved.**
2. **"Host disconnected — session ended." becomes a lie.** If the client
   is about to start retrying, it must not first announce that the
   session is over. And it must not flash the ending message and then
   correct itself — a scare followed by a retraction costs more trust
   than the delay it was trying to explain. One honest message from the
   first moment: the connection dropped, we are trying again.
3. **Auto-resume needs a settled condition and a once-only guard.** This
   is the same shape as Sprint 10's auto-start, which dealt to a peer
   that was still `connecting` and left a ghost seat holding everyone's
   cards. Resume must count *connected* players, and a host clicking
   "Start anyway" at the same moment the last player arrives must not
   start the game twice.
4. **Say what the wait is for, and give it an exit at all times.** The
   host sees each expected player by name, marked back or missing, and
   "Start anyway" is available from the first second — not revealed after
   a timeout, which is the pattern that makes people force-reload.

**Gate 1: Approved with the above 4 amendments.** The two code findings
are the right ones, and Cypher is correct that US-43 is not optional
scope: restoring a game to empty hands is not restoring a game.


---

## Backlog after Sprint 9 (2026-08-20)

Fed by the sprint retro; ordered by Cypher, not yet scoped into stories.

1. **3+ players at ~1024px: a personal seat zone overlaps the shared
   pot.** Real geometry, measured. Morpheus's retro is right that this is
   an architecture gap rather than polish — D24's caps have only ever
   been validated against a two-player seat ring. Related to, but not the
   same as, the long-open 5+-player phone-density item.
2. **Multi-touch gestures and long-press menus.** Explicitly out of scope
   for US-40, which covered input parity for dragging only.
3. **Standing review questions** (process, no code):
   - Gate 2: *what device and input was this actually verified on?* The
     touch gap survived six sprints because every test ran on the
     developer's input device.
   - Gate 2: *what does this security-flavoured claim NOT cover?* (from
     Sprint 7, retained.)
   - Groom: *what did a user-facing doc claim before this sprint?* The
     README advertised "No reconnect" and "No persistence" two sprints
     after both shipped.
   - Test review: *does each AC bullet naming a distinct code path have
     its own assertion?* Twice this sprint a function shipped with only
     adjacent tests that looked like coverage.
4. **e2e runtime** is ~3 minutes and the suite is run many times per
   sprint. Not urgent; worth watching before it changes behaviour.
5. **Stories must be written down, not just handed off.** US-38/39 lived
   only in CHAT.md until Oracle backfilled them at Sprint 9 close.


---

## Deferred / Stretch
- Scannable QR code image for joining (v1 ships join-code + Copy Link
  instead; descoped 2026-08-15, see CHAT.md Neo→Cypher).
- In-app text chat or reactions.
- Custom card backs/themes.
- Reconnect-to-session after refresh/drop.
