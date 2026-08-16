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

---

## Deferred / Stretch
- Scannable QR code image for joining (v1 ships join-code + Copy Link
  instead; descoped 2026-08-15, see CHAT.md Neo→Cypher).
- In-app text chat or reactions.
- Custom card backs/themes.
- Reconnect-to-session after refresh/drop.
