# Domain Model — Recard

**Owner:** Morpheus (Tech Lead)
**Status:** present-state description of the class hierarchies that
model what's on the table. For the history of how this hierarchy came
to be (there were several wrong turns along the way, each corrected
directly by the user — worth reading if extending this model), see
`docs/DECISIONS.md`, especially D56, D93, D107, and D129.
**Part of:** `docs/ARCHITECTURE.md`'s documentation set.

## The shape

```
containment:  Table -> Zone -> Pile -> Stack -> Pileable
class:        Pileable -> Stackable -> Card/Chip/Token
```

Two parallel hierarchies: one for the things sitting IN a pile
(`Pileable`/`Stackable`, `src/pileables/`), one for the containers
themselves (`Pile`/`Stack`, `src/piles/`, plus `Zone`, `src/zones/`).
Records stay plain data in `state.piles`/`state.zones` — they travel
over the wire and into `localStorage` on every state broadcast, and a
class instance there would have to survive a JSON round trip it has no
reason to make. A class hierarchy exists so a QUESTION about a record
("what actions does this pile offer?", "can this card be removed by
this viewer?") has one, polymorphic answer instead of a kind-string
switch — `pileableFor(record)`/`pileForKind(kind)` construct a live
instance over the record whenever a question needs asking.

**"THERE SHOULD BE NO CANONICAL PILES" (D93):** nothing in this codebase
assumes a singleton "the deck" or "the hand" — every action is scoped by
`pileId`, and any number of piles of any kind can exist on one table
(the Recard-the-Gathering preset alone declares over a dozen deck piles).

## Pileable → Stackable → Card/Chip/Token

`Pileable` (`src/pileables/Pileable.js`) is the behavior-free root for
"a thing that can be in a pile" — deliberately kept free of any real
behavior so future, genuinely free-form (non-stacked) pileables have
room to exist without inheriting stacking concerns they don't need.

`Stackable extends Pileable` (`src/pileables/Stackable.js`) is where
overlap/stacking behavior actually lives — `VERTICAL`/`HORIZONTAL`
direction, `offsetIn()` (a unitless stride-multiplier along whichever
axis the direction picks; the caller's CSS converts to pixels). `Card`/
`Chip`/`Token` (`CardPileable`/`ChipPileable`/`TokenPileable`) all
extend `Stackable`, not `Pileable` directly — a sibling `Stackable` was
rejected because a card would then need multiple inheritance (both a
`CardPileable` and a `Stackable`), which JS doesn't support.

A Pileable subclass declares **no instance fields**, only statics and
methods — `Pileable`'s base constructor is `Object.assign(this, record)`
over the record, and a class field initializer runs *after* `super()`
returns, so a field declaration silently clobbers whatever the record
actually held (found live: `stackId = undefined;` on `Stackable` wiped
every record's real value).

## Pile → Stack, and every derived Pile KIND

`Pile` (`src/piles/Pile.js`) is the concrete base class every pile kind
extends — `DeckPile`, `HandPile` (→ `PlayerHandPile`/`OpponentHandPile`),
`DiscardPile` (→ `ExilePile`), `MeldPile` (→ `RunPile` → `FoundationPile`,
`SetPile`), `RankAdjacentPile`, `CascadePile`, `GroupedPile` (→
`ChipPile`, `LandsPile`), `TokenPile`, `StackPile`. A subclass overrides
only what differs — visibility, which actions it offers
(`pileActions`), whether it accepts a given drop (`canAccept`), its
default spread/stack direction, its rendering component. Nothing else
branches on kind; `pileForKind(kind)` is the one place a kind string
resolves to a real class.

`Stack` (`src/piles/Stack.js`) is a real domain object for "some of this
pile's cards, overlapping along one shared direction" — introduced
(D129) to replace four independently-hand-written overlap formulas
(chip-tray columns, battlefield depth, the hand's fan curve, a same-
session pure-math module written and immediately deleted for "routing
around the missing domain object"). A pile can hold more than one Stack
at once (e.g. `LandsPile` groups by mana colour into side-by-side
columns) — `stacksOf(pile)` groups a pile's flat card list by each
card's own `stackId` (a foreign key on the Pileable, not a nested list —
one source of truth, no state where a card is in `cards` but missing
from a `stacks` list). Direction and spread live on the STACK, in
`pile.stacks[stackId]` metadata — never in the pile-wide fields older
code used to read.

Key `Pile` statics a subclass may override: `visibility` (mixed/hidden/
in-hand), `component` (which Web Component renders it — see
`docs/UI_ARCHITECTURE.md`), `stackDirection` (horizontal/vertical
default), `maxSpread`/`defaultSpread` (how tightly its stacks overlap by
default and at most), `reparentable` (can it move between zones),
`keepWhenEmptied`, `supportsStackTap`. Key methods: `pileActions(ctx)`
(which pile-level actions this kind offers), `disabledActions(count)`,
`canAccept(pile, card)` (drop eligibility), `redactCard`/`cardActions`
(per-card visibility and offered actions for a given viewer — though as
of D83/D84 these no longer actually restrict anything, since the Core
invariant is now fully permissive; they still shape which actions a
menu OFFERS, just not what's authorized).

## Zone → SharedZone/PerPlayerZone

A **Zone** (`src/zones/Zone.js`) is the box: position, size, a title bar,
and the fact that it CONTAINS piles — never card content itself. A
**Pile** never draws its own box or handles its own move/resize; that's
always its containing Zone's job. This split (D54/D55/D90 — "the word
'zone' never means 'pile' anywhere in this codebase again") replaced an
earlier model where Zone and Pile were conflated.

`SharedZone` (ownerless — the Table Zone, or any standalone zone a
preset declares) and `PerPlayerZone` (one per seated player, positioned
via `seating.js`'s ring geometry) are the two concrete zone types,
dispatched through a `ZONE_TYPES` registry (`src/zones/zoneTypes.js`)
the same way `PILE_TYPES` dispatches pile kinds. `GameConfig.zones`
declares Zone entities (`{id, name, type}`) independently of any pile;
`GameConfig.piles` declares pile placements (`{kind, ownerId, count,
zoneId, ...}`) that reference a Zone by id — a pile declaration with no
`zoneId` auto-registers its own standalone Zone (a 1:1 "this pile,
alone" relationship needs no separate declaration to be unambiguous).

## Card identity and conservation

Every physical card carries a globally-unique **instance id**
(`<printed-id>#<copy-index>`) and its **printed id** (`cardId`) — the
reducer keys on `card.id`, so multiple physical copies of the same
printed card never collapse into one movable object. Card conservation
(every card that exists before an action still exists after it, same
set of ids, RESET excepted as a legitimate new epoch) is an enforced
runtime invariant, checked by `assertCardsConserved` in tests, not just
assumed.

## What "no canonical piles" and the Core invariant mean together

Because there is no privileged pile and no per-viewer restriction (see
`docs/ARCHITECTURE.md`'s Core invariant), the domain model's whole job
is to answer "what does THIS pile kind offer, and where does THIS card
currently sit" — never "is this player allowed to see/move this." That
question was deliberately removed from the domain model (D83-D85), not
overlooked.
