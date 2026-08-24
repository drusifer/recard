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
