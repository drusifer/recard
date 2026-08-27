# Agent State

## Context
### Recent Decisions
- Gate 1 (sprint stories review) for Recard: **Approved with notes**.
  Stories US-1..11 are testable, user-centered, and consistent. Added two
  AC amendments myself (connection/status visibility, Nielsen #1) since
  P2P has no server to paper over a silent connection failure:
  - US-1: host sees live roster + per-player connection state.
  - US-2: joining player sees explicit "connecting..." state.

### Key Findings
- No other HCI red flags in v1 scope. Privacy model (hand contents never
  sent to other clients, not just hidden in UI) is a strong AC — keep an
  eye that Morpheus's architecture actually honors this at the data layer,
  not just the UI layer.

### Important Notes
- Will need to actually run the app once Neo has something working (per
  "never approve based on spec alone") — mid-phase `*user test` and the
  Gate 2 architecture review, then full `*user test` at sprint close.

## Sprint 23 ("pile-level actions, generalized") — Gate 1, 2026-08-25

*user review US-60..63: APPROVED with 5 resolutions written directly
into the AC (docs/USER_STORIES.md), not left as open questions for
Morpheus to guess at:
1. US-60 split rounding: original pile keeps the extra card (matches
   shipped `SPLIT_DECK` precedent).
2. US-61 take-pile confirm: `destructive: true` unconditionally, no
   size threshold - a sometimes-confirms affordance is worse than a
   consistent one; exception for a 1-card pile (identical to a plain
   `pickup`, which never confirms).
3. US-62 naming: `hide`/`show`, not `reveal`/`conceal` - `reveal` is
   already the per-card action's label, reusing it for a pile-wide
   action was a real collision risk.
4. US-62 authorization: host-only (shared pile) / owner-only (personal
   pile) - matches `deal`/`sortRank`'s existing split, not `move`/
   `rotate`'s open-to-all (flipping a whole pile's visibility is
   shared-knowledge-changing, closer to `reshuffleDeal`'s weight).
5. US-63 eligibility: `zone`/`discard` only, PLUS explicitly excluding
   `deck` too (not just hand/foundation/cascade/rankAdjacent as
   Cypher's draft had it) - `state.js` finds the deck by fixed identity,
   not search; relocating it would silently break that. Merge-vs-
   sibling: sibling, confirmed.

No blockers. @Morpheus *lead arch sprint 23

## Gate 2, D55 (2026-08-25)

*user feedback D55: APPROVED with 2 UX notes, neither blocking:
1. `groupId` drag needs the SAME drop-target highlight affordance a
   card drag already gets (`.zone-drag-over`) when hovering a target
   Zone's box during a title-bar drag — otherwise a player has no
   feedback about where the pile will land before releasing. Matches
   existing precedent, not a new interaction language.
2. Ungrouping (dragging a grouped pile's title back out to open table)
   should be an explicit, equally-visible drop target (e.g. an empty
   area of `#zones`), not just "the only way out is into another
   group" — a pile that joined a group by mistake needs an equally
   easy way back out.
Both are UI-layer details for whoever implements US-63, not new open
architecture questions - approving D55's shape as-is. @Mouse *sm plan sprint 23

## Current Task
**Status:** Gate 1 complete, watching for Gate 2 (post-architecture)
**Assigned to:** Smith
**Started:** 2026-08-15

### Task Description
Sprint review gates for the Recard P2P card game sprint.

### Progress — v1.3 ("top-down table redesign")
- [x] Gate 2: **Approved.** D19's privacy proof (cardId iff faceUp===true
      at drag-start) is airtight given the existing MOVE_CARD
      authorization rule - checked the logic myself rather than taking it
      on faith, and it holds: nothing draggable at all can be visible to
      a receiver but not the dragger. One non-blocking note for Neo/Trin:
      cursor's existing throttle rate is a reasonable starting point, but
      a larger card-sized ghost may read as choppier than a small cursor
      dot at the same update rate - verify visually during Phase Bloop
      and adjust the rate only if it actually looks bad, not
      preemptively.
- [x] Gate 1: **Approved with 4 substantive amendments** to
      docs/USER_STORIES.md v1.3 backlog (US-26..30): explicit "You" seat
      marker + 8-player density check (US-26), drop-target hover
      highlighting (US-28, Nielsen #1 - drag has no affordance without
      it), the anonymized-card-back broadcast must follow the exact same
      zone-not-slot privacy granularity already set for cursor (US-29 -
      this is a new channel carrying an actual card silhouette, deserves
      its own explicit restatement not just inherited by association),
      and fanned hand cards must stay individually identifiable, not just
      individually tappable (US-30). This sprint carries real density AND
      privacy risk simultaneously (a first for this project) - will watch
      both closely at close-out.

### Progress
- [x] Gate 2: approved docs/ARCHITECTURE.md, conditional on explicit
      "Host disconnected - session ended" message (added as D6 condition)
- [x] Sprint-close `*user test`: ran full flow via Playwright screenshots
      (real app, not spec). Found 3 bugs, full report in
      agents/smith.docs/uat-report-sprint1.md. Filed to Trin for triage.
- [x] Re-test after fixes: PASS. Re-screenshotted host-share (short code
      `9KTJ57`-style, form gone) and session-ended (disabled controls,
      consistent 'disconnected' roster). Report closed. Approved for retro.
- [x] `*judge tool and skill usage`: scored TES 98/100 (see
      agents/smith.docs/trace_eval_usage.md) - 2 genuine redundant-call
      deductions, 1 AP-MAKE-PIPE, +10 bonus for real e2e/architecture
      wins. Cataloged BUG-001 (agents/smith.docs/bugs.md): judge/
      bob-protocol skill docs claim `make judge-trace` is wired via a
      Makefile target; checked 6 projects total, none actually have that
      target. Routed to Bob (doc/skill fix, not a code bug).
- [x] Sprint 2 (v1.1 backlog, US-12..18) Gate 1: **Approved with
      substantial UX requirements added** to docs/USER_STORIES.md:
      - Per-story AC: error-prevention on non-revealable private cards
        (US-13), don't punish the common one-tap-play path for the rare
        face-down case (US-12), resolved the score-edit-permission open
        call as "everyone can adjust everyone's" (US-16).
      - New cross-cutting "Smith UX requirements" block covering all of
        US-12/13/14: ownership must stay visible on public middle cards,
        revealing a *private* card needs a confirm step (irreversible,
        gives away info) while revealing a *shared* card doesn't (normal
        flow), reuse existing tap/drag patterns rather than inventing new
        gestures, zero-signal anonymity for face-down cards (no timing/
        layout leaks).
      - US-15: preset selection must show what it actually configures
        before commit (recognition, not recall).
      - US-18: consistent format across rules-reference entries, and
        opening the reference must not lose table state (same bug class
        as the sprint-1 session-ended-but-controls-still-live bug).

### Blockers
None

### Oracle Consultations
None yet

- [x] Sprint 3 ("zones, presence, hand tools") Stage-3 end-to-end test:
      ran the real app, two 390px mobile clients, deliberately built a
      dense scene (3 zones, 5 middle cards across all 3 visibility
      states, a full 7-card hand, pass marker, live cursor) since this
      sprint's own Gate 1/2 flagged density risk. **1 bug found**: a
      player's hand count renders twice - once as roster text `(N
      cards)`, again as the mini-hand fan's own count badge - squished
      together with zero spacing since `.mini-hand` has no left margin
      and is appended with no separator. Reproduced on both clients, with
      both a long name and a short one, base case not an edge case. Full
      report: `agents/smith.docs/uat-report-sprint3.md`. Everything else
      (zones, middle-zone density, move-to, pass propagation, hand sort
      at full density, cursor labeling/self-exclusion, deck visual) tested
      clean. Filed to Trin for triage.

- [x] Re-tested the mini-hand fix with the exact original repro
      scenario: clean now, count shown once, real spacing. Report closed,
      approved for retro. `agents/smith.docs/uat-report-sprint3.md`.

- [x] Sprint 3: fully closed out (implementation + bug-fix + re-test + retro).

### Progress — v1.3 ("top-down table redesign") Stage-3 close-out test
- [x] Ran the real app at 390px and 1280px, host+guest over real WebRTC.
      **2 findings**: (1) draggable cards give zero cursor affordance
      (`cursor: auto`, no `grab`/`grabbing`) on a mouse-driven client -
      real discoverability gap for this sprint's headline drag feature,
      medium severity, small contained fix. (2) re-confirmed the
      5+-player mobile density finding Neo/Trin already measured -
      independently verified their numbers hold, high severity (hits the
      CORE redesign at an ordinary group size, not an edge case), but
      recommending against a rushed Phase 27 fix since the team already
      correctly identified this needs a real compact-seat design pass -
      escalating to Cypher's backlog for proper scoping instead of
      squeezing a second "improved not resolved" attempt into this
      sprint's closing hours. Full report:
      `agents/smith.docs/uat-report-sprint4.md`. Everything else
      (personal zones, drag mechanics once discovered, drag-broadcast
      privacy, You marker, hand fan) tested clean.

### Blockers
None

### Oracle Consultations
None yet

## Next Steps
### Immediate Next Action
Handed to Trin to triage finding #1 (cursor affordance, recommend
Phase 27). Finding #2 (density) recommended for Cypher's backlog, not a
close-out fix phase.

- [x] Re-tested finding #1 with the exact original repro: both cursor
      checks now report `grab`. Report closed, approved for retro.
      Finding #2 intentionally left open in the report, tracked in
      Cypher's backlog per the agreed disposition (not a close-out item).

### Waiting On
Nothing.

### Planned Work
- [ ] Next sprint's Gate 1, whenever Cypher opens one - including
      whatever sprint eventually picks up the density backlog item.

---

## Sprint 5 ("desktop table width") — Gate 1

### Recent Decisions
- Gate 1 for US-31: **Approved with amendments**. Verified against the
  actual stylesheet before approving (not just the story text): `.screen`
  (host/join forms) is correctly narrow at 480px and confirmed out of
  scope; `#screen-game`'s 760px cap is real and has zero desktop
  breakpoint above it. This is a legitimate follow-on to my own prior
  Sprint-2-era finding that set the 760px value in the first place
  (comment in style.css cites it directly) — 760px was right relative to
  a 480px phone baseline but was never re-checked against real
  laptop/desktop widths, which is exactly this user report.
- Added 3 amendments directly in docs/USER_STORIES.md under US-31:
  1. Host/join screens explicitly out of scope — don't let Neo drift
     into widening forms that don't benefit from it.
  2. Named the prior-finding lineage so this doesn't read as
     contradicting a past decision.
  3. For Trin's later UAT: test concrete checkpoints (1024px, 1440px) in
     addition to the phone/ultra-wide extremes, so a mid-range reflow bug
     can't hide between two passing edge checks.
- Deliberately did NOT prescribe the exact new max-width/breakpoint
  values — left that to Morpheus's Gate 2 sizing call, consistent with
  how Cypher scoped the story.

### Blockers
None.

## Next Steps
### Immediate Next Action
Approved and handed to Morpheus for architecture (Gate 2 to follow once
Morpheus proposes concrete breakpoint/width values).

### Waiting On
@Morpheus: architecture + concrete sizing values, then back to me for
Gate 2.

---

## Sprint 5 ("desktop table width") — Gate 2

### Recent Decisions
- Gate 2 for D20: **Approved**. All 3 of my Gate 1 amendments are
  actually reflected in the decision, not just acknowledged: host/join
  forms confirmed untouched, and the 1024px/1440px checkpoints I asked
  Trin to test aren't just floating targets in a range - Morpheus made
  them the literal breakpoint values, so UAT will test right at the
  transition, which is the stronger check.
- No breaking change, no new flag/naming surface (not applicable here -
  no CLI), no worse path for any existing user. Confirmed geometry is
  pure CSS percentage (`seatPosition()` returns %, not px) so a user
  dragging their actual OS window width live across a breakpoint
  reflows continuously with no JS re-render step involved - added as an
  explicit Trin UAT check below since "does it look right at 5 fixed
  widths" and "does it look right while continuously resizing" are not
  the same test, and only the first was in the story's AC.
- One non-blocking observation, NOT a Gate 2 objection: widening the
  container alone grows *spacing*, not the mobile-sized type/padding
  scale (rem values are unchanged) - desktop users get more breathing
  room but the UI will still visually read as "mobile UI in a bigger
  box," not a bespoke desktop density. That's exactly what the user
  asked for ("more room"), not a redesign, so approving as scoped -
  logging as a possible future backlog item, not blocking this sprint
  over it.

### Blockers
None.

## Next Steps
### Immediate Next Action
Approved, handed to Mouse for phase planning.

### Waiting On
Nothing from me until Trin's UAT.

### Planned Work
- [ ] When Trin runs UAT: test the 4 named widths (phone, 1024, 1440,
      1920) AND one continuous drag-resize across both breakpoints, not
      just the 4 fixed snapshots.
- [ ] Backlog note (non-blocking): desktop-specific type/density scaling
      is a separate future item from "more room," if the user wants it
      later.

---

## Sprint 5 — Stage 3 close-out (`*user test`)

### Recent Decisions
- **Actually ran the app** (`npm run dev` + a real Playwright-driven
  Chromium, not a re-read of Neo/Trin's assertions): hosted a 2-player
  table, dealt 7 cards each, screenshotted the live game screen at
  760px/1024px/1300px/1920px, plus the host form at 1920px.
- **Visually confirmed real, positive wins**: at 760px the 7th hand card
  was cut off (needs a scroll); at 1024px/1300px all 7 fit with room to
  spare - the width increase visibly helps the one thing most players
  will actually notice (their own hand), not just the table geometry.
  At 1920px the table stays visually capped, not stretched thin -
  matches Cypher's AC and the screenshot at 1300px is nearly identical
  in absolute size, confirming the deliberate bound actually holds
  visually, not just in an assertion.
- **Confirmed my own Gate 1 amendment held**: host form screenshotted at
  1920px stays narrow/centered exactly like at any other width - not
  just claimed in the story, genuinely unaffected.
- **Independently re-confirmed Trin's disclosed finding** (2-player
  seats stay vertically stacked, pot/seat cards don't visually move
  outward even though the surface behind them widens) by eye, matching
  her measurement exactly - not a surprise, not a new bug, already
  correctly scoped as non-blocking and out of this story's reach.
- No new UX issues found. No `*user bug` filed.

### Blockers
None.

## Next Steps
### Immediate Next Action
**`*user approve`** — Sprint 5 fully passes end-to-end user testing.
Handing to `*sprint retro`.

### Waiting On
Nothing.

### Planned Work
- [ ] Sprint retro, then Cypher launch.

---

## Sprint 6 ("snap-to stack/overlap" + deck operations) — Gate 1

### Recent Decisions
- Gate 1 for US-32/33: **Approved with 2 amendments**, written directly
  into `docs/USER_STORIES.md`: (1) proposed the concrete drop-region
  mechanism myself (on-card body = stack, beside-card halo = overlap,
  reusing the existing `.zone-drag-over` highlight pattern rather than
  a new visual language) since Cypher explicitly left that to me; (2)
  corrected scope on touch/mobile after checking the actual code —
  native HTML5 drag-and-drop never fires from touch gestures in this
  app (confirmed via grep, no touch/pointer DnD polyfill exists
  anywhere), so this was already a desktop/mouse-only gesture family
  before this sprint, not something US-32/33 regresses.
- Gate 1 for US-34/35/36 (added mid-sprint): **Approved with 4
  amendments**. Most consequential: **reversed US-34's own premise**
  after checking the real layout — moving `Draw` away from `#hand-area`
  would trade a real per-turn cost (the highest-frequency action in the
  app, moved away from where its effect lands) for a one-time
  discoverability nicety. Revised US-34 to leave `Draw` alone and only
  place the genuinely new Split/Shuffle controls near the deck. Also:
  no confirm dialog on Shuffle (checked - even destructive Reset has
  none today, so a non-destructive action shouldn't have more friction
  than it), reuse the existing `deal-more-count` number-input pattern
  for pile count instead of a JS prompt, and cap+guard pile count since
  zones are permanently non-deletable (D17) so a fat-fingered large
  split has real, permanent clutter cost.

### Blockers
None.

## Next Steps
### Immediate Next Action
Full US-32..36 set approved. Handing to Morpheus for architecture.

### Waiting On
Nothing.

### Progress — Gate 2
- [x] Reviewed D21/D22 against my own Gate 1 mechanism proposal - the
      on-card/beside-card drop-region split and the highlight-reuse
      pattern both carried through faithfully.
- [x] **Found and corrected a real behavioral bug in D21's draft**, not
      just a UX nit: the doc assumed the *dropped* card always receives
      the new `layout` field, but for a before-side overlap drop
      (insert X before target T), it's actually `T` that becomes
      "second in the pair" per D21's own field semantic - so `T`, not
      `X`, needs the write, or the wrong pair visually overlaps.
      Corrected to one direction-agnostic rule ("layout always belongs
      to whichever card ends up second in the newly-adjacent pair,
      computed after insertion") that covers all three drop regions
      with no special-cased branching - simpler than the two-case
      framing I was about to write up.
- [x] D22 (Shuffle/Split): matches my Gate 1 amendments exactly - host-
      only, capped pile-count input, no confirm dialog. Confirmed Split
      doesn't need a confirm gate either: it's additive (creates zones,
      loses nothing), not destructive like Reset Scores, so the
      cap+guard mitigation is the right level of friction, not a modal.

### Blockers
None.

- [x] **D23 added mid-Gate-2** (user-directed): unified `Pile` storage
      model (deck/hands/zones -> one `state.piles`). Reviewed for UX
      impact specifically: `viewFor`'s output shape is explicitly
      unchanged (same `myHand`/`otherHandCounts`/`zones`/`deckCount`
      fields, same two redaction behaviors preserved) - this is an
      internal storage refactor with **zero observable behavior
      change**, so there's nothing new for a UX gate to approve/reject
      on its own merits; approving on the basis that the "no observable
      change" guarantee is real and explicit in the doc, not just
      assumed. Sequencing (refactor phase before feature phases) is the
      right call - lower risk than migrating mid-feature.

## Next Steps
### Immediate Next Action
Approved (D21/D22/D23 - full sprint architecture), handing to Mouse for
phase planning.

### Waiting On
Nothing.

---
*Last updated: 2026-08-16 (Sprint 6 Gate 2, incl. D23)*

## Shutdown prep catch-up (2026-08-22)

Many gates ran since - notably Sprint 12's US-46 Gate 1 (the blocker that
kept Draw tap-shortcut-able, not drag-only - highest-frequency action in
the app) and Gate 2 (the STATIC-not-live `singleTarget` correction, D36).
Real UAT/user-testing passes (with actual screenshots, not just green
tests) caught genuine bugs at several sprint closes - a phone-tap-
interception bug and a missing popup backdrop at Sprint 12 close, and two
minor visual overlaps at the D52 (radial menu) close, still backlogged.

**One standing instruction worth knowing for future gates:** the D51/D52
table-unification + radial-menu redesign was built desktop-only by
explicit user direction ("DESKTOP ONLY FOR THIS - DONT TRY TO MAKE IT FIT
ON MOBILE") - a deliberate, stated override of this persona's usual touch-
parity concern, not an oversight to re-raise next time this area is
touched. Don't assume it generalizes to future work without checking.

Current state: branch `touch-targets-and-pile-actions-sprint`, commit
`44303e3`, clean, 260/260 unit tests green.

---
## Sprint 22 gates — 2026-08-24

Gate 1 (US-56..59): approved, 1 note - foundation pile's permanent lock
should render silent (no hover row), matching D45/US-54's established
hide-not-disable convention. Gate 2 (D53): approved, 1 ask - Solitaire/
Spit preset selection should visibly prefill the table on select, same
pattern existing presets already use for deck/deal fields. Both notes
folded into US-59's AC. Next engagement: Stage-3 close-out test once
implementation phases (task.md 62-67) finish.

---
## Sprint 22 close-out (2026-08-24)

Real screenshot pass (Solitaire preset, 1440x900): Pile/Zone API renders
correctly (11 zones, correct labels/kinds). 1 real finding backlogged,
not fixed - many-zone flat-list layout overflows/overlaps at 11 zones
(USER_STORIES.md). Out of scope for D53 (API, not layout). Sprint closed.

---
## Sprint 23 + D56 close-out test (2026-08-26)

Real live check (Playwright, 1440x900, real host session, not a mock):
created a table, dealt 5 cards, hovered the Table Zone's empty Table
pile - `pileActions.js`'s dispatch through the NEW class hierarchy
(D56) rendered live, correctly: "Split into piles"/"Take" buttons both
present with correct labels via real DOM query, not asserted from
source. Deck rendered as a real stack+count badge (`DeckPile.component
= 'deck-stack'`), hand as a real fan of 5 cards (`HandPile.component =
'fan-pile'`) - both class-driven render-shape dispatches confirmed
working in the actual browser, not just in unit tests. Zero
`pageerror`/`console.error` beyond one harmless 404 (favicon). Score
panel (`SCORE -/+  0`) rendered exactly as before - confirms the
decision to NOT wire `ScoreZone` into `state.zones` this pass left the
existing, working feature untouched, not silently broken.

One process note, not a defect: my hand-card `.click()` didn't
actually play the card into the table (Table showed `(0)`) - matches
`designLint.check.mjs`'s own comment that tap-to-play was retired in
favor of drag-and-drop; the click only worked because the design-lint
script uses it to trigger `:hover`, not to play. Didn't chase a real
drag simulation for this pass - the actual thing under test (does the
NEW class hierarchy render/dispatch correctly live) was already fully
answered by the empty Table pile's own Split/Take buttons rendering
correctly.

D56 itself: no new UX surface, nothing to approve/reject on usability
grounds - it's an internal refactor and the live check found it
behaves identically to before. Sprint 23's Phase 68-71 (Split/Take/
Hide/Show) already had its own Smith spot-check at Phase 70 (2026-08-25,
approved, one non-blocking icon-consistency nit still open, not
re-litigated here). Phase 72 (pile-title drag-drop) is not yet
implemented - nothing to test there.

**Verdict: APPROVED, no new bugs.** Handed to full-team retro.

## D57 UX test (2026-08-26) - piles/zones/cards all Movable

Live-tested the actual drag affordances, not just functional
correctness (already verified twice by Neo/Trin):

- **Real gap found+fixed on the spot**: a reparentable pile's title
  had NO cursor affordance at all (`cursor: auto`) despite being newly
  draggable - confirmed via `getComputedStyle`, not assumed. This is
  the exact gap this project already named for cards (Sprint 4
  close-out finding #1) - fixed the same way, same file, same pattern
  (`cursor: grab`/`:active { grabbing }`), verified live afterward
  (now reads `grab`; a non-reparentable pile's title correctly stays
  `auto`, unaffected).
- **Real gap filed, not fixed**: Phase 72's own AC called the "drop
  here to ungroup" open-background target "explicit, equally-visible"
  - it works (verified) but has zero visual cue during a drag.
  `#zones` is a full-bleed `position: absolute; inset: 0` container, so
  a naive highlight would run along the outer viewport edge rather
  than read as a distinct drop target - needs real design thought, not
  a guessed class toggle. Filed to `docs/USER_STORIES.md` backlog.

D57 itself: the mechanics work correctly and the one cheap, clearly-
scoped affordance gap is fixed; the harder visual-design gap is real
UX debt, disclosed rather than guessed at.

**Verdict: APPROVED with 1 fix applied, 1 filed.** 354/354 still green,
lint unchanged at baseline. Handed to full-team retro.

## Consolidated ScoreZone UX test (2026-08-27) - APPROVED

Direct user request ("save space"): one panel listing every player's
score, with typed entry + -10/-1/+1/+10 buttons, replacing one panel
per player.

Live-tested against the real running app (not a spec read):
- Screenshot at 1440px: row layout reads clearly - name left, controls
  right, consistent spacing, no visual clutter.
- Typed a large negative value (-999) - stayed fully readable in the
  3.2rem input, no clipping/truncation.
- Confirmed `type="number"` natively rejects non-numeric keystrokes
  (Playwright's own `.fill("abc")` on it threw, proving the browser
  refuses it) - real error prevention (Nielsen #5), not a manual
  validation gap.
- Checked this matches the app's EXISTING `type="number"` convention
  (`cards-per-player`, deal/split count) rather than introducing a
  new, inconsistent input pattern.
- Confirmed keyboard focus isn't suppressed on the new buttons (no
  `outline: none` anywhere touching them).

No usability gaps found. Nothing filed to backlog this time.

**Verdict: APPROVED, no new bugs.** *impl loop complete (Neo -> Trin ->
Morpheus -> Smith).

## Gate 1 — Save Layout/SaveAs/Remove Zone+Pile/changePileType (2026-08-27)

Reviewed Cypher's US-69..73 (USER_STORIES.md) against the 7 flagged
open questions. All 7 resolved as Cypher proposed (empty-only guards
on remove/changePileType, removal is live-session-only not persisted
into layout overrides, `preset.name` as override key, radial menu as
UI surface). Added 2 amendments before approving:
- Save/SaveAs need a visible success confirmation (Nielsen #1) - a
  silent localStorage write leaves the user guessing whether it
  worked.
- The empty-only block on remove/changePileType needs a real,
  specific error message (Nielsen #9), not a silently-disabled
  control.
- Resolved flagged Q7 ("reset to default" UI) as a "Reset Layout"
  control placed next to Save/SaveAs (Nielsen #3, User Control and
  Freedom).

Full amendment text written directly into USER_STORIES.md's new
"Smith Gate 1 review" subsection (not just this state file) since
Neo/Morpheus need it as part of the story, not a separate doc.

**Verdict: APPROVED WITH AMENDMENTS.** No rejection - scope/AC are
testable, match ordinary desktop Save/Save-As mental models.

## Gate 2 — Save Layout/SaveAs/Remove Zone+Pile/changePileType arch (2026-08-27)

Reviewed D61-D63 (`docs/ARCHITECTURE.md`). Gate 1's two amendments
(visible save confirmation, specific block-error messages) both
carried through explicitly into the design - confirmed, not dropped.

**One new UX gap found, not present in the story-level review**:
D61's "saved layout covers only stable-id panels, player-created
zones/piles excluded" is a real, silent scope limitation a user won't
guess (Nielsen #1/#2 - a user who dragged a custom zone into place,
hit Save, and later starts a new game will reasonably expect that
zone's position to come back too, since nothing at Save-time told them
otherwise). Same issue for "Reset Layout only affects future games,
not the live table" - not obvious from a button labeled "Reset."

**Condition for approval**: the Save/Reset Layout UI must disclose
both scope limits near the controls (a persistent caption, not a
per-click modal - avoids Nielsen #8 noise for something true every
time) - e.g. "Saves positions of built-in panels only; custom zones
aren't included" and "Applies to new games, not this table." This is
a UI-text requirement for Neo's implementing phase, not a new AC
document - Mouse should size it as part of the same task as the
Save/SaveAs/Reset controls themselves, not a separate follow-up.

**Verdict: APPROVED WITH 1 CONDITION** (disclosure captions above).
Everything else in D61-D63 - empty-only removal, zone/discard-only
changePileType, deck/hand/preset-zone exemptions - reads as
predictable, matches precedent (`RENAME_*`/`MOVE_PILE`), no further
concerns.

## End-to-end user test — Save Layout/Remove Zone+Pile/changePileType (2026-08-27)

Full pass on the actual delivered feature (task.md 79-84), independent
of Neo's own functional Playwright verification - probed learnability/
consistency, not just "does it run."

Confirmed working as designed:
- Disclosure captions render exactly as specified (Gate 2), persistent
  not per-click.
- Save/SaveAs/Reset all confirm via dialog naming the layout (Gate 1).
- Every icon-only action button (`remove` ✕, `changePileType` ⇋) gets
  a `title`/`aria-label` automatically from `ACTION_SPECS`'s own
  `applyIconButton` (ui.js) - Nielsen #6, recognition not recall,
  nothing new needed here, the existing mechanism already covers it.
- The live-caught Table-pile Remove-button fix: confirmed the Table
  pile's own row shows split/take/changePileType but not remove -
  exactly the "don't offer a button that always fails" standard this
  gate exists to enforce.

**One real, non-blocking finding**: SaveAs uses a native
`window.prompt()` for the name - the only text-ENTRY dialog in this
app; every other "ask for text" surface (rename) is inline
dblclick-to-edit on an existing label, which SaveAs has no equivalent
of (it's triggered from a button, not an existing label to edit in
place). `prompt()` is the same native-browser-dialog family this app
already commits to for `alert`/`confirm` (Nielsen #4 - not a NEW kind
of inconsistency, an extension of an existing one). Disclosed, not
blocking - filed to backlog as optional future polish (a real inline
name field) rather than reworked under sprint pressure.

**Verdict: APPROVED.** @all *sprint retro.

## Current Task
**Status:** Sprint-close testing complete. Moving to retro.

## Next Steps
Post Smith's own retro item (the `window.prompt()` finding, filed to
backlog) during `*sprint retro`.
