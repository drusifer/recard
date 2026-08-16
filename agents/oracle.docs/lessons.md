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
