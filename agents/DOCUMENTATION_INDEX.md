# BobProtocol Documentation Index

**Last Updated:** 2026-03-22

## Quick Access

Type `*help` for complete command reference with examples.

---

## Primary Documentation

### Getting Started
- **[STARTUP.md](../STARTUP.md)** - LLM startup instructions
- **[README.md](../README.md)** - Project overview and team reference
- **[SHORTHAND_GUIDE.md](../SHORTHAND_GUIDE.md)** - Complete trigger/command reference
- **[HELP.md](bob.docs/HELP.md)** - Quick reference for all 8 personas and commands

### Tools
- **`bobp` CLI** - Agent tooling subcommands (`bobp chat`, `bobp make`, `bobp setup-agent-links`, …); run `bobp --help` for the full list

---

## Persona Documentation

### Active Personas (8)

| Persona | Role | SKILL.md | Prefix |
|---------|------|----------|--------|
| Bob | Prompt Engineering Expert | [bob.docs/SKILL.md](bob.docs/SKILL.md) | `*new` / `*reprompt` / `*learn` |
| Cypher | Product Manager | [cypher.docs/SKILL.md](cypher.docs/SKILL.md) | `*pm` |
| Morpheus | Tech Lead / Architect | [morpheus.docs/SKILL.md](morpheus.docs/SKILL.md) | `*lead` |
| Neo | Senior Software Engineer | [neo.docs/SKILL.md](neo.docs/SKILL.md) | `*swe` |
| Oracle | Knowledge Officer | [oracle.docs/SKILL.md](oracle.docs/SKILL.md) | `*ora` |
| Trin | QA / Guardian | [trin.docs/SKILL.md](trin.docs/SKILL.md) | `*qa` |
| Mouse | Scrum Master | [mouse.docs/SKILL.md](mouse.docs/SKILL.md) | `*sm` |
| Smith | Expert User & UX Advocate | [smith.docs/SKILL.md](smith.docs/SKILL.md) | `*user` |

---

## Team Communication

- **[CHAT.md](CHAT.md)** - Team communication log (append-only)
- Each persona maintains state in their `.docs/` folder:
  - `state.md` - Working memory: Context, Current Task, and Next Steps sections

---

## Template Files

Located in `agents/templates/`:

- `_template_ARCH.md` - Architecture decision record
- `_template_CHAT.md` - CHAT.md message format
- `_template_finding.md` - Research finding
- `_template_LESSON.md` - Lesson learned
- `_template_state.md` - Agent state.md
- `_template_tldr.md` - TLDR block formats

---

## Tools

Shipped as `bobp` CLI subcommands, not project-local scripts:

- `bobp chat` - Post messages to CHAT.md
- `bobp make <target>` - Run this project's own `make <target>`, captured to build/build.out and posted to CHAT.md
- `bobp setup-agent-links` - Create `.claude/skills/` symlinks (run once on setup)

---

## Archived Documentation

Files prefixed with `.archive_` are historical and no longer active:
- `.archive_COMMANDS.md` - (Consolidated into HELP.md)
- `.archive_state_management_fix.md` - (Implemented in protocol)

---

## Documentation Standards

### File Naming
- Persona definitions: `[PersonaName]_[ROLE]_AGENT.md`
- State files: `state.md`
- MCP tools: `[toolname]_mcp.md`
- Templates: `_template_*.md`
- Archived: `.archive_*.md`

### Structure
- All persona docs in `agents/[persona].docs/`
- All MCP tool docs in `agents/tools/`
- Team communication in `agents/CHAT.md`
- Primary references in `agents/bob.docs/`

### Maintenance
- Update `*help` when adding commands
- Update tool docs when changing MCPs
- Archive outdated docs with `.archive_` prefix
- Keep HELP.md, BOB_SYSTEM_PROTOCOL.md, and START_HERE.md in sync

---

## Quick Command Reference

```bash
*help                          # Show complete help
*chat                          # Activate Bob System
*prompt <desc>                 # Create agent (Bob)
*swe impl <task>              # Implement (Neo)
*qa test <scope>              # Test (Trin)
*ora ask <question>           # Query knowledge (Oracle)
*lead plan <epic>             # Plan (Morpheus)
*pm doc <type>                # Create PRD (Cypher)
*sm status                    # Sprint status (Mouse)
```

---

**For Help:** Type `*help` or read `agents/bob.docs/HELP.md`
