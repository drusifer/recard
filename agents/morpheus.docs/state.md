# Agent State

## Context
### Recent Decisions
- Recard v1 architecture locked in `docs/ARCHITECTURE.md`: static site (no
  backend/build), PeerJS + its public signaling broker for P2P connection
  setup, star topology (host = authoritative hub, others connect only to
  host), two message classes on the data channel (reliable "state"
  messages are the only source of truth; best-effort "motion" messages are
  purely cosmetic, throttled + latest-wins coalesced, and never carry info
  not already implied by the last state message). Resolves both of
  Cypher's PRD feasibility flags.
- Module layout decided: deck.js/state.js (pure, unit-testable),
  session.js/protocol.js (PeerJS wiring), ui.js, qrcode.js, main.js.
  Testing via Node's built-in `node --test` (node 24 available, no
  framework dependency).

### Key Findings
- Full-mesh P2P was considered and rejected for v1 — star topology (host
  as hub) is far simpler and still satisfies "P2P, no server infra" since
  the host is just another player's browser, not infrastructure we run.
- Two-tab localhost testing works for WebRTC (loopback), so Smith/Trin can
  manually verify the P2P flow via `python3 -m http.server` without any
  real network.

### Important Notes
- Revisit trigger documented: if PeerJS's public broker (0.peerjs.com)
  becomes unreliable, swap to self-hosted `peerjs-server` — isolated to
  one decision (D2), not a rearchitecture.
- v1 explicitly has no reconnect-after-refresh and no persistence (host
  tab closing ends the session) — documented, not hidden.
- v1.1 (D7-D11, 2026-08-15): resolved Flag 3 by generalizing the existing
  hand-privacy pattern (D3) to middle cards instead of inventing a new
  mechanism — `viewFor()` gets one redaction rule (`faceUp || owner ===
  viewer`) that produces all 4 visibility cases the PRD asked for. 3 new
  reducer actions (PLAY+visibility, REVEAL, PICKUP). Presets/rules-
  reference need zero state/protocol changes (pure client-side lookup
  tables) — kept them out of state.js on purpose, no reason to sync data
  that's identical on every client and never changes at runtime. Solo
  play (US-17) needs no code change at all, confirmed by Cypher's own
  grep before this was even handed to me — just needs a test.

## Current Task
**Status:** Architecture complete, awaiting Smith Gate 2
**Assigned to:** Morpheus
**Started:** 2026-08-15

### Task Description
Design and record v1 architecture for the Recard sprint, then pass through
Gate 2 (Smith UX review) before Mouse does phase breakdown.

### Progress — v1 (DONE, shipped)
- [x] Wrote docs/ARCHITECTURE.md (D1-D6), Gate 2, Mouse phases, all 5
      phases implemented/reviewed, launched.

### Progress — v1.3 "top-down table redesign" (current sprint)
- [x] Wrote docs/ARCHITECTURE.md D17-D19: personal zones are ordinary
      zones with an optional `ownerId` (additive to D12, zero new
      authorization surface since "not deletable" already holds for
      every zone by omission - no `DELETE_ZONE` action exists), seating
      is a per-viewer client-side rotation with no new state/protocol
      (nothing found that currently treats roster order as visual order),
      live card-drag extends D13's existing motion channel with one new
      `kind` - proved the privacy rule (`cardId` included iff
      `faceUp===true` at drag-start) is provably sufficient given the
      existing MOVE_CARD authorization rule already guarantees no
      receiver could ever legitimately see a card the dragger can't.
      Removed the now-superseded "full pixel-sync dragging deferred" item
      from Open Items Carried Forward - this sprint delivers it
      (best-effort, as the user explicitly accepted).
- [x] Posted decision to Oracle for recording
- [x] Smith Gate 2 approval
- [x] Mouse phase plan (7 phases: 21-27) reviewed and approved: phase
      boundaries line up cleanly with D17 (21), D18+US-26 (22),
      D17-UI+US-30 (23), US-28 (24), D19 (25) - each phase touches
      exactly one decision's surface, no phase requires reaching ahead
      into a later decision. Approved.
- [x] Phase 21 code review: matches D17 exactly - `ownerId` is truly
      additive (every existing zone consumer that doesn't know about it
      just doesn't read it), `makeZone()` correctly deduplicates
      construction logic instead of the two call sites drifting apart,
      the re-join dedup check (`zones.some(z => z.ownerId ===
      playerId)`) is the right guard and mirrors the existing
      scores/passed "preserved not reset" pattern exactly. The 6 fixed
      pre-existing tests are a genuinely good catch - a positional
      `zones[N]` assumption silently pointing at the wrong zone once a
      new zone-creating action (JOIN) was added is exactly the kind of
      thing that erodes test-suite trust over time if left. Approved.

### Progress — v1.2 "zones, presence, hand tools" (shipped)
- [x] Wrote docs/ARCHITECTURE.md D12-D16: zones generalize table (D12),
      cursor+lift-cue motion on the existing D4 channel (D13, no new
      transport), pure-client hand-order module (D14, pays down Sprint-1
      debt), DEAL_MORE (D15), pass marker reusing existing actor-auth
      with zero new code (D16)
- [x] Posted decision to Oracle
- [x] Smith Gate 2 (D12-D16 approved earlier in this sprint)
- [x] Phase 18 code review: sort/Deal More/pass-toggle all reuse existing
      D14/D15/D16 architecture with zero new protocol surface, exactly as
      designed (DEAL_MORE and TOGGLE_PASS were already in state.js from
      Phase 13 - Phase 18 is pure UI wiring, no reducer changes needed).
      dealMoreCountEl.hidden mirrors the established resetBtn/
      resetScoresBtn/dealMoreBtn host-only-visibility pattern - consistent,
      not a one-off. The e2e.smoke.mjs native-DnD fix stays inside the
      test file only, doesn't touch production code, and Neo's isolation
      evidence (same failure on unmodified turn-start code) is convincing
      that it's a headless-Chromium environment gap, not something Phase
      18 introduced. Approved.

### Progress — v1.1 "clear backlog" — DONE (all 6 phases shipped)
- [x] Wrote docs/ARCHITECTURE.md D7-D11 (Flag 3 resolution, new reducer
      actions, score model, presets/rules-reference module layout, solo
      play confirmation)
- [x] Posted decision to Oracle for recording
- [x] Smith Gate 2 approval
- [x] Mouse phase breakdown (6 phases: 6-11), reviewed and approved
- [x] Code-reviewed and approved all 6 phases (middle-zone data model,
      score tracking, solo regression + static content, middle-zone UI,
      score/preset/rules UI, final e2e verification)

### Blockers
None

### Oracle Consultations
Posted `*lead decide` with architecture summary; awaiting Oracle's archive
confirmation (non-blocking, Gate 2 can proceed in parallel).

- [x] Phase 19 code review (final implementation phase): the formal e2e
      additions are test-file-only, no production code changed beyond
      Phase 18's already-approved main.js work. Zone/DEAL_MORE/pass/sort/
      cursor coverage all reuse the star-topology host-authoritative
      pattern this whole architecture is built on - nothing here needed a
      new decision. Trin's DEAL_MORE mutation-test (temporarily
      reintroducing the wipe-hand bug to prove the assertion catches it)
      is exactly the kind of verification that should gate a phase like
      this. Approved. **All 8 implementation phases of Sprint 3 ("zones,
      presence, hand tools") are now code-reviewed and passed.**

- [x] Phase 20 code review: a UI-only fix, no state/protocol touched.
      Approve the specific choice made (drop the badge, keep the roster
      row's own text as the single source of truth) over the alternative
      (drop the row text, keep the badge) - the row text already had to
      handle the "you" case (no mini-hand renders for yourself), so
      keeping it as the one place a count is ever shown, for every
      viewer, is the more consistent rule; a badge-only approach would
      have left "your own" row with no visible count at all unless
      special-cased. Dead-CSS removal (`.mini-hand-count`) was verified
      grepped-first, not just deleted on assumption. Approved. **All 8
      implementation phases + the Phase 20 close-out fix for Sprint 3 are
      now code-reviewed and passed.**

- [x] Phase 22 code review: matches D18 exactly - seating is purely
      derived presentation (`seatedOrder()`/`seatPosition()` are both
      pure functions, no state/protocol touched), `#host-roster` staying
      unrotated/unseated (pre-deal, no table yet) is the right scope
      boundary. The pointer-events bug Neo found is a good example of
      why "WHERE something is drawn" isn't zero-risk even when "WHAT it
      shows" stays the same (Smith's own framing) - only the e2e suite
      actually clicking through the new layer caught it. Approved.

- [x] Phase 23 code review: `renderZones`'s new `allZones` param
      (defaulting to `zones` for backward compat) is the right shape -
      every existing caller keeps working unchanged, only main.js's two
      new split calls need to pass it explicitly. The overlap bug Neo
      found and fixed properly (bounded/centered shared-zone footprint,
      not a band-aid) matters architecturally: it's the difference
      between a radius-based seat layout that actually holds up as more
      zones/cards accumulate versus one that only looks fine in a
      screenshot with minimal content. Hand fan choosing rotation+arc
      over horizontal overlap is the right tradeoff given Smith's 44px
      AC - overlap would have needed much more careful per-card z-index/
      hit-region math to stay compliant, rotation sidesteps the problem
      structurally. Approved.

- [x] Phase 24 code review: `dropCardOnZone`'s hand-vs-table branching in
      main.js is the right place for that decision - the UI layer
      (`onDropCard`) doesn't need to know or care which action results,
      keeping `ui.js` a pure rendering layer. Draggable-exactly-where-
      MOVE_CARD-already-authorizes is correct and matches the existing
      pattern (same condition `moveToControl` already used) rather than
      inventing a parallel authorization check that could drift out of
      sync with the reducer's real rule. Approved.
- [x] `seating.js` extraction (response to the user's TDD/test-pyramid
      feedback): good architectural move, not just a testing exercise -
      `seatPosition`/`seatedOrder` are genuinely pure and were previously
      unit-untestable only because of *where* they lived, not what they
      do. Matches `handOrder.js`'s established precedent exactly (D14).
      No behavior change, confirmed by Trin. Approved.

- [x] Phase 25 code review: this is D19 built exactly as designed -
      `cardDragPayload`'s privacy predicate is the same one-condition
      rule from the architecture doc, now proven correct by actual unit
      tests rather than just my own written-out proof. `resolveVisibleCard`
      correctly never trusts the wire for card identity - it re-derives
      from the receiver's own already-known view, meaning even a
      hypothetical malicious/buggy sender couldn't push a fabricated
      `cardId` into a receiver's rendering (defense in depth beyond just
      "sender chooses not to send it"). TTL-based cleanup reusing the
      exact cursor pattern (not a parallel new mechanism) keeps this
      consistent with D13/D4. Approved. **D19 - the last of Sprint 4's
      three architecture decisions - is now fully implemented,
      test-covered, and reviewed.**

- [x] Phase 26 code review (final implementation phase): the density fix
      is architecturally sound - a CSS custom property driven by player
      count is the right mechanism (no new state, purely presentational,
      consistent with D18's whole "seating is derived, not stored"
      principle). More importantly: approve NOT overclaiming the fix as
      complete. Honestly reporting "improved but not fully resolved,
      likely needs a compact-seat redesign" instead of quietly shipping
      a half-fix as "done" is exactly the right call here - a
      score-button 44px floor genuinely can't be squeezed further
      without either dropping functionality from the seat card or a
      real redesign, and that's not a decision to make unilaterally
      mid-phase. Approved. **All 6 implementation phases of Sprint 4
      ("top-down table redesign") are now code-reviewed and passed.**

## Next Steps
### Immediate Next Action
Sprint 4 implementation is done. Handing to Oracle to groom docs, then
Smith for the Stage-3 close-out test - which should specifically
re-verify the 5+ player mobile density finding via her own Gate 1
requirement, and decide whether it's a Phase 27 fix-now item or a
backlog item for a proper compact-seat redesign.

- [x] Phase 27 code review: CSS-only, zero JS/state/protocol touched.
      Reusing the `[draggable="true"]` attribute selector to scope the
      cursor rule is the right call - it's derived from the same
      authorization condition Phase 24 already computes, so there's no
      way for the cursor affordance and the actual drag permission to
      drift out of sync with each other over time (a second hand-rolled
      condition would risk exactly that). `:active` instead of a JS
      class toggle is simpler and can't get out of sync with the real
      drag state either. Approved. **Sprint 4 ("top-down table
      redesign") is now fully implemented, test-covered, and reviewed -
      6 implementation phases + 1 close-out fix.**

## Next Steps
### Immediate Next Action
Handed back to Smith to re-test and close uat-report-sprint4.md, then
Sprint 4 retro, then Cypher launch.

### Waiting On
@Smith: re-test + close-out.

### Planned Work
- [ ] Sprint 4 retro.
- [ ] Cypher launch.

---

## Sprint 5 ("desktop table width", US-31) — Architecture

### Recent Decisions
- Wrote D20 in docs/ARCHITECTURE.md: pure CSS breakpoint fix, zero
  JS/state/protocol change. Verified by reading `src/seating.js` before
  deciding anything (not assumed) - `seatPosition()` places seats/zones
  as a percentage of `.table-surface`, which itself has no independent
  max-width and just inherits `#screen-game`'s width. So the existing
  geometry already scales; it just never got a wider box. Two new
  tiers: `@media (min-width:1024px)` → 1100px, `@media (min-width:1440px)`
  → 1300px - chosen to land exactly on Smith's requested UAT checkpoints
  (1024/1440) so testing hits the breakpoint boundaries themselves, not
  just mid-tier. 1300px cap is deliberate per Cypher's AC (no
  unconstrained full-bleed on 4K).
- Explicitly noted in D20 what does NOT change: the pot area's existing
  13rem max-width (stays bounded on purpose, separate from the seat
  ring), fixed card pixel dimensions (cards don't get physically bigger),
  and `.screen`'s 480px base (host/join forms, per Smith's Gate 1 note).
- No Tank/devops involvement - static CSS, no new env vars/services.

### Blockers
None.

## Next Steps
### Immediate Next Action
Handed to Smith for Gate 2 (architecture UX review) — concrete
1024px/1300px/1440px values now available for Smith to sanity-check
against the checkpoints Smith itself requested at Gate 1.

### Waiting On
@Smith: Gate 2 `*user feedback` / `*user approve`.

### Planned Work
- [ ] Smith Gate 2.
- [ ] Mouse phase plan (likely 1 phase — single CSS-only story, Cypher
      already flagged this as a Fast-Track candidate).

### Progress — Sprint plan review (Phase 28)
- [x] Reviewed Mouse's single-phase plan (task.md Phase 28) against D20:
      T28.1 is exactly the two `@media` tiers, no drift. T28.2's
      checkpoints (1023/1024/1439/1440px) match D20's own breakpoint
      values, not arbitrary numbers. Confirmed `tests/e2e.smoke.mjs`
      already uses Playwright (`chromium`, real `page`/`context`
      objects) — `page.setViewportSize()` is a standard Playwright API,
      so T28.2 needs no new test infrastructure, just new assertions in
      the existing suite. **Approved, no changes requested.**

### Progress — Phase 28 code review
- [x] Reviewed the actual diff (`git diff -- style.css tests/e2e.smoke.mjs`),
      not just Neo's/Trin's summaries. `style.css`: exactly the two
      `@media` tiers D20 specifies, nothing else touched, well-commented
      with the "why" (percentage geometry already scales). No
      src/*.js changed - confirmed the "pure CSS, zero JS" claim from
      D20 actually held through implementation, not just at design time.
- [x] `tests/e2e.smoke.mjs`: sound. One minor, non-blocking nit -
      `screenGameWidth`/`tableSurfaceWidth` are near-duplicate 3-line
      helpers (only the locator selector differs) - could collapse to
      one `elementWidth(selector, width)`. Not worth a reject/fix cycle
      over 3 duplicate lines in a test script on a Fast-Track sprint;
      noting for Neo to fold in opportunistically if this file gets
      touched again, not blocking this phase.
- [x] Confirmed Trin's added assertions (`.table-surface` width growth,
      continuous-resize monotonicity sweep) are real, targeted checks
      that fill gaps D20/T28.2 didn't originally specify, not scope
      creep - both trace directly back to Cypher's AC and Smith's Gate 2
      note respectively.
- **Approved. Sprint 5 ("desktop table width") is now fully implemented,
  test-covered, and reviewed - 1 implementation phase, no bug-fix phase
  needed.**

## Next Steps
### Immediate Next Action
Only phase this sprint - handing directly to Oracle for groom rather
than back to Neo for a next phase.

### Waiting On
@Oracle: groom (DECISIONS.md already has D20 from the arch step; Oracle
should cross-reference/archive per usual, update lessons/memory, check
CHAT.md length).

### Planned Work
- [ ] Oracle groom.
- [ ] Smith close-out test.
- [ ] Retro + Cypher launch.

---

## Sprint 6 ("snap-to stack/overlap" + deck operations) — Architecture

### Recent Decisions
- D21 (docs/ARCHITECTURE.md): **corrected** Cypher's Flag 6 proposal —
  a boolean `stacked` doesn't fit Smith's "two explicit modes"; used a
  `layout: 'stack'|'overlap'|undefined` enum instead. `PLAY`/`MOVE_CARD`
  gain optional `beforeCardId`/`layout` params via one shared
  `insertCard()` helper (both reducer cases call it, no duplicated
  splice-or-push logic); omitted = today's exact append behavior, 100%
  backward compatible with every existing call site. `MOVE_CARD`'s
  same-zone no-op is deleted (was correct when reordering didn't exist;
  now it does). No privacy/protocol changes — confirmed both of
  Cypher's flagged open questions resolve to "no new logic needed."
- D22: **corrected** Cypher's Flag 7 proposal — `dealCards()`'s actual
  contract (fixed count per destination) doesn't match `SPLIT_DECK`'s
  need (exhaust the whole deck); `SPLIT_DECK` gets its own small
  round-robin loop instead of being forced through `dealCards()`.
  `SHUFFLE_DECK` reuses `shuffle()` directly, confirmed trivial. Caught
  one small correctness fix while in this area: `PICKUP` needs to also
  strip the new `layout` field when a card returns to a hand (already
  strips `owner`/`faceUp` the same way).
- No Tank/devops gate needed — app code only, no env/deploy/CI surface.

### Blockers
None.

## Next Steps
### Immediate Next Action
Handed to Smith for Gate 2.

### Waiting On
@Smith: Gate 2 (`*user feedback` / `*user approve`).

- [x] **D23 added mid-Gate-2**, user-directed: unified `Pile` storage
      model (`state.piles` replaces `deck`/`hands`/`zones`). Scoped
      tightly: `viewFor`'s output shape stays byte-for-byte identical
      (two existing redaction behaviors preserved), so the refactor is
      contained entirely inside `state.js` - `ui.js`/`main.js`/
      `protocol.js` need zero changes. No data-migration risk (app is
      fully ephemeral, no persisted state to migrate). Resolves D22's
      own noted duplication for real: one `dealRoundRobin()` replaces
      both `dealCards()` and `SPLIT_DECK`'s dedicated loop. Sequenced as
      its own phase BEFORE the D21/D22 feature work.
- [x] Smith Gate 2: approved D21/D22/D23, with one real correction to
      D21 (layout-write direction bug, see CHAT.md) folded in before
      approval.

### Blockers
None.

## Next Steps
### Immediate Next Action
Handing to Mouse for phase planning — sprint now has 4 concerns: (0)
Pile unification refactor [must be first], (1) card stack/overlap, (2)
deck operations, (3) e2e verification across all of it.

### Waiting On
Nothing.

### Progress — Sprint plan review (Phases 29-34)
- [x] Reviewed Mouse's 6-phase plan against D21/D22/D23: sequencing is
      correct (29 foundation -> 30 state -> 31 UI -> 32 deck ops -> 33
      e2e -> 34 reserved), matches the explicit "D23 must land first"
      requirement, and T30.2 names the before-side-overlap direction
      test explicitly rather than leaving it as incidental coverage.
      **Approved, no changes requested.**

## Next Steps
### Immediate Next Action
Handing to Neo for Phase 29 (Pile unification) — the whole sprint
depends on this landing cleanly with zero regressions first.

### Waiting On
Nothing.

### Progress — Phase 29 code review: APPROVED
- [x] **Ruled on Neo's flagged D23 deviation: ACCEPTED**, recorded in
      ARCHITECTURE.md D23. Decisive reason is the data clump — a hand
      card's `owner` would permanently duplicate its pile's `ownerId`,
      two places expressing one fact, the exact drift risk D17 was
      careful to avoid. The Pile abstraction stays uniform; only the
      card payload varies, and that variance is real (a hand card has no
      independent visibility; a zone card does). Noted the accepted cost
      honestly rather than pretending there is none: "is this card
      visible" is now a two-step question.
- [x] Reviewed the diff: no positional `state.piles[i]` indexing
      anywhere, all access goes through the selectors or `kind` checks.
      `DEAL`/`DEAL_MORE` collapsing to one case + `fresh` flag is
      correct and now covered (Trin's finding).
- [x] **Found a forward-looking landmine and recorded it as a binding
      invariant**: `deckOf()` is deliberately unguarded
      (`.find(...).cards`), so "exactly one deck pile always exists" is
      load-bearing but was implicit. The natural-looking `SPLIT_DECK`
      implementation ("the deck is now N piles, so drop the deck") would
      break every later `DRAW`/`DEAL` with an opaque undefined error.
      Written into D23 as an explicit constraint on Phase 32 rather than
      left to be discovered by whoever writes it.
- [x] Second, smaller note: in the merged `DEAL`/`DEAL_MORE` case, the
      `findIndex(...) === -1` branch (a hand pile whose owner is no
      longer in `players`) is **unreachable today** — no reducer ever
      removes a player. Its behavior also differs subtly from pre-D23
      (empties the hand rather than dropping it). Harmless now; flagged
      so that if a `LEAVE`/`REMOVE_PLAYER` action is ever added, that
      branch gets a deliberate decision instead of inheriting an
      accidental one.
- Smith UX gate skipped for this phase by the bloop rule (pure internal
  data-layer refactor, zero observable surface — `viewFor` output and
  every UI module are provably unchanged). Smith re-engages at the
  sprint's Stage-3 close-out as normal.

## Next Steps
### Immediate Next Action
Phase 29 approved. Neo to start Phase 30 (position-aware
`PLAY`/`MOVE_CARD` + `layout`), now building on the unified model.

### Waiting On
@Neo: Phase 30.

---
*Last updated: 2026-08-16 (Sprint 6 Phase 29 review)*

### Progress — Phase 30 code review: APPROVED
- [x] **Ruled on Neo's flag: revision ACCEPTED**, D21 amended. This was a
      real internal inconsistency in my own decision, not Neo redefining
      the API: D21 specified `beforeCardId` + `layout` while *also*
      specifying Smith's Gate 2 rule, and those are incompatible —
      "insert before T" and "insert after T's predecessor" are the same
      insertion point but must write `layout` to different cards, so
      `beforeCardId` provably cannot carry the distinction.
      `targetCardId` + `side` is the minimal repair.
- [x] Recorded the process observation rather than just the fix: this is
      the **second** implementation-stage catch of an architecture-stage
      defect this sprint (D23's data clump, now D21's params-vs-rule
      drift). Both came from writing the rule and the mechanism in
      separate passes without checking them against each other. Flagged
      for the retro.
- [x] Reviewed the code: `placeCard()`/`withLayout()` correctly isolate
      the rule to one branch; remove-then-insert ordering for same-zone
      moves is right (and Neo's comment explains the off-by-one it
      avoids). `PICKUP` strips `layout` consistently with `owner`/
      `faceUp`.

### Progress — Phases 31 + 32 code review: APPROVED
- [x] Phase 31: `dropTarget.js` as a pure module is the right call and
      applies Sprint 4 retro item 13 *proactively* for the first time -
      the geometry is unit-tested directly instead of only through the
      browser. Measuring the `.card` face rather than the wrapper is a
      real correctness detail (the wrapper includes the controls below,
      which would have made "on the card" reach into its own buttons).
- [x] Phase 32 / D24: approved, and I've amended D24 to record that two
      of its own premises were wrong (pot not centred; clearance bounded
      by height, not width). That is now **three** implementation-stage
      catches of architecture-stage defects this sprint (D23 data clump,
      D21 params-vs-rule, D24 premises). The pattern is consistent:
      every one came from writing a rule without checking it against the
      concrete artifact it governs. Retro item, not a one-off.
- [x] The strongest evidence this sprint: removing D24's centring makes
      the e2e fail as a *click timeout*, reproducing the exact
      click-through symptom the original 13rem cap comment describes.
      The cap had been carrying that reputation without actually
      delivering it since the surface grew.

### Progress — Phase 33 code review: APPROVED
- [x] `SPLIT_DECK` correctly honours D24's deck-pile invariant - the one
      I flagged pre-emptively at Phase 29 review. Worth recording that
      the flag paid off: Trin's mutation shows removing the pile fails
      exactly the guard test written for it, so the invariant is now
      enforced rather than merely documented.
- [x] Reusing D21's `layout` to render Split's piles is the right call -
      a pile IS a stack, so it needs no new rendering concept. This is
      the second time this sprint that an earlier decision absorbed a
      later requirement for free (D7 absorbed Split's face-down
      redaction too).
- [x] The `redactMiddleCard` change is correct and correctly scoped:
      arrangement is shared state per D21, identity is not, and the
      split is exactly along that line. Approved with the test Trin
      mutation-verified.
- [x] Accepted the pile-density finding as a **design item, not a bug**:
      the pot's height is bounded by D24's measured seat-ring clearance,
      so "see 4 piles at once" cannot be solved by enlarging it. Routing
      to Smith at close-out for a UX read on the two candidate
      directions (tighter peek for face-down piles vs. rendering a
      face-down pile as a single back + count, like the deck stack).

---
*Last updated: 2026-08-20 (Pile/Zone/GameConfig framework sidebar, mid-Sprint-12)*

## D38-D40: Pile/Zone/GameConfig framework (proposed, queued for Sprint 13+)

### Context
User-initiated architecture sidebar during Sprint 12, while a
background implementation was actively landing Phases 53+ on the
*current* `kind`-string model. Deliberately did not touch code or the
in-flight sprint - recorded the design in writing (full text:
`docs/ARCHITECTURE.md` "v3.0 Proposed Architecture" section, right
after D37) and queued it in `docs/USER_STORIES.md` for Cypher, rather
than letting it live only in chat/memory.

### Decisions
- **D38**: four primitives, kept strictly separate - GameConfig (the
  composition: players, DeckDefinition, Zone list, Zone->Pile bindings,
  `allowsPlayerZones` flag), DeckDefinition (what cards exist - deck
  type incl. pinochle, N decks, jokers - pure data), Zone (a typed slot
  from a fixed catalog: PlayerZone/TableZone/HandZone/DeckZone), Pile
  (behavior - D39). Rejected folding DeckDefinition into Pile: deck
  type and pile behavior are different axes: a pinochle Deck and a
  standard Deck are the same pile type with a different DeckDefinition.
- **D39**: Pile as a 5-method interface (`actions`, `canAccept`/
  `insert`, `canRemove`/`remove`, `dropRule`, `redact`). Card actions
  are double-dispatched, not single-dispatched - every action crosses
  two piles (leaves one, enters another), so the DESTINATION pile
  decides how a card lands (stack-onto-top vs. spliced into a fan),
  independent of the source. This replaces `state.js`/`pileActions.js`/
  `ui.js`'s current `p.kind ===` string-switch (in ~10 places) with
  real polymorphism, on BOTH ends of the replicated protocol, not just
  in rendering. `dropTarget.js` keys its halo-vs-stack behavior off
  `dropRule()` instead of applying one universal algorithm to every
  non-deck/non-hand pile (today's implicit behavior).
- **D40**: `Card.orientation` (portrait/landscape) is REPLICATED STATE,
  confirmed with the user - not derived presentation. Lives next to
  `faceUp`; redaction decides per-viewer visibility like any other
  field. Pile types that don't use it simply never touch it.

### Why this belongs in D-numbering (D38, following D37 from this
sprint) even though nothing is implemented: it's a binding architecture
decision about SHAPE (same authority as any other D-entry), just gated
on Cypher scoping it as real stories before code starts - not a lesser
kind of decision, an earlier-stage one.

### Next Steps
Sequencing is explicit in both docs: Sprint 12 (v2.0) closes first: no
implementation starts against this section alone. @Cypher scopes real
stories from the `docs/USER_STORIES.md` backlog entry once Sprint 12
launches. Oracle should archive D38-D40 into `docs/DECISIONS.md`
alongside the rest of the v2.0 sprint's decisions during groom (note:
`docs/DECISIONS.md`'s narrative log currently stops at D20 - the D21+
sprints only got recorded in `ARCHITECTURE.md`'s per-sprint sections;
worth flagging to Oracle as a real gap, not assuming it's already
synced).

---
*Last updated: 2026-08-20 (D38-D40 sidebar, mid-Sprint-12)*

## Shutdown prep catch-up (2026-08-22)

Everything sequenced above happened, and then a lot more. Full arc since
the note above: Sprint 12 (v2.0, US-46 pile-hover-actions, D34-D37) shipped
and closed, including a real pre-Phase-53 diagnosis of a RED e2e suite (a
z-index stacking-context trap, a card-stack/halo test ordering issue, a
D24 seat-ring/pot retune - none of them the stale-assertion issue
originally assumed). Then the D38-D40 epic ran to completion across
Sprints 13-20 (D41-D50): Pile as a real polymorphic interface, split into
two tranches (D41) when the original single-tranche design turned out not
to cover in-place actions; GameConfig, DeckDefinition (pinochle), a real
Discard pile type proving Open/Closed, Card.orientation, a preset schema,
and hiding Add Zone when disallowed. The `docs/DECISIONS.md` D20-ceiling
gap flagged in this file's own note above got resolved during Sprint 14 -
the file now states it's superseded by ARCHITECTURE.md's per-sprint
sections, not left stale.

Then a second design pass, driven directly by user feedback rather than a
Cypher-scoped story: bigger cards (root-caused a `min-width:0` specificity
bug, not just a number bump), Hand folded into the table as a real Zone
(reusing the Pile framework the D38-D49 epic had just built - exactly the
kind of cheap extension that epic was for), one shared `ACTION_SPECS`
interface replacing `ACTIONS`/`PILE_ACTIONS` with NO compatibility
aliases (explicit user correction - see [[feedback-no-backcompat-shims]]
in project memory), and finally a pointer-centered radial action menu
(D52) replacing every prior action-display mechanism entirely. A full e2e
suite migration + proper formal close followed, catching 5 more real bugs
along the way (see CHAT.md's retro messages around commit `65090e4` for
the list).

**Architecture is current through D52** in `docs/ARCHITECTURE.md`. Two
architectural judgment calls worth remembering if resuming cold:
- The D51/D52 redesign was explicitly scoped **desktop-only** by direct
  user instruction, overriding this persona's usual touch-parity
  instinct - not an oversight, don't re-raise it as a gap next time this
  area is touched unless asked to extend it to touch.
- "When unifying two interfaces, fully prune the old ones" is now a
  standing user preference (saved to project memory), not a one-off for
  `ACTION_SPECS` - apply it by default on future consolidations here.

**Still open:** the builder screen (needs real user product/UX scoping,
not an architecture call) is the only piece of the original D38 epic
never started. Two minor visual overlaps are backlogged, not blockers.

Current state: branch `touch-targets-and-pile-actions-sprint`, commit
`44303e3`, working tree clean, 260/260 unit tests green, e2e green as of
last close. Nothing pushed to remote.

---
## Sprint 22 ("Zone/Pile polymorphism, proven by Solitaire + Spit") — 2026-08-24

### Context
User asked to "complete the refactor to Zone/Pile APIs." Checked the
premise first (no current caller needs D38's original separate Zone-
type catalog) and flagged it rather than building speculatively; user's
follow-up sharpened the real ask into D53 (docs/ARCHITECTURE.md):
retire `dropRule` enum for real per-pile-type `canAccept`/
`resolveDropTarget` polymorphism, proven against Solitaire (`foundation`,
`cascade` kinds) and Spit (`rankAdjacent` kind), plus one additive
`GameConfig.zones` field so a preset can auto-build its table.
Full *plan sprint chain run: Cypher (US-56..59) → Smith Gate 1 (approved,
1 note on foundation's silent-lock UX) → Morpheus D53 → Smith Gate 2
(approved, 1 ask: preset-select should prefill the table visibly) → Mouse
6-phase plan (task.md Phases 62-67) → Morpheus review: APPROVED.

## Sprint 23 ("pile-level actions, generalized") — D55, 2026-08-25

D55 recorded (docs/ARCHITECTURE.md): US-60 (`SPLIT_PILE`) and US-61
(`TAKE_PILE`) generalize existing `SPLIT_DECK`/`makeTableSidePile`
mechanics onto `zone`/`discard` piles' `pileActions`, no new interface
method needed. US-62 (`SET_PILE_ORIENTATION`) reducer independently
re-enforces Smith's host/owner-only ruling (presentation-layer offering
is not a security boundary, D43's standing rule). US-63's premise check
found a real gap, not just an open question: "Zone" IS "Pile" in this
codebase (D53) and D54's Table Zone grouping is a hardcoded 3-pile UI
bundle, not a generic container - so "drag a pile into another Zone"
had no real reparent target to design against. Added one new additive
field, `groupId` (nullable), as the actual generic mechanism; did NOT
migrate D54's existing Table Zone bundle onto it this sprint (separate
migration risk, zero new capability, tracked as its own follow-up).
`MOVE_PILE(pileId, targetPileId)` sets `groupId`, restricted to
`zone`/`discard` per Smith's ruling. US-63 sequenced as its own phase -
strictly larger than the other three, depends on nothing they build.

### Current Task
**Status:** D55 written, handing to Smith for Gate 2 (architecture
review) before Mouse sizes the sprint plan.

### Next Steps
@Smith: Gate 2 on D55, specifically the `groupId` mechanism for US-63
and the deck-identity-based exclusion. Then @Mouse for phase breakdown
(4 stories, US-63 as its own phase per the sequencing note above), then
back here for sprint-plan review, before Neo starts implementation.

**Update:** Gate 2 approved (2 UX notes, both folded into Phase 72's
own AC). Mouse's 6-phase plan (task.md 68-73) reviewed - APPROVED, no
changes. Sequencing is right: 68/69 (reducer cases) land clean before
70 (their UI) touches anything; 71 (groupId+MOVE_PILE, pure) proves the
new field/reparent logic in isolation before 72 wires an actual drag
gesture to it - same "foundation before feature" discipline as D23/
Phase 29 and Sprint 22's own 62-before-63/64. Full *plan sprint chain
done: Cypher (US-60..63, 5 open Qs flagged) → Smith Gate 1 (approved,
all 5 resolved into the AC) → Morpheus D55 (found Zone==Pile premise
gap, added groupId) → Smith Gate 2 (approved, 2 UX notes) → Mouse
6-phase plan → this review. Handed to Neo for Phase 68.

**Corrected twice, same session, direct user rejection - both about
US-63/Phase 71 only, Phase 68-70/73 unaffected:**
1. "Zone IS Pile" (my own D55 text) was wrong - a real type confusion,
   not a defensible simplification. Root cause: I read `zonesOf`'s
   *implementation* (today, a standalone zone happens to be persisted
   as exactly one pile) and mistook that shortcut for the *design*.
   D54's own architecture (which I wrote in the same session) already
   treats Zone (the `<zone-panel>` box) and Pile (the content inside
   it) as separate rendering roles - I should have caught the
   contradiction against my own prior work before writing D55, not
   after the user caught it.
2. Follow-up correction: the `<table-zone>` hardcode's removal is now
   IN SCOPE for Phase 71, not a deferred follow-up - zone membership
   must come entirely from `GameConfig`/preset config, no exceptions,
   once a real `zoneId` mechanism exists to express it.

Fixed: `docs/ARCHITECTURE.md` D55 rewritten with a real `state.zones`
entity + `zoneId` field (not `groupId`-on-pile); `task.md` Phase 71
rewritten to match, now includes the config-driven default layout +
hardcode deletion. Neither correction touches Phase 68-70/73's designs
(SPLIT_PILE/TAKE_PILE/SET_PILE_ORIENTATION) - those don't reference
Zone-as-container at all.

## Phase 68 review (2026-08-25)

APPROVED. SPLIT_PILE/TAKE_PILE reducer cases, zone/discard gain both in
pileActions. Two real mid-build corrections, both right calls: (1)
TAKE_PILE's guard diverged from the plan's spec'd `cardActions(...)
.includes('pickup')` check - discardPile's cardActions is
unconditionally empty by design (D45's drop-only rule), which would
have made discard-take permanently impossible, the story's own named
use case; built as its own bulk visibility check instead. (2) A real
gap in the original plan - offering `take` with no matching
`ACTION_SPECS` entry crashed the app - caught and fixed pre-ship, not
left for Trin. `lint:design` 14->15 (one phone-width overlap) disclosed
honestly, correctly bucketed with an existing open item rather than
either hidden or over-scoped into a new fix. Handed to Neo for
whichever of Phase 69/70/72 the user picks up next.

### Lesson worth remembering for next time
When a premise-check finds what looks like "X and Y are actually the
same thing" from reading data-layer naming/shortcuts alone, cross-check
it against this project's own already-shipped architecture for that
exact pair before writing it down as a decision - D54 already answered
the Zone-vs-Pile question explicitly, in the same session, and D55
should have deferred to it rather than re-deriving a conflicting answer
from a narrower slice of evidence (one state.js comment about naming).

---

**Status:** Planning complete, handed to Neo for Phase 62.
Sequencing is load-bearing: Phase 62 (dropRule→polymorphism on the 4
EXISTING kinds, zero behavior change) must land + pass full regression
before Phase 63 (foundation/cascade) starts — same discipline as D23/
Phase 29.

### Next Steps
Resume with `*swe impl phase 62` (Neo), then `*qa uat phase 62` (Trin),
then back here for code review, before Phase 63 begins. Context was
getting large this turn — recommend `/clear` before starting Phase 62's
actual implementation if not already done.

## D56: Pile/Zone real class hierarchies + capability mixins (2026-08-25)

User ran `*arch` directly asking for the path off today's flat-module
`PILE_TYPES`/`ZONE_TYPES` registries onto real `class X extends Pile`/
`extends Zone` hierarchies, plus `Actionable`/`Movable`/`Resizable`
capability interfaces and 1:1-by-render-shape Web Component pairing.
Confirmed the "mess" complaint is real before designing anything:
`redactCard`/`canRemoveCard`/`removeCard`/the reveal-pickup-move-rotate
`cardActions` rule are copy-pasted byte-for-byte across
`discardPile.js`/`foundationPile.js`/`cascadePile.js`/`Pile.js` today.

**Full design + 3 Mermaid class diagrams: `docs/ARCHITECTURE.md` D56.**
Chat broadcast (truncated to 512 chars, doc has the full reasoning):
CHAT.md 22:55.

### Key calls made, each with a rejected alternative on record in D56
1. `FoundationPile extends RunPile extends MeldPile` — Solitaire's
   ascending-from-Ace foundation IS a same-suit sequential run, a
   special case, not a sibling concept. `SetPile` added as a
   documented, tested-empty placeholder (Rummy-style same-rank melds)
   — NOT built speculatively; this project's own "don't build for
   hypothetical requirements" standard applies to the architecture doc.
2. Cascade vs RankAdjacent flagged as a possible further merge
   (adjacency-with-a-side-constraint, parameterizable) but NOT
   collapsed in this pass — needs real tests in hand, not a blind call
   from reading two files.
3. Rejected `StockPile` as a class — same concept as `DeckPile`
   (already has `DECK_PILE_ID`/`deckOf()` machinery), would be a pure
   duplicate name. Direct application of the user's own anti-
   duplication ask.
4. Rejected persisted `YouZone`/`OpponentZone` classes — `state.zones`
   is shared/replicated state (D7/D17), one record per zone regardless
   of viewer; a per-viewer class would mean re-tagging every zone per
   `viewFor` call, redesigning the redaction boundary to solve what's
   actually a rendering concern. Corrected to `Zone.viewerRelation
   (zone, viewerId)`, a pure function centralizing today's inline
   `ownerId === viewerId` checks already scattered through `ui.js`.
5. `ScoreZone extends PerPlayerZone` — NEW, folds today's fully
   parallel `<score-zone>`/`renderScorePanel` per-player loop (built
   directly off `state.scores`, outside the Zone model entirely) into
   a real `state.zones` entity. The one phase with genuine new visible
   behavior surface — needs Smith's read specifically.
6. Rejected 1:1 component-per-data-class — component tag encodes
   render SHAPE (`pile-panel`/`fan-pile`/`deck-stack`/`zone-panel`/
   `score-zone`), multiple data classes legitimately share one tag
   (matches D51's own `rowShape` precedent, just de-indirected onto a
   `static component` field read directly instead of through
   `rowShapeFor()`'s lookup table).
7. Rejected big-bang rewrite — 5-phase migration proposed (Pile
   classes → Zone classes → ScoreZone → capability mixins →
   SetPile-stays-a-placeholder), each phase regression-gated before the
   next, matching D42/D53/D55's own established discipline. Named why:
   D31's `.btn-row[hidden]` bug and D51's card-drag callback-arity bug
   were BOTH found only by running the app between phases, never by
   reading a mechanical-refactor diff — nothing about this migration's
   size argues for skipping that.

### Current Task
**Status:** Design recorded, migration approach revised per direct
user correction, no code touched yet.

### Correction (2026-08-26): no phased migration
User rejected the 5-phase, regression-gated migration plan outright:
"I don't want a 5 phase migration. It's okay to break things, we don't
need to be backward compatible, and we can delete tests that are no
longer relevant." Rewrote D56's Migration section in
`docs/ARCHITECTURE.md` accordingly — this is now a **single
implementation pass**, not a sized sprint with gates between steps.
Breaking changes and deleting stale tests are both explicitly
sanctioned (matches the project's existing D51 "no compatibility
shim" precedent, just applied at the class-hierarchy level). Full
suite + `lint:design` still run once at the end; `ScoreZone` still
gets a live visual check since it's the one piece with real new
visible behavior. `SetPile` stays an unbuilt placeholder — that call
is unrelated to the process correction and still holds.

### Next Steps
@Smith: `*user review` on `ScoreZone` specifically (the only real
visible-behavior change in this rewrite). Then straight to @Neo to
implement the whole rewrite as one pass — no Mouse sprint-sizing step,
no phase gates. Keep this separate from Sprint 23's in-flight Phase
72/73 pile-actions work (different epic), but do not block it behind a
planning ceremony.

## D56 code review (2026-08-26) - APPROVED

Reviewed after Trin's UAT pass (341/341, mutation-verified, PASS).

- **LOC check, not just a vibes call**: the 7 old flat modules
  (`zonePile`/`deckPile`/`handPile`/`discardPile`/`foundationPile`/
  `cascadePile`/`rankAdjacentPile` at HEAD) totaled 614 lines. The new
  hierarchy (11 files, including `MeldPile`/`RunPile`'s new abstraction
  layer AND the unused `SetPile` placeholder, both net-new) totals 595
  - a real reduction despite ADDING two new classes nothing required
  before. The duplicated blocks (`redactCard`/`canRemoveCard`/
  `cardActions`'s reveal-pickup-move-rotate rule) are gone from every
  file that used to carry a copy.
- `FoundationPile extends RunPile extends MeldPile` is exactly the
  right shape - Solitaire's ascending-from-Ace rule really is a
  same-suit-run's special case, expressed as one overridden method plus
  a `super` call, not a rewritten sibling.
- One deliberate, acceptable exception to "don't restate an inherited
  default": `HandPile.tableSide = true` restates `Pile`'s own default
  verbatim. Correct call, not a miss - it's the exact flag whose
  earlier wrong value (`false`) caused a real caught bug this session;
  making it explicit here is a guard against re-introducing that
  mistake, not decorative duplication. This is the kind of one-line,
  deliberate redundancy that's fine - different in kind from the
  multi-line duplicated rule-bodies this rewrite actually targeted.
- Both of Neo's scope calls (mixin rejection, ScoreZone ruled out) hold
  up under review - checked the same `renderPileShell`/
  `wirePanelLayout` sharing myself, agree there's no real duplication
  left at the component layer to justify a mixin.
- Trin's one non-blocking finding (11 `AP-VIA-READ` flags this
  session) - noted, not something to re-litigate here; a workflow
  discipline gap, not a code-quality one.

**Verdict: APPROVED. D56 is done.** No further phases - this was the
whole scope per the user's own no-phase-gate directive.

### Next Steps
@Oracle: groom - update docs/decisions as needed, archive if CHAT.md is
getting long. No open D56 work remains; ScoreZone-as-a-real-Zone is a
separate future feature request if wanted, not a D56 follow-up (see
`docs/ARCHITECTURE.md` D56's own closing section).

## D57 code review (2026-08-26) - APPROVED

Reviewed after Trin's UAT (PASS, one real coverage gap found+fixed
during review itself - good sign of genuine scrutiny, not rubber-
stamping).

- Traced every `stopPropagation()`/bubble path by hand across the 3
  drop layers (per-pile -> zone body -> `#zones` background): a card
  drop stops at whichever layer actually claims it; a pile-drag token
  is deliberately let bubble PAST the per-pile layer (a pile dropped
  on top of another pile belongs to the containing ZONE, not that
  specific sibling) and IS stopped at the zone layer once claimed, so
  `#zones`' own ungroup handler only ever fires for a genuinely
  unclaimed drop. Coherent, no double-dispatch path found.
- The `attachPanelDrag`-vs-native-drag conflict resolution (skip
  pointer-drag wiring on a reparentable pile's own title) is the right
  call, correctly scoped (only reparentable kinds lose panel-reposition
  via title-drag; deck/hand/foundation/cascade/rankAdjacent keep it
  unchanged since they never get native drag) and honestly disclosed
  as a trade-off rather than silently dropped.
- `CREATE_PILE` reusing `transferCard` (D43) rather than hand-rolling a
  new remove/insert pair is the right reuse - same authorization/
  `canAccept` pipeline every other transfer goes through, not a
  parallel path that could drift.
- The `MOVE_PILE`-reads-`reparentable` fix is a genuine correctness
  improvement (one source of truth instead of two that had already
  silently diverged) - good instinct to fix it while already in this
  code rather than filing it separately.

**Verdict: APPROVED.** No architecture concerns. Real interaction
model change (new drag gestures) - Smith's UX gate applies per the
`*impl` bloop chain, not skippable as internal-only.

### Next Steps
@Smith: `*user test` D57 - live drag interactions specifically (pile
reparent/ungroup, card-drop-spawns-pile), not just a spec read.

---
## *fix: zone-drop-gutter review (2026-08-27) - APPROVED

Direct user request: PlayerZone/OpponentZone should permit dropping a
card to spawn a new pile, same as the Table Zone (for melds). Neo/Trin
chain (`*fix`, not `*impl` - no Smith UX gate required for this loop).

**Root cause was genuinely non-obvious**: `CREATE_PILE`
(`state.js`)/`onDropCardOnZone` (`main.js`) were already fully
generic and unrestricted by zone type - the actual bug was pure CSS
geometry. `.seat-zone` is `width: max-content` ("zone expands to fit
its piles" - my own earlier-sprint call, still correct in principle),
so with one pile (the hand) filling it, `.zone-body` had ZERO spare
pixels for the existing empty-space-drop listener to ever catch.
`.zone:not(.seat-zone)` (Table Zone) only worked by accident of
`flex: 1 1 auto` giving it real leftover row space. Neo confirmed this
LIVE (Playwright `boundingBox()` on a real CSS fixture - identical
boxes before the fix, real reachable space after) rather than shipping
a guess.

**Decision (posted to chat)**: a small reserved `.zone-drop-gutter`
(one card-slot, dashed, `renderZonePanel`'s last body child, every
zone type) over two rejected alternatives - widening `.seat-zone`
itself (would undo the earlier "expand to fit piles only" decision)
and scoping the gutter to `.seat-zone` alone (a standalone single-pile
shared zone has the identical latent gap, just rarer to hit in
practice).

**Verdict: APPROVED.** Minimal, generic (one shared code path, no
per-zone-type branch), consistent with D55/D56's Zone/Pile split.
Trin independently re-ran 358/358 + lint (baseline unchanged) and
reviewed the diff for regressions (gutter is inert to every existing
`.pile-section`/`[data-card-id]` lookup). No blockers.

### Next Steps
None pending from this fix - loop complete. D57 Smith UX-gate item
above is unrelated/still open from Sprint 23.

---
## *impl: consolidated ScoreZone review (2026-08-27) - APPROVED

Direct user request ("save space"): one ScoreZone panel listing every
seated player (name, typed-entry input, -10/-1/+1/+10), replacing the
one-panel-per-player design from earlier this same session.

**Decision (posted to chat)**: `ScoreZoneElement`'s old attribute API
(`score`/`adjustable`/`label`, one instance per player) is fully
replaced with `.render(players, options)`, not kept as a compat shim -
a list of players doesn't fit a per-instance-attribute model, and this
codebase doesn't keep old interfaces around "just in case." Matches
`<zone-panel>`'s existing `.render(...)` shape - one method-call
convention across panel types, not two.

**Real catches, not just claims**: Neo found and fixed a CSS
specificity bug live (a naive `score-zone:not(.panel-moved) {
flex-basis: 100% }` silently did nothing - `#zones > .zone:not(.seat-
zone)`'s `flex: 1 1 auto` has an ID selector and won the tie; fixed by
matching specificity with `#zones > score-zone.zone:not(.panel-
moved)`) and a real data-loss bug (clearing the score input committed
`0` instead of reverting - `Number('') === 0` is a valid safe integer,
so the guard never caught it). Both found via live Playwright
verification, not assumed from reading the diff - good discipline,
consistent with this session's own zone-drop-gutter fix earlier.

**Side effect, disclosed not claimed as the goal**: consolidating to
one panel removed 2 of the 5 pre-existing `lint:design` violations
("Table Zone overlaps Score-+") as a natural consequence of there
being fewer, differently-shaped panels - not something this task set
out to fix, correctly not over-claimed as "fixed the overlap backlog
item" (the remaining 3 Table-Zone/Bob overlaps are untouched, separate,
pre-existing debt).

**Verdict: APPROVED.** No architecture concerns. Real interaction
model change (typed input, new button layout) - Smith's UX gate
applies, not skippable as internal-only.

### Next Steps
@Smith: `*user test` the consolidated ScoreZone against the real
running app - typed entry, all four adjust buttons, cross-player
adjustment (anyone may adjust anyone), multi-seat layout at a packed
width.
