# CHAT.md — Conversation Flow

Auto-generated from `agents/CHAT.md` by `bobp chat-diagram`. Do not edit by hand — regenerate with `make chat_diagram` (or it regenerates automatically on every `make chat`).

```mermaid
%%{init: {"sequence": {"messageFontSize": 14, "noteFontSize": 18, "actorFontSize": 14}}}%%
sequenceDiagram
    autonumber
    participant Oracle
    participant User
    Note over Oracle,User: 📅 2026-10-07
    Oracle->>User: "ora handoff"
    Note right of Oracle: "Groomed + archived<br/>(CHAT_TURN_RELAY). Docs:<br/>module map gains<br/>tools/turnRelay.mjs,<br/>README Deploying names<br/>the TURN vars, D176 in<br/>the topical…"
```
