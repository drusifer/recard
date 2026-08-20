---
name: bob-protocol
description: Multi-persona coordination protocol. Enables AI to switch between specialized personas (Neo, Morpheus, Trin, Oracle, Mouse, Cypher, Bob, Smith) based on task needs. Use for *chat workflow, state management, and cross-agent communication.
triggers: ["*chat"]
requires: ["chat", "bloop", "sprint", "make"]
---

Orchestrates multi-persona AI coordination through a shared chat log using the `*chat` trigger.

TLDR:
    Routes `*chat` messages to the right specialist persona — by explicit `@mention` or auto-selection.
    Each persona loads state on entry, executes one task, saves state on exit, posts to `agents/CHAT.md`.
    For full workflow chains use loop commands (*fix, *impl, *qa, *review, *plan sprint) — see bloop skill.
    Key rule: no third fix attempt without Oracle consult + user sign-off.

# Bob Protocol — Multi-Persona Coordination

## Overview

One AI dynamically switches between specialized personas. All coordination happens through `agents/CHAT.md`. On cold start, each persona reads their state files to resume where they left off.

## Available Personas

Each persona is defined in `agents/<name>.docs/SKILL.md`:

| Persona | Role | Prefix | Use When |
|---------|------|--------|----------|
| **Neo** | Senior SWE | `*swe` | Implementation, coding, debugging |
| **Morpheus** | Tech Lead | `*lead` | Architecture, design decisions |
| **Trin** | QA Guardian | `*qa` | Testing, code review |
| **Oracle** | Knowledge Officer | `*ora` | Documentation, knowledge queries |
| **Mouse** | Scrum Master | `*sm` | Sprint tracking, coordination |
| **Cypher** | Product Manager | `*pm` | Requirements, user stories |
| **Bob** | Prompt Engineer | `*prompt` | Agent creation, process improvement |
| **Smith** | HCI Expert | `*user` | UX review, usability testing, sprint gates |

---

## The `*chat` Workflow

### Step 1: Log User Message (ALWAYS FIRST)
```bash
bobp chat "<user's message>" --persona User --cmd request
```

**Note on External Invocations**: Different AI harnesses use different prefixes for direct persona invocation (e.g., `@persona` or `/persona` in Gemini CLI, `/persona` in Claude, `$persona` in Codex). If you are invoked directly via such a command, you MUST log the invocation to `agents/CHAT.md` immediately upon entry if it has not already been logged. This ensures the shared team context is complete.

### Step 2: Read Chat Log
Read the bottom of `agents/CHAT.md` (newest messages at END, last 10-20 messages).

### Step 3: Identify Persona and Command

#### Mode A — Direct Invocation (Explicit `@mention`)
```
*chat @neo *fix bug in parser.py
*chat @trin *test all
*chat @morpheus *arch review the API design
*chat @smith *user review the sprint stories
```
Parse: `@neo` → persona, `*fix` → command (`*swe fix`), remainder → arguments. Skip to Step 4.

#### Mode B — Auto-Select (No `@mention`)
Analyze the request and route to the best persona:

| Request type | Route to |
|-------------|----------|
| Coding, debugging, implementation | Neo (`*swe`) |
| Architecture, design decisions | Morpheus (`*lead`) |
| Testing, code review | Trin (`*qa`) |
| Documentation, knowledge queries | Oracle (`*ora`) |
| Sprint status, coordination | Mouse (`*sm`) |
| Requirements, user stories | Cypher (`*pm`) |
| Agent creation, prompt improvement | Bob (`*prompt`) |
| UX review, usability, sprint gates | Smith (`*user`) |

For multi-step workflows, use a Bloop command instead: `*fix`, `*impl`, `*qa`, `*review`, `*plan sprint`.

### Step 4: Load Persona and Execute
1. Read `agents/<name>.docs/SKILL.md`
2. Load persona's state: `agents/<name>.docs/state.md` (context, current task, and resume plan in one file)
3. If PROJECT.md exists: read `agents/PROJECT.md` for project capabilities
4. Adopt the persona and execute the command

### Step 5: Perform ONE Action
Execute one focused task. **Short iterations are key** — complete one thing, then stop.

### Step 6: Post Response to Chat
```bash
bobp chat "<response>" --persona <Name> --cmd <command> --to <recipient>
```

### Step 7: Save State — HARD GATE (MANDATORY BEFORE ANY SWITCH)
**Do not switch personas until both steps below are complete.**

1. Write `agents/[persona].docs/state.md` — what was learned/decided, progress %, what's next, and exact resume instructions for a cold start, all in one file
2. Post handoff: `bobp chat "<summary> @Next *command" --persona <Name> --cmd handoff --to <next>`

---

## State Management

**`state.md` is the only memory that survives context overflow and session restarts.**
Write it as if you will never be asked again and someone else must continue.

Each persona has exactly one state file — `agents/[persona].docs/state.md` — with three sections: `## Context` (what was learned, key decisions), `## Current Task` (progress %, what was done, what's next), `## Next Steps` (exact resume instructions for a cold start). This replaces the older three-file convention (`context.md`/`current_task.md`/`next_steps.md`); consolidating cut state-management tool calls per switch by two-thirds with no loss of resilience, since the file is still written every switch, just as one call instead of three.

For a **large, growing reference doc** (not `state.md` itself — those stay small) like `agents/oracle.docs/lessons.md`, `agents/oracle.docs/memory.md`, or `docs/ARCH.md`, don't re-read the whole file on every entry once it accumulates many dated entries. If `via` is enabled, locate the section you need first (`via -mg '*SectionName*' -tH` returns `file:start-end`), then read only that range (`Read` with `offset`/`limit`) — see the `via` skill's "Section-Scoped Reads" note. Do not rely on `via`'s `-oR -A N` alone for this: `-A N` is a blind line-count window, not section-aware, and will run past the section boundary into the next one if `N` is too large.

### ENTRY (When Activating / Rapid Startup)
1. Read `agents/CHAT.md` — last 10-20 messages
2. Load `agents/[persona].docs/state.md`
3. **Rapid Startup Option (CRITICAL)**: Do NOT run a full test suite baseline check (`bobp make test`) or other heavy execution cycles on initialization unless explicitly requested or implementing/testing bug fixes. Reconcile state quickly and proceed.
4. Verify that agent links are synced (run `setup_agent_links.py` if needed).
5. Post your persona initialization message using `bobp chat` immediately.
6. If `agents/PROJECT.md` exists — read it for project capabilities

### WORK
7. Execute assigned tasks
8. Post updates to `agents/CHAT.md` after each significant step

### EXIT — HARD GATE
9. Update `agents/[persona].docs/state.md` (Context, Current Task, Next Steps sections)
10. Post handoff message
11. Only now switch or stop

---

## Cold Start Recovery

When resuming after a context clear or new session with no memory:

1. Read bottom 20 messages of `agents/CHAT.md` — find the last handoff
2. Identify which persona was active and what command was pending
3. Load that persona's `state.md`
4. Post a resume message: `bobp chat "Resuming <task> from last session." --persona <Name> --cmd resume`
5. Continue from the `## Next Steps` section of `state.md` — do not restart from scratch

If CHAT.md has no clear handoff, ask the user: "I'm resuming — what should I pick up?"

---

## Cross-Persona Communication

Use `@mentions` in CHAT.md to route work:

```bash
bobp chat "@Neo *swe impl Task 4" --persona Morpheus --cmd "lead handoff" --to Neo
bobp chat "@Trin *qa test all" --persona Neo --cmd "swe handoff" --to Trin
bobp chat "@Oracle *ora ask Have we seen this error before?" --persona Neo --cmd "swe ask" --to Oracle
bobp chat "@Morpheus *lead decide <choice>" --persona Trin --cmd "qa handoff" --to Morpheus
```

---

## Decision Broadcast — every persona, every decision

**If you decided something, post a summary to CHAT.md in the same turn you
decided it.** Not only Morpheus, and not only things numbered `D<n>`.

This was previously written down three times, as a courtesy in the
relationship tables of Morpheus, Cypher and Tank ("post significant
decisions so Oracle can archive them"). That framing under-reached: it
made the broadcast Oracle's benefit rather than the project's, and it left
every other persona with no rule at all.

**What counts as a decision.** Anything a future reader could reasonably
ask *"why is it like this?"* about:

- choosing an approach over a named alternative (including "we'll do the
  simple thing for now")
- cutting, deferring, or widening scope
- a gate verdict that carries conditions — the conditions are the decision
- deciding *not* to fix something you found
- changing a rule, a threshold, or a convention

**What to post.** Chat messages are capped at 512 characters, which is why
this is "summarized" and not "pasted". Three things, in this order:

1. **What was decided** — the outcome, stated plainly.
2. **What was rejected, and why** — the alternative is the half that
   makes the decision legible later. A decision with no visible
   alternative reads as an accident.
3. **Where the full text lives** — `docs/ARCHITECTURE.md` D-number,
   `DECISIONS.md`, a story's AC, a state file.

If it will not fit in 512 characters, the decision goes in a document and
the *summary* goes in chat — never skip the post because the reasoning is
long. That is exactly when the post matters most.

**When.** In the turn you make it, before the handoff — not batched at
sprint close. A decision recorded only at groom has already influenced
work that nobody could question at the time.

**Why chat specifically.** `*ora report` archives CHAT.md per sprint to
`agents/chat_archive/`, so chat is the one durable, time-ordered record of
*why* — documents get rewritten in place and quietly lose their reasoning.
The failure mode is real and present in this repo: `docs/DECISIONS.md`
stops at D20 while D21-D28 exist only in `ARCHITECTURE.md`. Every one of
those was posted to chat, which is the only reason the reasoning survived
the drift.

```bash
bobp chat "D<n> recorded: <what was decided>. Chose <X> over <Y> because <reason>. Full text: docs/ARCHITECTURE.md. @Next *command" \
  --persona <Name> --cmd "<prefix> decision" --to <Next>
```

---

## Anti-Loop Protocol

If a fix attempt fails:

1. **STOP** — do not retry the same approach
2. **Consult Oracle**: `bobp chat "@Oracle *ora ask Have we seen this error before? Error: <error>" --persona <Name> --cmd ask --to Oracle`
3. Read error logs carefully — understand the root cause
4. ONE retry with a new approach
5. If that also fails → escalate: `bobp chat "Blocked after 2 attempts on <task>. Tried: <A>, <B>. Recommend: <C>. Awaiting user input." --persona <Name> --cmd blocked --to User`

**No third attempt without Oracle consult + explicit user approval.**

---

## Chat Message Format

```
[DATETIME] [**Persona**]->[**recipient**] *cmd*:

 message
```

---

## Direct Invocation Quick Reference

| User Types | Persona | Command Executed |
|------------|---------|-----------------|
| `*chat @neo *fix X` | Neo | `*swe fix X` |
| `*chat @neo *impl Y` | Neo | `*swe impl Y` |
| `*chat @trin *test all` | Trin | `*qa test all` |
| `*chat @morpheus *arch Z` | Morpheus | `*lead arch Z` |
| `*chat @oracle *ask Q` | Oracle | `*ora ask Q` |
| `*chat @mouse *status` | Mouse | `*sm status` |
| `*chat @cypher *req R` | Cypher | `*pm req R` |
| `*chat @bob *prompt P` | Bob | `*prompt P` |
| `*chat @smith *user review S` | Smith | `*user review S` |
| `*chat @smith *user approve` | Smith | `*user approve` |
