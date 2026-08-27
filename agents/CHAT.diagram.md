# CHAT.md — Conversation Flow

Auto-generated from `agents/CHAT.md` by `bobp chat-diagram`. Do not edit by hand — regenerate with `make chat_diagram` (or it regenerates automatically on every `make chat`).

```mermaid
%%{init: {"sequence": {"messageFontSize": 14, "noteFontSize": 18, "actorFontSize": 14}}}%%
sequenceDiagram
    autonumber
    participant Oracle
    participant Smith
    participant All
    participant Neo
    participant Cypher
    participant Trin
    participant Morpheus
    participant Mouse
    participant User
    Note over Oracle,User: 📅 2026-08-27
    Oracle->>Smith: "ora handoff"
    Note right of Oracle: "*ora groom DONE: task.md<br/>phases 74-78 checked off<br/>w/ real summaries,<br/>USER_STORIES.md sprint-<br/>close + new E2E-rebuild<br/>backlog item, 2 new les…"
    Smith->>All: "user approve"
    Note right of Smith: "*user test techdebt-<br/>sprint PASSED. Tested<br/>the 3 things that<br/>actually changed<br/>behavior this sprint,<br/>not just re-checked<br/>Neo/Trin's own scena…"
    Neo->>Cypher: "retro"
    Note right of Neo: "Neo retro: tech-debt<br/>sprints pay for<br/>themselves via near-miss<br/>catches - twice a<br/>mechanical lint 'fix'<br/>would've been a silent<br/>regression (va…"
    Trin->>Cypher: "retro"
    Note right of Trin: "Trin retro: test<br/>coverage health check<br/>this sprint doubled as a<br/>real audit - discovered<br/>the unit suite (358<br/>tests) was the ONLY<br/>layer still…"
    Morpheus->>Cypher: "retro"
    Note right of Morpheus: "Morpheus retro:<br/>D58/D59's per-rule<br/>disable-with-<br/>justification pattern<br/>(never blanket suppress)<br/>worked well - each one<br/>documents WHY the lin…"
    Oracle->>Cypher: "retro"
    Note right of Oracle: "Oracle retro: 2 new<br/>lessons recorded (test-<br/>claim decay, verify-<br/>before-deleting-<br/>unexplained-files) -<br/>both are exactly the<br/>'worth remembering…"
    Mouse->>Cypher: "retro"
    Note right of Mouse: "Mouse retro: 5-phase<br/>plan (74-78) held up<br/>well even though the<br/>actual content diverged<br/>hugely from the pre-<br/>sprint guess (e2e<br/>removal wasn't…"
    Smith->>Cypher: "retro"
    Note right of Smith: "Cypher retro: US-64..68<br/>AC's 'flag genuine<br/>behavior-change findings<br/>rather than fix or<br/>suppress' clause proved<br/>itself twice (the 2<br/>near-mis…"
    Cypher->>All: "pm launch"
    Note right of Cypher: "*pm launch techdebt-<br/>sprint. US-64..68<br/>shipped: ESLint adopted,<br/>1021->7 lint findings,<br/>dead code+CSS cut, 2<br/>real bugs found+fixed,<br/>real dupl…"
    Neo->>All: "status"
    Note right of Neo: "Session close (prep for<br/>context clear): tech-<br/>debt sprint (US-64..68,<br/>D58-D60) fully shipped/r<br/>eviewed/tested/pushed-<br/>ready. Working tree<br/>clea…"
    User->>All: "request"
    Note right of User: "init *mouse status<br/>update"
    Mouse->>User: "status"
    Note right of Mouse: "Mouse resuming: tech-<br/>debt sprint (US-64..68,<br/>D58-D60) fully shipped &<br/>retro'd at 259c474, tree<br/>clean pre-this-session.<br/>No open sprint plan…"
    User->>All: "request"
    Note right of User: "Fix PlayerZone so that I<br/>can drop a card and<br/>initiate a new pile just<br/>like the table zone so I<br/>can lay down melds etc.<br/>Same with OpponentZo…"
    Neo->>All: "swe start"
    Note right of Neo: "Neo starting *swe fix:<br/>permissive drag/drop for<br/>PlayerZone/OpponentZone<br/>(drop card -> new pile,<br/>same as TableZone).<br/>Investigating dropTarge…"
    Neo->>Trin: "swe handoff"
    Note right of Neo: "Neo *swe fix done: seat-<br/>zone body shrink-wrapped<br/>exactly to its 1 pile,<br/>leaving 0 empty px for<br/>the existing card->new-<br/>pile drop handler (co…"
    Trin->>All: "qa start"
    Note right of Trin: "Trin starting *qa uat on<br/>Neo's zone-drop-gutter<br/>fix. Independently re-<br/>verifying the geometry<br/>claim + running full<br/>regression before<br/>signing…"
    Trin->>Morpheus: "qa handoff"
    Note right of Trin: "Trin UAT PASSED:<br/>reviewed diff - gutter<br/>is inert to every<br/>existing lookup (.pile-<br/>section/[data-card-id]<br/>selectors, not indexed<br/>children). o…"
    Morpheus->>All: "lead decision"
    Note right of Morpheus: "Morpheus reviewing:<br/>chose 'universal per-<br/>zone drop gutter' over<br/>alternatives (widening<br/>.seat-zone via flex-grow<br/>- rejected, contradicts<br/>the…"
    Morpheus->>All: "lead review"
    Note right of Morpheus: "Morpheus review<br/>APPROVED: root-cause<br/>diagnosis (CSS shrink-<br/>wrap geometry, not a<br/>reducer/dispatch<br/>restriction) is correct<br/>and non-obvious -…"
    User->>All: "request"
    Note right of User: "*nit why Score buttons<br/>different? Action<br/>buttons should be below<br/>the title bar"
    Neo->>All: "swe start"
    Note right of Neo: "Neo *swe fix nit:<br/>Score's -/+ buttons<br/>render inline with its<br/>title (not below) by<br/>deliberate 2026-08-25<br/>exception - forcing them<br/>below prev…"
    Neo->>User: "blocked"
    Note right of Neo: "Neo: regression<br/>reproduces on today's<br/>layout, worse than<br/>2026-08-25 (9 violations<br/>vs baseline 5 - 4 NEW:<br/>You/Score-+, Bob/Bob-<br/>Score-+ overl…"
    Neo->>User: "swe finding"
    Note right of Neo: "Neo finding: no zone<br/>anywhere has collision-<br/>aware positioning -<br/>every default position<br/>is a one-time static<br/>formula, never<br/>recomputed for r…"
    User->>All: "request"
    Note right of User: "let's save space by<br/>making ScoreZone show<br/>all players' scores with<br/>controls to update the<br/>score by typing it in or<br/>using +/-1 and +/-10<br/>for…"
    Neo->>Trin: "swe handoff"
    Note right of Neo: "Neo *swe impl done:<br/>ScoreZone consolidated -<br/>ONE panel lists every<br/>player (name, editable<br/>input, -10/-1/+1/+10).<br/>New: SET_SCORE reducer<br/>(ty…"
    Trin->>All: "qa start"
    Note right of Trin: "Trin starting *qa uat on<br/>consolidated ScoreZone.<br/>Independently re-<br/>verifying: reducer<br/>tests, diff review, live<br/>behavior (typed entry,<br/>+/-1/+…"
    Trin->>Morpheus: "qa handoff"
    Note right of Trin: "Trin UAT PASSED:<br/>independently re-ran<br/>362/362 tests + full<br/>lint (js/style/design) -<br/>baseline matches Neo's<br/>report exactly, 3 pre-<br/>existing u…"
    Morpheus->>All: "lead decision"
    Note right of Morpheus: "Morpheus decision:<br/>ScoreZone's attribute-<br/>per-scalar API<br/>(score/adjustable/label,<br/>one instance per player)<br/>fully replaced with<br/>.render(playe…"
    Morpheus->>Smith: "lead review"
    Note right of Morpheus: "Morpheus review<br/>APPROVED: consolidation<br/>is architecturally sound<br/>-<br/>.render(players,options)<br/>matches the existing<br/>ZonePanel pattern,<br/>SET_SCO…"
    Smith->>All: "user start"
    Note right of Smith: "Smith starting *user<br/>test on consolidated<br/>ScoreZone - HCI pass<br/>against the real running<br/>app (learnability, error<br/>prevention,<br/>consistency),…"
    Smith->>All: "user approve"
    Note right of Smith: "Smith UX test PASSED:<br/>live-tested row layout<br/>at 1440px (screenshot:<br/>clean, name<br/>left/controls right, no<br/>clipping), a large<br/>negative score (…"
    Mouse->>All: "sm status"
    Note right of Mouse: "Mouse: session close-out<br/>prep. This session<br/>shipped 2 items: *fix<br/>(permissive drop-to-<br/>create-pile for<br/>PlayerZone/OpponentZone<br/>- zone-drop-g…"
```
