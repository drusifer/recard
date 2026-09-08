# Add: LandsPile - multiple colour columns side by side (2026-09-07)

Direct user request, after a design discussion: "I want to organize my
lands by color, each color stacked vertically, overlapped so it's easy
to count/tap/untap... Can we please just reuse cascadePile? does it
need to be extended further?" -> "no i think you still don't get it. I
need multiple cascades side by side. we can't do that with the
existing BattleFieldPile" -> confirmed: reuse `GroupedPile` (chips/
tokens' own "one stack per group, side by side" shape), not
`CascadePile` (Solitaire-specific: horizontal-only, hardcoded rank/
suit sequence rule, no reparenting, no tighten/loosen - reusing it
would mean overriding everything).

## What shipped

- **`derivedColors(card)`** (RtgCardFace.js) - extracted from the
  existing (private) `colorClasses` art-fallback logic: a card's real
  colour identity, falling back to whichever mana symbols its OWN text
  produces when `colors` is empty (every basic land's real case -
  `colors: []` always, per the catalog). Exported so `LandsPile` reads
  the exact same derivation the art panel already uses, not a second
  one that could drift.
- **`LandsPile extends GroupedPile`** (new file) - `sortValue` groups
  by `derivedColors(card)[0]` (first/primary colour), falling back to
  a real `'C'` (colourless) bucket rather than `undefined` so a
  colourless land still gets its own column. `pileActions` mirrors
  `BattlefieldPile`'s own reasoning (`untapAll`, `tighten`/`loosen`,
  `remove`, `changePileType`; no `take`/`split` - a set of distinct
  permanents, not a stack to scoop). Registered in `pileTypes.js` as
  `'lands'`; added to the RtG preset as a per-player pile alongside
  `battlefield` (players move lands there themselves - nothing routes
  a cast land there automatically, same fully-permissive drag-and-drop
  as everywhere else).
- **Per-column mana-count badge** (direct user follow-up: "have it
  display the total manacount in a cool way, when tapping"):
  `LandsPile.groupBadge(cards)` returns `{text, className, title}` -
  count of untapped (`orientation !== 'landscape'`) lands in that
  column, out of the total, styled with the SAME mana-pip colour class
  (`PIP_CLASS`) the cost line and cast picker already use. `<chip-tray>`
  (ChipTray.js) calls this per column IF the pile kind defines it -
  absent for chips/tokens (`GroupedPile`'s default), so they're
  unaffected. Derived fresh from the column's own cards every render -
  live, not a separately-tracked count that could drift from the real
  tapped/untapped state.

## The trade-off, disclosed up front and accepted

`GroupedPile.insertPileable` auto-sorts into the right colour column
and strips whatever `layout` a drop carried - a land always lands in
its colour's own column automatically, not wherever it was dropped.
The whole stack/column/overlap/adjacent placement geometry built
earlier this session doesn't apply here; "organize by colour" IS the
placement.

## Verification

- 6 new unit tests (`rtgPiles.test.js`): colour grouping (including the
  colourless-field-basic-land derivation and a multicolour card's
  first-colour rule), the real colourless bucket, `pileActions`
  offering/withholding the right things, `groupBadge`'s count/title,
  and registry membership. Mutation-checked the colour derivation
  (forced `sortValue` to ignore `derivedColors`, watched the badge-
  colour test fail).
- One existing test updated (`piles.test.js`'s exact-registry-size
  guard, fourteen -> fifteen kinds).
- Live-verified in a real browser: dropped 6 lands onto a fresh Lands
  pile, screenshotted the resulting single (all-white-deck) column
  with its "6" badge, tapped one card via the real rotate action, and
  confirmed the badge live-updated to "5" with the tapped card visibly
  landscape at the front.
- `bobp make test` (702, +6), `test-rtg` (12), `test-ui` (18),
  `test-hostsetup` (7), `test-newgame` (5), `check` (cards/lint-decks,
  15 decks still balanced), `lint` (baseline unchanged) - all green.

## Queued, not started

Direct user request: "*queue nit see if there are any other pile
types we can merge or get rid of" - a registry audit, not started.
