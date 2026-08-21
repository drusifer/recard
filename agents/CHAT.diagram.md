# CHAT.md — Conversation Flow

Auto-generated from `agents/CHAT.md` by `bobp chat-diagram`. Do not edit by hand — regenerate with `make chat_diagram` (or it regenerates automatically on every `make chat`).

```mermaid
%%{init: {"sequence": {"messageFontSize": 14, "noteFontSize": 18, "actorFontSize": 14}}}%%
sequenceDiagram
    autonumber
    participant Cypher
    participant All
    participant Neo
    participant Trin
    participant Morpheus
    participant Smith
    participant Mouse
    Note over Cypher,Mouse: 📅 2026-08-20
    Cypher->>All: "pm launch"
    Note right of Cypher: "*pm launch recard-<br/>sprint-11. A host reload<br/>no longer costs anyone<br/>their game. Hands are<br/>saved and come back to<br/>their owners, players'<br/>clien…"
    Neo->>Trin: "swe handoff"
    Note right of Neo: "*fix table-too-big<br/>regression, CSS-only.<br/>screen-game is a flex<br/>column filling 100svh,<br/>card size clamps to<br/>viewport height, hand<br/>toolbar row…"
    Trin->>Morpheus: "qa handoff"
    Note right of Trin: "UAT table-layout PASSED<br/>(3rd independent green<br/>run): 171 unit + full<br/>e2e. Grepped for other<br/>min-height:0 selectors<br/>that could shadow a var…"
    Trin->>Cypher: "qa decision"
    Note right of Trin: "Added design-lint per<br/>user request. No real<br/>npm 'Designlint' package<br/>catches<br/>layout/overlap/overflow<br/>regressions -<br/>researched, didn't<br/>guess…"
    Trin->>Cypher: "qa status"
    Note right of Trin: "Checkpoint status: 188<br/>unit green, design-lint<br/>at 1 residual (was 70).<br/>e2e regressed by the<br/>button fix, fixed<br/>through a chain of real<br/>bugs…"
    Cypher->>Smith: "pm handoff"
    Note right of Cypher: "Sprint 12: US-46,<br/>pile/hand-unification<br/>(user's own design, from<br/>the button-geometry<br/>chase). Checked first:<br/>hands are ALREADY<br/>state.piles (…"
    Smith->>Morpheus: "user approve"
    Note right of Smith: "*user approve US-46 w/ 5<br/>amendments. BLOCKER:<br/>Draw cannot become drag-<br/>only - this project<br/>ALREADY has a Gate 1<br/>ruling that Draw is the<br/>high…"
    Morpheus->>Smith: "lead handoff"
    Note right of Morpheus: "D34-D37 recorded. Key<br/>call: reveal<br/>(target:null) becomes a<br/>TAP on the card, joining<br/>tap-to-play. Pile-level<br/>actions get ONE fixed<br/>anchor pe…"
    Smith->>Mouse: "user approve"
    Note right of Smith: "*user approve D34-D37 w/<br/>2 corrections. Real one:<br/>D36's 'exactly one<br/>target' can't be<br/>computed from LIVE state<br/>- move/pickup genuinely<br/>have…"
    Mouse->>Morpheus: "sm handoff"
    Note right of Mouse: "Sprint 12 planned: 7<br/>phases, pure-logic-first<br/>(52) same as every prior<br/>sprint. 54 (Draw) and 55<br/>(reveal) are the two<br/>Smith-gated behavior c…"
    Morpheus->>Neo: "lead handoff"
    Note right of Morpheus: "Sprint plan approved - 7<br/>phases, boundary is<br/>right: 52 settles the<br/>static-vs-live<br/>singleTarget distinction<br/>with zero DOM involved,<br/>before a…"
    Neo->>Trin: "swe handoff"
    Note right of Neo: "Phase 52 done, TDD. Hand<br/>offers sort-rank/sort-<br/>suit/pass to its OWNER<br/>only. Draw moved from a<br/>dead per-card action to<br/>pile-level, open to e…"
    Trin->>Morpheus: "qa handoff"
    Note right of Trin: "UAT phase 52 PASSED,<br/>independent re-run + my<br/>own mutation check<br/>(hand-ownership guard -<br/>removing isOwner fails 2<br/>tests). Reviewed the 3<br/>upd…"
    Morpheus->>Neo: "lead handoff"
    Note right of Morpheus: "Phase 52 review<br/>APPROVED. Clean pure-<br/>logic phase, exactly the<br/>shape D34/D35 called<br/>for: zero DOM touched,<br/>both real architecture<br/>points (dr…"
```
