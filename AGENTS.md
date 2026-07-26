# AGENTS.md - System Context & Execution Guidelines

This repository contains the **Discord Agent Harness**—the central orchestrator and communication hub for our self-hosted developer automation pipeline.

---

## 1. System Philosophy

1. **Harness First:** This service routes messages from Discord channels, formats responses, and dispatches commands to local CLI tools.
2. **CLI Over Raw HTTP:** Do not embed heavy third-party REST API logic in this codebase. Instead, call external system binaries located in `./bin/` (e.g., `./bin/plane-cli`, `./bin/outline-cli`).
3. **Low Overhead:** Prioritize lightweight, non-blocking execution. Default routine tasks to free OpenRouter models (`openrouter/free`).

---

## 2. Directory & Binary Layout

* `src/agent/`: Core LLM integration and intent detection logic.
* `src/executors/`: Subprocess wrappers for running local terminal commands.
* `src/handlers/`: Webhook receivers and Discord event listeners.
* `bin/`: **[Git Ignored]** Folder containing local executable binaries built from independent CLI wrapper repositories.

so like this:
agent-discord-harness/
├── .gitignore                  # Ignores /bin/*
├── AGENTS.md                   # System Prompt & Context for AI Agents
├── docker-compose.yml          # Container stack orchestration
├── Dockerfile                  # Builds Discord bot + pulls/compiles CLI binaries
├── package.json / go.mod
├── bin/                        # [GITIGNORED] Contains binary tools
│   ├── .gitkeep
│   ├── outline-cli
│   ├── plane-cli
│   └── forgejo-cli
├── config/
│   └── channels.json           # Maps Discord Channel IDs to CLI tool permissions
└── src/
    ├── index.ts                # Entrypoint for Discord Client
    ├── agent/
    │   ├── llm.ts              # OpenRouter API client (handles free/paid models)
    │   └── router.ts           # Decides: Execute CLI or generate chat response?
    ├── executors/
    │   └── shell.ts            # Safe subprocess execution handler (`bin/<cli>`)
    └── handlers/
        ├── message.ts          # Handles chat/mentions in Discord
        └── webhook.ts          # Handles incoming webhooks from Forgejo/SigNoz

---

## 3. Execution Rules & CLI Invocation Guidelines

When handling incoming intents or writing handlers that trigger CLI tools:

* **Always validate input parameters** before calling a binary in `./bin/`.
* Execute CLI utilities using absolute relative path references (e.g., `./bin/<tool-name> <subcommand> --flags`).
* Capture `stdout` for valid responses and `stderr` for execution errors. Return clean, formatted Discord Markdown embeds.

### Available CLI Binaries & Expected Usage:

```bash
# Outline (Docs/Wiki)
./bin/outline-cli doc create --title "Spec Title" --body "Markdown..."

# Plane (Project Tasks)
./bin/plane-cli task create --title "Bug fix" --priority "high"
./bin/plane-cli task list --state "todo"

# Forgejo (Git/Code Repos)
./bin/forgejo-cli repo list
./bin/forgejo-cli pr create --repo "my-app" --branch "feat/login"
