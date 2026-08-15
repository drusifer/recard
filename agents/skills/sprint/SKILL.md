---
name: sprint
description: Full sprint implementation cycle. Covers planning, phase Bloop, sprint close, retrospective, and launch. Use *plan sprint to start, then *impl <phase> for each phase.
triggers: ["*plan sprint", "*sprint close", "*sprint retro", "*sprint launch"]
requires: ["bob-protocol", "bloop", "chat", "make"]
---

Full sprint cycle from planning through launch, including all review gates, phase Bloops, and handoff templates.

TLDR:
    Sprints have three stages: Planning (Cypher→Smith→Morpheus→Mouse), Phase Bloop (*impl per phase), and Close (Oracle→Smith→All retro→Cypher launch).
    Smith gates after Cypher and Morpheus are mandatory — do not auto-proceed without explicit `*user approve`.
    Keep phases small: 1-3 tasks each. Large phases cause context overflow.

# Sprint — Full Implementation Cycle

## Sprint Stages

```
Stage 1: Planning      → Cypher → Smith gate → Morpheus → Smith gate → Mouse → Morpheus review
Stage 2: Phase Bloop   → (Neo → Trin → Morpheus) × N phases
Stage 3: Close         → Oracle → Smith → All retro → Cypher launch
```


---

## Stage 1: Sprint Planning

### Step 1 — Cypher: Stories + Acceptance Criteria
```
Cypher *pm plan sprint
```
- Define user stories with clear acceptance criteria
- Scope the sprint: what's in, what's out
- Hand off to Smith for user review gate

**Handoff:**
```bash
bobp chat "Stories ready for user review. @Smith *user review <sprint>" --persona Cypher --cmd "pm handoff" --to Smith
```

### Gate 1 — Smith: User Story Review
```
Smith *user review <stories>
```
- Evaluate stories against HCI principles and user value
- Check: are acceptance criteria testable and user-facing?
- Must post explicit approve or reject

```bash
# Approve → proceed to Morpheus
bobp chat "*user approve. Stories approved. @Morpheus *lead arch sprint" --persona Smith --cmd "user approve" --to Morpheus

# Reject → back to Cypher
bobp chat "*user reject REASON: <reason> | FIX: <fix>. @Cypher revise stories." --persona Smith --cmd "user reject" --to Cypher
```

### Step 2 — Morpheus: Architecture
```
Morpheus *lead arch sprint
```
- Define architecture decisions and technical design
- Record decisions via `@Oracle *ora record decision`
- Hand off to Smith for architecture review gate

**Handoff:**
```bash
bobp chat "Architecture complete. @Smith *user feedback <arch summary>" --persona Morpheus --cmd "lead handoff" --to Smith
```

### Gate 2 — Smith: Architecture Review
```
Smith *user feedback <arch>
```
- Evaluate architecture for UX impact (flag naming, output formats, breaking changes)
- Must post explicit approve or reject

```bash
# Approve → proceed to Mouse
bobp chat "*user approve. Architecture approved. @Mouse *sm plan sprint" --persona Smith --cmd "user approve" --to Mouse

# Reject → back to Morpheus
bobp chat "*user reject REASON: <reason> | FIX: <fix>. @Morpheus revise arch." --persona Smith --cmd "user reject" --to Morpheus
```

### Step 3 — Mouse: Phase Breakdown
```
Mouse *sm plan sprint
```
- Break sprint into phases of **1-3 tasks each** (no larger — context overflow risk)
- Record phases in `agents/mouse.docs/sprint_log.md`
- Hand off to Morpheus for plan review

**Handoff:**
```bash
bobp chat "Sprint planned. Phases ready for review. @Morpheus *lead review sprint plan" --persona Mouse --cmd "sm handoff" --to Morpheus
```

### Step 3a — Morpheus: Sprint Plan Review
```
Morpheus *lead review sprint plan
```
- Verify phase breakdown aligns with architecture decisions
- Approve or request adjustment to Mouse

**Handoff (approved):**
```bash
bobp chat "Sprint plan approved. Phase 1 ready. @Neo *swe impl phase-1" --persona Morpheus --cmd "lead handoff" --to Neo
```

---

## Stage 2: Phase Bloop

Repeat for each phase until all phases complete.

### Step 4 — Neo: Implementation
```
Neo *swe impl <phase N>
```
- TDD: write tests first, then implement
- Keep implementation scoped to this phase only

**Handoff:**
```bash
bobp chat "Phase N impl complete. @Trin *qa uat phase-N" --persona Neo --cmd "swe handoff" --to Trin
```

### Step 5 — Trin: UAT
```
Trin *qa uat <phase N>
```
- Run tests, verify all acceptance criteria for this phase
- Consult Oracle for expected behavior before asserting

**Handoff (pass):**
```bash
bobp chat "UAT phase N passed. @Morpheus *lead review phase-N" --persona Trin --cmd "qa handoff" --to Morpheus
```

**Handoff (fail):**
```bash
bobp chat "UAT phase N FAILED. @Neo *swe fix <issues>" --persona Trin --cmd "qa reject" --to Neo
```

### Step 6 — Morpheus: Code Review
```
Morpheus *lead review <phase N>
```
- Review for architectural correctness, code quality, maintainability

**Handoff (pass — more phases):**
```bash
bobp chat "Phase N review passed. @Neo *swe impl phase-N+1" --persona Morpheus --cmd "lead handoff" --to Neo
```

**Handoff (pass — last phase):**
```bash
bobp chat "All phases reviewed. @Oracle *ora groom" --persona Morpheus --cmd "lead handoff" --to Oracle
```

**Handoff (fail):**
```bash
bobp chat "Phase N review FAILED. Issues: <issues>. @Neo *swe fix <issues>" --persona Morpheus --cmd "lead reject" --to Neo
```

**Fix loop rule:** If Neo fails to fix after one retry → Anti-Loop Protocol applies (Oracle consult + user escalation required).

---

## Stage 3: Sprint Close

### Step 7 — Oracle: Groom
```
Oracle *ora groom
```
- Update docs, record decisions, archive sprint artifacts
- Ensure CHAT.md is archived if over 50-100 messages (rolling `*ora archive`)
- **Sprint-close chat report:** write a short summary of the sprint's CHAT.md conversation, then run
  `bobp chat-report --moniker <SPRINT_MONIKER> --summary "<summary>"` (`*ora report <SPRINT_MONIKER>`).
  This archives CHAT.md + CHAT.diagram.md to `agents/chat_archive/CHAT_<SPRINT_MONIKER>.md`/`.diagram.md`
  and resets CHAT.md for the next sprint — all file I/O is handled by the command; Oracle supplies only
  the summary text. Run `bobp chat-report --combine` afterward if a consolidated `CHAT_FULL.md` is needed.

**Handoff:**
```bash
bobp chat "Docs groomed. @Smith *user test <sprint>" --persona Oracle --cmd "ora handoff" --to Smith
```

### Step 8 — Smith: End-to-End User Testing
```
Smith *user test <sprint>
Smith *user feedback
```
- Test all delivered features from the user's perspective
- Apply HCI heuristics — flag rough edges, inconsistencies, confusing interfaces

**Handoff (pass):**
```bash
bobp chat "User testing passed. @all *sprint retro" --persona Smith --cmd "user approve" --to all
```

**Handoff (bug found):**
```bash
bobp chat "*user bug CMD: <cmd> | EXPECTED: <x> | ACTUAL: <y> | UX ISSUE: <z>. @Trin triage." --persona Smith --cmd "user bug" --to Trin
```
→ Trin triages → fix loop → re-test before retro

### Step 9 — All Personas: Sprint Retrospective
```
*sprint retro
```
Each persona posts their domain retrospective to CHAT.md:

| Persona | Retrospective focus |
|---------|-------------------|
| Neo | Code quality, tech debt, implementation friction |
| Trin | Test coverage, regressions caught, test suite health |
| Morpheus | Architecture decisions made, anything to revisit |
| Oracle | Documentation gaps, decisions not recorded |
| Mouse | Phase sizing, blockers, velocity |
| Cypher | Story quality, acceptance criteria accuracy |
| Smith | UX issues, HCI gaps, user feedback themes |

Output feeds Cypher's backlog before launch.

```bash
# Each persona posts:
bobp chat "<persona> retro: <findings>. Backlog items: <items>" --persona <Name> --cmd retro --to Cypher
```

### Step 10 — Cypher: Launch
```
Cypher *pm launch <sprint>
```
- Announce release
- Add retro feedback to backlog
- Update changelog
- Close sprint

**Handoff:**
```bash
bobp chat "*pm launch <sprint>. Sprint complete." --persona Cypher --cmd "pm launch" --to all
```

**Sprint is complete** when Cypher posts `*pm launch`.

---

## Quick Reference

| Step | Persona | Command | Gate |
|------|---------|---------|------|
| 1 | Cypher | `*pm plan sprint` | → Smith `*user review` |
| 1a | Smith | `*user approve` / `*user reject` | Must approve to proceed |
| 2 | Morpheus | `*lead arch sprint` | → Smith `*user feedback` |
| 2a | Smith | `*user approve` / `*user reject` | Must approve to proceed |
| 3 | Mouse | `*sm plan sprint` | → Morpheus `*lead review sprint plan` |
| 3a | Morpheus | `*lead review sprint plan` | Approve to start phase Bloop |
| 4 | Neo | `*swe impl <phase N>` | → Trin UAT |
| 5 | Trin | `*qa uat <phase N>` | → Morpheus review |
| 6 | Morpheus | `*lead review <phase N>` | Pass → next phase or Oracle |
| 7 | Oracle | `*ora groom` | → Smith testing |
| 8 | Smith | `*user test` + `*user feedback` | Pass → retro; bug → fix Bloop |
| 9 | All | `*sprint retro` | Feed backlog to Cypher |
| 10 | Cypher | `*pm launch <sprint>` | Sprint complete |

---

## Rules

- **Short phases**: 1-3 tasks each. Large phases cause context overflow.
- **No skipping gates**: Smith's gates after steps 1 and 2 are mandatory. Never auto-proceed.
- **Fix Bloop scope**: Fix Bloop targets the failing phase only — never restart the full sprint.
- **State saves**: Every persona saves state before every handoff (see bob-protocol State Management).
- **Chat first**: Post the handoff `bobp chat` call BEFORE switching. The next persona reads CHAT.md on entry.
- **Retro is required**: Step 9 is not optional. Retro output is the input to the next sprint's backlog.
