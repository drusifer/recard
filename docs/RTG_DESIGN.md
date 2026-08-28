# Recard the Gathering — Design Brief

A fictitious Magic-the-Gathering-like game used as a **capability exercise**
for recard's Pile/Zone/Deck/Action framework. The point is to push the model
into new territory (rich card faces, permanent-based zones, per-card state)
**without** changing the table simulation itself.

## Framing decision: table simulator, not a rules engine

**Decided (user, 2026-08-28): the engine models the TABLE, players enforce
the RULES.** Same posture every existing preset already takes — the Solitaire
preset says outright it is "not a full solitaire engine."

| The engine models | The players enforce |
|---|---|
| Zones, piles, card movement | Paying mana costs |
| Tap / untap (`rotate`) | The stack and priority |
| Life totals (`ScoreZone`) | Combat damage assignment |
| Draw / mill / exile / search | Timing restrictions |

Rejected: a mana-pool + phase tracker (more state, still no stack), and a full
rules engine (needs an ability-scripting language + interpreter — a different
product, multi-sprint, and it *would* fundamentally change the table sim).

## Framing decision: offline content pipeline, no in-app deck building

**Decided (user, 2026-08-28): recard gets no interactive deck builder.**
Card content is authored as YAML, compiled by a build step, and consumed by
recard as static data.

```
content/rtg/**.yaml         authored card + deck data (source of truth)
   │  make cards            validate schema, compile
   ▼
src/decks/rtg/catalog.js    committed ES module, imported by the app AND every tool
   │  make art-gen          paint each card's `art:` prompt (codex)
   ▼
build/rtg-art-raw/*.png     full-size masters — gitignored, NOT shipped
   │  make art              downscale, aspect preserved
   ▼
assets/cards/rtg/*.webp     committed card art, ~50 KB each
```

Masters stay out of the repo: 132 full-size PNGs would add ~230 MB for
images that render 70px wide. Re-packing them is cheap; regenerating is
not, which is why the two steps are separate targets.

Generation runs through **`tools/imagegen`**, a general tool that takes
any manifest of id/prompt pairs — not a Recard-specific script. It is
resumable (art generation is quota-limited, and re-running is the
recovery procedure) and treats quota exhaustion as terminal rather than
retrying it.

### The `art:` field

Every card carries an `art:` string written as a **good image-generation
prompt** (subject, composition, palette, medium).

This field earned itself twice. The first cut shipped a procedural SVG
generator that drew heraldic art from each card's attributes; that was then
replaced by real generated illustration via the `agy` CLI, and again by
Codex's `image_gen` when `agy`'s quota proved far too small for a 132-card
set. **Neither swap changed a single card.** The prompt is the interface to
whatever generator comes next, which is exactly what it was written to be.

## Balance is a lint check, not an opinion

The single most important design call. "Balanced decks" is otherwise a matter
of taste and unverifiable; this project's own retros warn against asserting
rather than measuring (`lint:design` exists for exactly this reason).

`make lint-decks` fails the build unless every deck satisfies:

| Invariant | Rule |
|---|---|
| Deck size | exactly 60 cards |
| Copy limit | ≤ 4 of any nonland card |
| Land ratio | aggro 20–23, midrange 24–25, control 25–27 |
| Mana curve | left-skewed bell; ≥ 40% of spells at CMC ≤ 2, ≤ 15% at CMC ≥ 5 |
| Color identity | every card's colors ⊆ its deck's colors |
| Dual-color sources | ≥ 15 sources of each color in a 2-color deck |

Sourced from standard constructed guidance: ~40% lands (24 in a 60-card deck),
aggro ~20–23 / midrange ~24–25 / control ~26–27, and a bell curve skewed left.

## Deck lineup — 15 decks

5 mono (W/U/B/R/G) + all 10 guild pairs. Because real decks run 4-ofs, a
60-card deck is only ~12 *unique* nonland cards, so 15 decks ≈ **135 unique
card designs**, not 900.

| | Decks | Unique designs |
|---|---|---|
| Mono | 5 | ~60 (12 each) |
| Guilds | 10 | ~60 gold (6 each, reusing mono pools) |
| Lands | — | ~15 (5 basic + 10 dual) |

## Framework extension points used

Everything below is "one new module + one new registry entry" — no change to
the table simulation.

| Need | Mechanism | New? |
|---|---|---|
| MTG card data | `DECK_TYPES.rtg` | new module |
| MTG card face | **new** `CARD_FACES` registry | new registry |
| Battlefield / Exile / Stack | `PILE_TYPES` entries | new modules |
| The preset | `PRESETS` entry + `piles` + `layout` | data only |
| Tapping | `rotate` action | **already exists** |
| Life totals | `ScoreZone`, `SET_SCORE`/`ADJUST_SCORE` | **already exists** |
| Library / Hand / Graveyard | `DeckPile` / `HandPile` / `DiscardPile` | **already exists** |

### The one real architectural problem

`cardElement` (`src/ui.js:12`) hardcodes `rank`/`suit`/`JOKER`. An MTG card
face needs name, mana cost, type line, art, rules text, and P/T. Branching on
card shape inside `cardElement` is exactly what would rot the table sim.

**Approach: a `CARD_FACES` registry**, dispatched on `card.face` (defaulting
to `'standard'`), mirroring `PILE_TYPES`/`ZONE_TYPES`/`DECK_TYPES`/`ACTIONS`.
`cardElement` becomes a thin dispatcher; the existing rank/suit rendering
moves to `StandardCardFace` unchanged.

## User stories

- **US-75** — Card content schema + YAML→catalog compiler
- **US-76** — Deck balance linter (`make lint-decks`)
- **US-77** — Mono-color card pools + 5 balanced mono decks
- **US-78** — Guild gold cards, dual lands + 10 balanced guild decks
- **US-79** — Card-art generation pipeline (`tools/imagegen`)
- **US-80** — `CARD_FACES` registry + RtG card face + inspect overlay
- **US-81** — `rtg` deck type
- **US-82** — Battlefield / Exile / Stack pile kinds
- **US-83** — "Recard the Gathering" preset with MTG zones for 2 players
