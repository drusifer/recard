# Project Lessons Learned

This file contains critical lessons and rules derived from past errors, technical discoveries, and architectural decisions. All agents MUST review this file before starting new implementation or architectural tasks.

---

## 2026-08-15 — Sprint 1 ("v1 playable deck") lessons

- **`node --test tests/` (directory form) fails to discover files in this
  environment** — even with `"type": "module"` in package.json, it throws
  `Cannot find module '.../tests'`. Use the glob form instead:
  `node --test tests/*.test.js` (this is what `npm test` and `npm run
  test:e2e` do). Check this before assuming a test runner problem is a
  real bug in the code under test.

- **Don't hand-roll a correctness-critical algorithm you can't verify.**
  A QR code encoder needs Reed-Solomon ECC and mask scoring to be
  scannable at all — a plausible-looking implementation that's subtly
  wrong is worse than no feature, and there was no scanner/camera in this
  environment to confirm one worked. When you can't verify a from-scratch
  implementation of something with a precise correctness bar, either
  vendor a real library or descope — don't ship an unverified guess. See
  `docs/DECISIONS.md` "QR code image descoped to v1.1".

- **"Not automatable in this environment" is worth re-checking before you
  accept it.** `docs/ARCHITECTURE.md` originally assumed the full P2P/
  WebRTC flow couldn't be automated and planned on manual two-tab
  verification. It turned out Playwright + a real Chromium build (system
  install, via `executablePath` fallback since the Playwright-managed
  browser build wasn't downloaded/version-matched here) could drive two
  real browser contexts through an actual PeerJS connection with no
  mocking. This caught two real bugs that pure code review missed:
  1. `session.js` stored a connection's status string and (via reaching
     into PeerJS's internal `peer.connections` map) its send-path in a way
     that collided/was fragile — found on Morpheus's phase-3 code review,
     not by a human eyeballing it twice.
  2. `main.js` never captured a *joining* player's own PeerJS id, so a
     guest's own hand count silently showed as 0 in their own roster view
     — only surfaced once the e2e test actually rendered a guest's screen
     and asserted on real DOM content.
  Prefer "let's actually try automating this" over accepting a testing-
  strategy limitation at face value, especially for anything with an
  external network/protocol dependency.

- **Playwright's `page.close()` can abruptly kill the render process
  without firing the page's unload lifecycle**, which meant a first
  attempt at testing "host tab closes -> others see session-ended" timed
  out at 60s+ with no signal. Navigating away first
  (`page.goto('about:blank')`) before closing triggers a real unload,
  which is what actually happens when a user closes a tab/browser — and
  the session-ended signal then arrived in ~100ms. If a disconnect/
  cleanup test hangs, check whether the test harness itself is skipping
  the lifecycle event the app depends on, before concluding the app is
  slow to detect disconnects.

## 2026-08-15 — Sprint 2 ("clear backlog", v1.1) lessons

- **When a new privacy/visibility requirement shows up, check whether it
  generalizes an existing mechanism before designing a new one.** D7
  (middle-zone card visibility) reused the exact same per-viewer
  redaction rule D3 already used for hands (`viewFor()`), just applied to
  a second field (`owner`/`faceUp`) on a second zone. One redaction rule
  ended up covering all four visibility cases the user asked for. Look
  for "this is the same shape as X, generalized" before reaching for a
  new mechanism — it kept a 6-phase, 7-user-story sprint's actual code
  diff small.

- **Flag genuinely ambiguous requirements instead of picking an
  interpretation and hoping.** Cypher explicitly flagged "face-down
  hidden from everyone vs. hidden from others but visible to the owner"
  as an open product question rather than silently assuming one — the
  user's answer ("yes, there can be games that have held cards not
  revealed") confirmed *both* were wanted, which would have been a
  materially incomplete feature if only one had been built on
  assumption. The cost of asking was one flagged note in a doc; the cost
  of guessing wrong would have been a second implementation pass.

- **Self-checks and independent checks catch different bugs — do both.**
  Neo's own ad-hoc Playwright check (Phase 9) verified the reveal
  *accept* path worked. Trin's independent UAT pass specifically tested
  the *cancel* path Neo hadn't covered — dismissing the confirm dialog
  needed to leave a private card hidden, which is exactly the kind of
  gap a single author's self-check tends to miss (you test the path you
  built, not the path you didn't). Same pattern in Phase 10: Neo verified
  score buttons worked in a single browser; Trin verified a *guest*
  adjusting the *host's* own score actually propagates over the real P2P
  connection to both clients, not just locally.

- **When writing e2e assertions against an accumulating UI state, count
  from the actual current state, not from zero.** Two self-caught bugs in
  the Phase 11 e2e additions were both this: expecting `pickup-btn`
  count to be 1 after a reveal, when an earlier public play in the same
  test flow had already put one `pickup-btn` on the table, making the
  real expected count 2 (then 3 after the next reveal). A test that
  doesn't account for prior steps in the same flow will either false-fail
  immediately (loud, cheap to catch) or — worse — false-pass if the
  earlier state happens to satisfy a weaker assertion (quiet, expensive
  to catch later). Loud failures here saved real debugging time.

## 2026-08-15 — Sprint 3 ("zones, presence, hand tools") lessons

- **Native HTML5 drag-and-drop doesn't fire from Playwright's synthetic
  low-level mouse input in a headless environment with no display server
  (no `DISPLAY`/Xvfb).** `tests/e2e.smoke.mjs`'s US-11 motion assertion
  used `mouse.down()`/`mouse.move()`/`mouse.up()` and relied on Chromium
  to infer a native drag gesture from that sequence and fire `dragstart`
  - this worked wherever the suite was last verified, but deterministically
  timed out here. Confirmed it wasn't an app regression by reverting
  `main.js` to the exact pre-Phase-18 version and reproducing the same
  timeout on unmodified code. Fixed by dispatching real `DragEvent`s
  (`dragstart`/`dragend` with a `DataTransfer`) directly at the element
  instead of relying on the browser to *infer* drag intent from mouse
  input - still exercises the same app-level handlers, just skips the
  flaky browser-internal inference step. **If a browser-driven test
  depends on native drag-and-drop specifically (not just mouse/pointer
  events), verify a display server is available before trusting a
  timeout to mean the app is broken** - plain pointer events (used by the
  cursor/card-lift features, D13) fired correctly in the same environment
  with no issue; it's specifically HTML5 DnD arbitration that's the gap.

- **A test's own selector bug can silently rubber-stamp a false pass -
  verify your verification before trusting it.** While independently
  UAT-testing that "Sort by rank" actually produces ascending order,
  Trin's first check read `card.dataset.rank`, an attribute that doesn't
  exist on the card element (only `data-card-id` does) - every entry came
  back `undefined`, and a naive "is this array sorted" check over an
  array of identical `undefined` values trivially returns true. Caught by
  actually looking at the printed output before trusting the boolean,
  not just checking that the assertion "passed." Parsing rank out of the
  card id itself (`"5-spades-0"` -> `"5"`) gave real data and would have
  caught a real bug if one existed. The lesson generalizes past this one
  case: an independent check that produces a suspiciously uniform/trivial
  result is a prompt to inspect the check itself, not just the thing it's
  checking.

- **An assertion is only proven to have teeth if you can make it fail on
  purpose.** Before trusting the new `DEAL_MORE` e2e assertion ("existing
  hand cards must not be discarded"), Trin temporarily swapped the
  `DEAL_MORE` dispatch for a plain `DEAL` in `main.js` - reintroducing the
  exact hand-wiping bug the feature exists to prevent - confirmed the
  suite genuinely failed, then reverted and re-confirmed green. A
  regression test that has never actually been watched to fail is an
  unverified claim of coverage, not verified coverage.

- **Phase-tracking documents (`task.md` checkboxes/status lines) drift out
  of sync with `agents/CHAT.md`'s actual handoff history if nothing
  explicitly updates them per phase.** At the start of Phase 18 this
  sprint, `task.md` still said "Not started" for Phases 12-17 despite all
  of them being implemented, UAT-passed, and code-reviewed per CHAT.md -
  nobody's role in the loop (`*swe`/`*qa`/`*lead`) had "update task.md" as
  an explicit step, so it silently fell behind. Fixed by updating it
  alongside the phases actually completed this session, but worth noting
  for future sprints: CHAT.md is authoritative for *what happened*, but a
  stale task.md can mislead a cold-start resume into thinking less is
  done than actually is (or, worse, redoing already-shipped work) if
  someone trusts the checkboxes over the chat history.

## 2026-08-15 — Sprint 4 ("top-down table redesign") lessons

- **When a mid-draft user correction reopens a scoping decision, check
  whether it's actually returning to something already documented rather
  than inventing new scope.** The user corrected "animate on drop" to
  "true real-time drag broadcast" mid-draft - this wasn't a new ask, it
  was the PRD's original Principle 6 ("live, best-effort motion"), which
  D13 had deliberately scoped down for build-cost reasons the user was
  now explicitly declining. Recognizing this let the redesign extend
  D13's existing channel instead of treating it as new architecture -
  worth checking "have we already written this down and then backed off
  it" before assuming a correction means greenfield design.

- **"Unit tests form the base of the pyramid" is a standing principle to
  apply retroactively, not just going forward.** Given mid-sprint, it
  prompted pulling already-shipped, already-e2e-verified pure functions
  (`seatedOrder`/`seatPosition`) out of DOM-coupled files into a
  dedicated testable module (`seating.js`), after they'd already passed
  UAT via indirect DOM-position assertions. The lesson isn't just "write
  unit tests for new code" - it's noticing when existing code is pure
  but *trapped* in a file that can't be imported by a test (main.js has
  browser-only side effects at module scope), and extracting it once
  identified, not waiting for the next greenfield feature to apply the
  principle.

- **A screenshot read and an objective measurement can both be honestly
  reported yet differ in precision - prefer the measurement when the
  finding matters.** Neo's screenshot-based density check ("badly
  overlaps at 8, still cramped at 5") and Trin's `getBoundingClientRect()`
  overlap count (0 pairs through 4 players, exactly 1 at 5, climbing to 6
  at 8) told the same story, but only the second pinpoints the actual
  threshold precisely enough to say "starts at 5, not 4 or 6" with
  confidence - worth reaching for an objective measurement instead of a
  visual read whenever a finding is going into a design/backlog decision,
  not just a bug report.

- **Reporting "improved, not fully resolved" is more valuable than either
  overclaiming a fix or leaving a finding entirely unaddressed.** Faced
  with a real, confirmed density problem and a fix that helped but hit a
  genuine architectural floor (the 44px touch-target convention), the
  team applied the improvement, verified it precisely, and reported the
  honest residual rather than either (a) shipping a half-fix silently
  labeled "done," or (b) leaving the finding untouched waiting for a
  bigger redesign. This is the same discipline as Sprint 3's Phase 20
  pattern (give a real finding its own tracked scope) applied one step
  earlier - during implementation itself, not just at close-out.

---

## 2026-08-16 — Sprint 5 ("desktop table width") lessons

- **UAT means checking each AC bullet against actual test coverage, not
  just confirming the handed-off tests pass.** Neo's Phase 28 tests all
  passed, but Trin noticed one of US-31's own AC bullets ("extra width
  is used by content, not just padding") had zero assertion covering it
  - the 4 fixed-width checkpoints proved the CSS tiers were correct
  without proving the AC's actual behavioral claim. Passing tests are
  necessary but not sufficient for UAT sign-off; the gate is the AC
  list, not the diff. Adding the missing `.table-surface` width
  measurement then surfaced a real, previously-unnoticed finding (see
  D20 Consequences, `docs/DECISIONS.md`) that would have shipped
  unverified otherwise.
- **Fast-Track (single-phase) sprint planning, used for the first time
  this project, held up end-to-end.** Cypher's operational guideline for
  minor/CSS-only/tech-debt sprints had existed since Sprint 1 but never
  actually been exercised - every prior sprint ran 5-9 phases. Sprint 5
  (1 story, 1 phase, pure CSS) went through all the same gates (Cypher
  ->Smith->Morpheus->Smith->Mouse->Neo->Trin->Morpheus) with zero
  process friction and no phase-count padding for its own sake - the
  gate structure itself doesn't require multiple phases to function
  correctly, confirming the guideline wasn't just unused, it was
  correct.

---

## 2026-08-20 — Sprint 7 ("host-only save/restore") lessons

- **Check what the data is *keyed by* before promising to restore it.**
  US-37 looked like a storage story; the real problem was identity.
  Hands are keyed by a PeerJS id that guests regenerate on every join, so
  a restored hand belongs to nobody, and the obvious fallback -
  matching rejoining players by display name - is unsafe because names
  are neither unique nor verified. That wasn't hypothetical: a live
  Sprint 6 table had two players named "Drew". Reading `session.js`
  before writing the story is what turned a silent mis-assignment of
  hole cards into a stated scope decision.
- **Strip secrets at write time, not read time.** Dropping hands when
  the snapshot is *built* (rather than ignoring them when it's read)
  means the private data never lands on disk at all, so a shared browser
  profile can't leak it and no future code path can mis-assign it. The
  test asserts on the serialized JSON string rather than the parsed
  object, because the claim is about what's written.
- **State honestly what a security-flavoured claim does *not* cover.**
  "Nothing private is saved" was overstated: the snapshot keeps the
  deck's full remaining order, which breaks a game as thoroughly as
  seeing a hand. It's acceptable (host's own machine, already in memory
  there) - but Gate 2 caught that it was implicit, and implicit
  qualifications on a privacy claim are how those claims quietly become
  wrong.
- **A lint catches the mistake you just made, not the one you remember
  making.** Stylelint was added after two CSS structural bugs (an
  unclosed media query, a stray override) and caught a *third*
  duplicate-selector within minutes of being installed, while wiring an
  unrelated feature.

---

## 2026-08-20 — Sprint 9 ("touch parity") lessons

- **An API's platform assumptions are invisible in a passing test suite.**
  Native HTML5 drag-and-drop is mouse-only. Five e2e-verified interactions
  built over four sprints — drag-to-play, hand reorder, stack, overlap and
  the live drag ghost — did not exist at all on the PRD's *primary* device,
  and every one of them was green the whole time. Nothing in the code says
  "mouse"; you have to know that `dataTransfer` implies it. When a feature
  is verified only on the input device the developer happens to be using,
  "tested" and "works" are different claims.
- **A test written on the wrong input device would have passed anyway.**
  A mouse emits pointer events too, so a mouse-driven "touch" test exercises
  precisely the code path a finger fails. Smith made a `hasTouch` context an
  acceptance criterion for exactly this reason, and it was the right call:
  the test only has value because the input is real.
- **Extract the shared function *before* the second caller exists, not
  alongside it.** Phase 41 pulled the drop bodies out of the native
  listeners as a standalone phase whose entire proof was the existing green
  suite. Had it landed in the same change as its first touch caller, a
  behaviour change and a new feature would have been indistinguishable in
  the diff.
- **"The existing suite is the proof" is only true where the suite actually
  looks.** One of the two extracted functions (`performHandReorder`) had no
  coverage at all — the hand-order test exercises the sort *buttons*,
  despite a comment claiming it covered dragging. An untested function was
  one phase away from acquiring a second caller. Check what observes a
  behaviour before calling a refactor behaviour-preserving.
- **Adding a guard can create the path it was meant to close.** Refusing
  the lift on a detached element left the recogniser in `dragging` with no
  ghost, so the next move would dereference null. The guard and the
  consequence of the guard belong in the same change.
- **Two browser CSS mechanisms that look interchangeable are not.**
  `touch-action` is resolved when a touch *starts*, so setting it to `none`
  at lift time does nothing for the gesture in flight — and setting it up
  front would kill scrolling on every card permanently. Cancelling
  `touchmove` from a non-passive listener works mid-gesture. Likewise, a
  CSS animation on `transform` outranks an inline `transform`, so the drag
  ghost's follow-the-finger positioning had to be `transform` and its
  lift-pop `scale` — separate properties that compose instead of fight.
- **A third participant in an e2e is not a free addition.** Adding a third
  browser to get a touch client permanently reshaped the seat ring — a
  disconnected player is never removed from state — and broke the D24
  geometry assertions. Making the *existing* guest context `hasTouch`
  bought the same coverage at no cost to the rest of the file. It also
  surfaced a real defect on the way out: 3 players at 1024px overlap a seat
  zone with the pot, geometry that had only ever been measured at 2 seats.
- **Check the geometry before choosing the gesture.** The proposed
  "start a drag once the finger commits to an axis" rule was wrong here for
  a reason only the CSS could tell you: `#hand-area` scrolls horizontally
  *and* hand reorder is horizontal; playing a card is vertical *and*
  `#table-area` scrolls vertically. Neither axis was free. Reading the two
  `overflow` declarations settled a design argument that could otherwise
  have been decided by taste and discovered in production.
- **A stale README is a documentation defect, not a cosmetic one.** Groom
  found it still advertising "No reconnect" and "No persistence" two
  sprints after both shipped. The features were real; the only thing
  telling users they existed was wrong.

---

## 2026-08-20 — Sprint 10 ("deal on the deck; tables start themselves") lessons

- **"How do I do X?" from a user is a defect report.** The sprint began
  with the user asking how to re-deal. The answer was: click a red button
  named `Reshuffle & Reset` (which does not deal), then find a button
  named `Deal More (no reset)` in a row about zones. Nothing was broken;
  it was simply unfindable. Treating the question as a question would have
  produced an answer instead of a fix.
- **Moving a control somewhere discoverable changes its risk profile.**
  Smith's Gate 2 point generalizes: `Reshuffle & Reset` survived years
  without a confirm because nobody found it. Putting the same destructive
  power where people actually look made the missing confirm newly
  dangerous. "It was already like that" is not a defence when you have
  just made it reachable.
- **Two questions deserve two tables, even when one looks like a special
  case of the other.** Adding `deal` to D25's per-card action list would
  have offered an irreversible action on every card in the deck stack, in
  a *hover* row. Card actions answer "what can this card do"; pile actions
  answer "what can this pile do". Keeping them separate (D29) is also what
  made the empty-deck fix fall out of the structure rather than needing a
  special case.
- **A guard that is never true is worse than no guard**, because it reads
  as protection. `#host-share.hidden` never became true - `showScreen`
  hides the parent - so the auto-start once-only check was decorative. It
  looked correct in review and in the architecture doc.
- **A "ready" list is not a "reachable" list.** Auto-start counted seats,
  and dealt to a peer still `connecting`. The client never received the
  identity message and rejoined as a stranger, leaving a ghost seat
  holding everyone's cards. D27 had already learned this exact lesson for
  the identity announcement ("only once the connection is actually open")
  and the new code did not reuse the condition. When a codebase already
  waits for a state before doing something, ask whether the thing you are
  adding needs the same wait.
- **Assert on the payload, not the shape.** A roster length check would
  have passed the ghost-seat bug at 2 seats before the reconnect. The
  regression test asserts on the card counts and the disconnected marker,
  because the ghost and the live seat both look like the same player in a
  length check.
- **A control rebuilt on every broadcast silently eats input.** The deal
  count input is re-rendered whenever anyone does anything, so a number
  typed but not yet used was destroyed by an unrelated player's action.
  Any input inside a wholesale re-render needs its value lifted out.

---

## 2026-08-20 — Sprint 11 ("restart waits for the table") lessons

- **A decision expires when its premise does.** D26 stripped hands from
  the save for a good reason: guest ids were regenerated every join, so a
  restored hand belonged to nobody. D27 replaced that with a stable
  client-held key — and D26 was still being obeyed three sprints later,
  purely because nobody re-read *why* it existed. Following the letter of
  a decision after its reason is gone would have shipped "restore the
  game" that restores empty hands. Record the reason next to the rule so
  the expiry is visible.
- **Reverse a decision on the record, and invert its tests rather than
  deleting them.** D26 is marked superseded in place, and both the unit
  and e2e assertions that guaranteed "no hand ever reaches disk" were
  flipped to assert the opposite, with a comment saying why. A privacy
  property that changed direction should be visible in the suite, not
  quietly absent from it.
- **A comment can outlive its truth and take working code with it.**
  Restore wiped the saved roster with the comment "the saved roster
  refers to ids from the previous session". True pre-D27, false after —
  and wiping it made every returning key *unknown* to `resolvePlayer`, so
  restored hands were orphaned. The bug was invisible because the comment
  explained it.
- **The same class of bug reappears one step upstream.** Sprint 10 fixed
  auto-start dealing to a still-`connecting` peer by counting connected
  players. Sprint 11 found the *manual* Deal button had the same defect,
  because peers were seated while still connecting. Fixing the symptom in
  one caller left the source intact. When a fix is "count only settled
  things", ask whether the thing should have been in the list at all.
- **An await with no timeout turns a bounded retry into an infinite
  one.** `session.ready()` resolves when the data connection opens; when
  the host is simply gone, PeerJS opens the *peer* and the connection
  never opens, so the promise never settles either way. The retry budget
  could never be spent, and the loop stalled on attempt 1 forever. Any
  retry that awaits a third party needs a per-attempt timeout, not just a
  budget.
- **Erasing state at the moment of failure can be what makes recovery
  impossible.** `forgetSession` ran on host disconnect, dropping the code
  and name — exactly the two things needed to reconnect. It read as
  tidy-up and was the single reason auto-reconnect could not exist.
- **Size a timeout against the human in the loop, not the network.** The
  retry budget had to outlast a host arriving at a surprise reload,
  reading a confirm dialog and deciding — tens of seconds, not the
  hundreds of milliseconds network flakiness would suggest. It stays
  finite because a host who *declines* gets a new code, and clients would
  otherwise hammer a dead one.

## Sprint 22 (2026-08-24): Zone/Pile polymorphism, proven by Solitaire + Spit

- **Check for a concrete driver before a speculative refactor, even
  when directly asked for one.** The user asked to "complete the
  refactor to Zone/Pile APIs" - grepping first found no current caller
  needing D38's original separate Zone-type catalog; `ownerId`+
  `tableSide`+`kind` already covered every zone behavior in use, with
  zero config surface. Flagging that (rather than building the catalog
  speculatively) surfaced the REAL ask underneath the request: elevate
  `dropRule`'s hardcoded enum to real polymorphism, proven against two
  actual games (Solitaire, Spit), not the originally-pitched shape.
  The user's own follow-up name for this: "elevate coded behavior to
  the class."
- **"Top of the pile" is not one fixed convention across kinds.**
  `zonePile`/`cascadePile` append (last element = top); `deckPile`/
  `discardPile`/`rankAdjacentPile` prepend (first element = top, the
  STACK shape). A new pile type's `canAccept` must read whichever index
  its own `insertCard` treats as top - copying another type's index
  convention without checking is a real, easy-to-ship bug (caught in
  review before merge this sprint, not after).
- **Adding a field to a persisted config object breaks exact-shape
  assertions on purpose, not by accident.** `GameConfig.zones` (D53)
  made 3 existing `assert.deepEqual(state.gameConfig, {...})` tests fail
  - the fix was updating those 3 assertions to include the new field,
  not treating the failure as a regression to work around. When adding
  an additive field to `gameConfig`/`deckConfig`/any object multiple
  tests pin exactly, grep for those pins before writing the new field,
  not after the red run surprises you.
- **A relaxed invariant needs its reason written into the test itself,
  not just the commit.** `cardsPerPlayer >= 1` became `>= 0` because
  Solitaire/Spit genuinely deal to declared zones, not a hand - the test
  now says so inline, so a future reader sees WHY 0 is valid rather than
  wondering if the floor was carelessly dropped.
- **A checker's own selectors can silently rot when the DOM they target
  is renamed.** `designLint`'s overlap check kept reporting "clean"
  after a Web-Component rename because it queried removed ids and found
  zero zones to compare, not because the layout was actually fine. Any
  DOM-id-renaming pass should re-verify the checker's OWN selectors
  still match something real, not just trust a clean run - a
  false-positive-clean state is worse than a known-red one because
  nothing signals it needs attention. (D54 session, recurred twice.)
- **Iterative user corrections toward a smaller, sharper shape are not
  scope creep - each one is a real design correction worth taking at
  face value.** D54's Zone/Pile split went through five rounds of "not
  quite, actually X" before landing (own-zone cleanup -> Web Components
  -> "don't conflate Piles/Zones" -> "no nested zones, just piles in a
  zone" -> "Deck is a Pile, refactor don't rename"). Treating each
  correction as reopening the design rather than a nit to bolt onto the
  last cut is what got to the actually-right shape instead of a
  compromise between five half-right ones.
- **A geometric claim needs a geometric proof, not a screenshot read -
  even for something as visual as a card fan's curve.** Two rounds of
  "looks more triangular than curved" only resolved once Neo measured
  real per-card edge deltas and showed they strictly decreased toward
  center (the parabola signature) - the actual bug (linear droop, not
  quadratic) wasn't visible from eyeballing alone. Same standing lesson
  as the fan-clipping and density-measurement precedents, reapplied to
  a new shape of claim.
