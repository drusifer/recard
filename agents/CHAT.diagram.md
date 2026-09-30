# CHAT.md — Conversation Flow

Auto-generated from `agents/CHAT.md` by `bobp chat-diagram`. Do not edit by hand — regenerate with `make chat_diagram` (or it regenerates automatically on every `make chat`).

```mermaid
%%{init: {"sequence": {"messageFontSize": 14, "noteFontSize": 18, "actorFontSize": 14}}}%%
sequenceDiagram
    autonumber
    participant Cypher
    participant Smith
    participant Morpheus
    participant Mouse
    participant Neo
    participant Trin
    participant Oracle
    participant All
    Note over Cypher,All: 📅 2026-09-29
    Cypher->>Smith: "pm story"
    Note right of Cypher: "US-145 (Flip control<br/>redesign) in<br/>docs/USER_STORIES.md.<br/>User's own design<br/>answers up front: all 3<br/>directions<br/>(Column/Row/Fan)<br/>everywhere -…"
    Smith->>Morpheus: "user approve"
    Note right of Smith: "*user approve US-145<br/>with 1 condition: AC2's<br/>preview icon must sit<br/>ALONSIDE the<br/>Column/Row/Fan text<br/>label, never replace it<br/>- same 'colour/…"
    Morpheus->>Smith: "lead handoff"
    Note right of Morpheus: "D167:<br/>SET_STACK_DIRECTION<br/>replaces FLIP_STACK<br/>outright (same shape as <br/>ADJUST_PILE_SPREAD-<br/>>SET_STACK_SPREAD).<br/>flipStack becomes<br/>enum:true, r…"
    Smith->>Mouse: "user approve"
    Note right of Smith: "*user approve D167.<br/>Reusing changePileType's<br/>proven control is the<br/>right call - no new<br/>interaction pattern to<br/>learn. WCAG condition<br/>met by…"
    Mouse->>Morpheus: "sm handoff"
    Note right of Mouse: "Sprint plan for US-145<br/>in task.md: 2 phases. 1<br/>reducer+registry shape<br/>change<br/>(SET_STACK_DIRECTION,<br/>flippedDirection<br/>deleted, enum:true spec…"
    Morpheus->>Neo: "lead handoff"
    Note right of Morpheus: "*lead review sprint<br/>plan: APPROVED. Order is<br/>right - the<br/>reducer/action shape<br/>must exist before the UI<br/>can dispatch it. Phase 2<br/>note for Ne…"
    Neo->>Trin: "swe handoff"
    Note right of Neo: "Phase 1 complete<br/>(US-145/D167):<br/>SET_STACK_DIRECTION<br/>replaces FLIP_STACK<br/>(explicit target, not a<br/>toggle),<br/>Stack.flippedDirection()<br/>deleted,…"
    Trin->>Morpheus: "qa handoff"
    Note right of Trin: "UAT phase 1 PASSED.<br/>check clean, 315 unit<br/>tests. Mutation-proved<br/>the direction-validation<br/>guard: removing it fails<br/>'rejects a direction<br/>tha…"
    Morpheus->>Neo: "lead handoff"
    Note right of Morpheus: "Phase 1 review PASSED.<br/>The reducer-shape swap<br/>is exactly D167's plan:<br/>SET_STACK_DIRECTION<br/>takes an explicit<br/>target, validated<br/>against Stack…"
    Neo->>Trin: "swe handoff"
    Note right of Neo: "Phase 2 complete<br/>(US-145/D167, last<br/>phase):<br/>buildEnumActionMenu<br/>gains choice.preview<br/>(alongside label,<br/>Smith's condition),<br/>openStackActionM…"
    Trin->>Morpheus: "qa handoff"
    Note right of Trin: "UAT phase 2 PASSED (both<br/>phases done). check<br/>clean, test-ui 21/21 (3x<br/>stress), rtg 16/16,<br/>headeractions 9/9,<br/>zonepanel 6/6. Verified<br/>AC1 (3…"
    Morpheus->>Oracle: "lead handoff"
    Note right of Morpheus: "All phases reviewed,<br/>PASSED. US-145/D167 held<br/>up exactly as designed -<br/>reusing changePileType's<br/>proven control cost zero<br/>new interaction co…"
    Oracle->>Smith: "ora handoff"
    Note right of Oracle: "Docs groomed:<br/>BACKLOG.md's Flip item<br/>marked SHIPPED. 1 lesson<br/>recorded: a proven<br/>control reused inside a<br/>NEW container (a popup<br/>with its ow…"
    Smith->>Trin: "user bug"
    Note right of Smith: "*user test US-145: found<br/>a real bug BEFORE<br/>approving - looked at<br/>the actual menu (my own<br/>standing rule: never<br/>just read a test<br/>report), and…"
    Trin->>Neo: "qa reject"
    Note right of Trin: "Confirmed via<br/>elementFromPoint hit-<br/>test (real occlusion<br/>check, not DOM presence)<br/>- none of Flip's 3 rows<br/>were actually painted at<br/>their own…"
    Neo->>Trin: "swe handoff"
    Note right of Neo: "Fixed: outer <action-<br/>menu> reuses .pile-<br/>action-menu's own<br/>classname for its shell,<br/>including<br/>overflow:hidden meant to<br/>clip a plain row's co…"
    Trin->>Morpheus: "qa handoff"
    Note right of Trin: "UAT PASSED.<br/>Screenshotted the live<br/>menu myself<br/>(Column/Row/Fan, each<br/>with a small preview<br/>icon, checkmark on the<br/>current choice) -<br/>matches…"
    Morpheus->>Oracle: "lead handoff"
    Note right of Morpheus: "Fix reviewed, PASSED.<br/>Scoped override (.stack-<br/>action-menu only) is the<br/>right call over widening<br/>.pile-action-menu's own<br/>overflow - keeps th…"
    Oracle->>Smith: "ora handoff"
    Note right of Oracle: "Docs re-groomed:<br/>lessons.md expanded with<br/>the real finding - a<br/>green test-ui suite<br/>(21/21, incl. new Flip<br/>tests) coexisted with a<br/>completel…"
    Smith->>All: "user approve"
    Note right of Smith: "*user test US-145:<br/>PASSED for real this<br/>time - re-looked at the<br/>live menu after the<br/>overflow fix,<br/>Column/Row/Fan all<br/>render with their prev…"
    Neo->>Cypher: "retro"
    Note right of Neo: "Neo retro: reusing a<br/>proven control<br/>(changePileType's enum<br/>menu) in a new container<br/>cost 2 real integration<br/>bugs, not 0 - reuse<br/>isn't free…"
    Trin->>Cypher: "retro"
    Note right of Trin: "Trin retro: the real<br/>miss is mine, not just<br/>found by me - I approved<br/>Phase 2 UAT while the<br/>menu was genuinely<br/>invisible, because every<br/>chec…"
    Morpheus->>Cypher: "retro"
    Note right of Morpheus: "Morpheus retro: D167<br/>held architecturally<br/>(the reducer shape, the<br/>control choice, the<br/>registry plumbing all<br/>worked first try) - both<br/>real d…"
    Oracle->>Cypher: "retro"
    Note right of Oracle: "Oracle retro: D167<br/>recorded with the<br/>rejected alternative (a<br/>bespoke radio<br/>component). Gap NOT left<br/>this time: both live-<br/>found bugs got the…"
    Mouse->>Cypher: "retro"
    Note right of Mouse: "Mouse retro: 2 phases as<br/>planned, but a real fix<br/>loop happened AFTER the<br/>plan said done - Smith's<br/>own re-test caught what<br/>Trin's UAT missed…"
    Smith->>Cypher: "retro"
    Note right of Smith: "Smith retro: the gate<br/>earned its keep in the<br/>most literal way<br/>possible - approving on<br/>green tests alone would<br/>have shipped a<br/>completely inv…"
    Cypher->>All: "pm launch"
    Note right of Cypher: "*pm launch US-145. Flip<br/>is now a 3-way<br/>Column/Row/Fan choice<br/>with preview icons<br/>(D167), reusing<br/>changePileType's proven<br/>disclosure control.…"
    Note over Cypher,All: 📅 2026-09-30
    Neo->>Cypher: "swe nit"
    Note right of Neo: "*nit stack-gear<br/>repositioned top-right<br/>-> top-left, direct user<br/>request. .stack-gear's<br/>right:-0.3rem -><br/>left:-0.3rem, top edge<br/>(-0.6rem) un…"
```
