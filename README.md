# Agent Discord Harness

Central orchestrator for self-hosted developer automation via Discord.

Routes messages from Discord channels, classifies intent using an LLM, and dispatches commands to local CLI tools (Outline, Plane, Forgejo) — or responds conversationally.

## Architecture

```
Discord Message/DM
       ↓
   [Discord Bot]  ← src/index.ts
       ↓
   Intent Router (9Router LLM)
       ↓
  ┌────────────────┐
  │ Chat Response   │  conversational responses
  │ CLI Execution   │  shells out to bin/<tool>
  └────────────────┘
       ↓
  Formatted Discord Embed
```

Webhook ingress is also supported — Forgejo and SigNoz events are received, formatted, and posted to a configured Discord channel.

## Setup

### Prerequisites

- Node.js 22+
- A Discord bot token
- A 9Router Gateway API key

### Install

```bash
git clone https://github.com/Ghifaryh/agent-discord-harness.git && cd agent-discord-harness
cp .env.example .env
# Fill in your tokens in .env
npm install
```

### Run

```bash
npm run build:clis    # build CLI binaries from separate repos (requires Go + SSH)
npm run dev           # development with hot-reload
npm run build && npm start    # production
```

### Docker

```bash
docker compose up -d
```

> **Note:** The Dockerfile automatically clones and builds the CLI binaries from their separate repos ([outline-cli](https://github.com/Ghifaryh/outline-cli), [plane-cli](https://github.com/Ghifaryh/plane-cli), [forgejo-cli](https://github.com/Ghifaryh/forgejo-cli)) during the image build. For local development, use `npm run build:clis`.

## Configuration

### Environment Variables

| Variable             | Description                                      |
| -------------------- | ------------------------------------------------ |
| `DISCORD_TOKEN`      | Discord bot token                                |
| `AI_PROVIDER_BASE_URL` | 9Router Gateway base URL                      |
| `AI_PROVIDER_API_KEY` | 9Router Gateway API key                       |
| `DEFAULT_MODEL`       | Model to use (default: combo/test-hemat-ga-ya)   |
| `OUTLINE_URL`        | Outline instance URL                             |
| `OUTLINE_API_KEY`    | Outline API token                                |
| `PLANE_URL`          | Plane instance URL                               |
| `PLANE_API_KEY`      | Plane API token                                  |
| `FORGEJO_URL`        | Forgejo instance URL                             |
| `FORGEJO_API_KEY`    | Forgejo API token                                |
| `WEBHOOK_PORT`       | Webhook server port (default: 3000)              |
| `WEBHOOK_SECRET`     | Shared secret for webhook signature verification |

### Channel Permissions

Edit `config/channels.json` to control which CLI tools are available in each Discord channel:

```json
{
  "channels": {
    "DISCORD_CHANNEL_ID": {
      "description": "Dev team channel",
      "allowedTools": ["plane-cli", "forgejo-cli"],
      "requireMention": true
    }
  },
  "defaults": {
    "allowedTools": [],
    "requireMention": true
  }
}
```

## CLI Tools

Each tool lives in its own repo and outputs JSON to stdout for easy parsing by the harness.

| Tool | Repo | Description |
|------|------|-------------|
| [outline-cli](https://github.com/Ghifaryh/outline-cli) | Docs/Wiki | Outline API wrapper |
| [plane-cli](https://github.com/Ghifaryh/plane-cli) | Project Tasks | Plane API wrapper |
| [forgejo-cli](https://github.com/Ghifaryh/forgejo-cli) | Git/Repos | Forgejo/Gitea API wrapper |

## Webhooks

The bot exposes an HTTP server for incoming webhooks:

- `POST /webhook/forgejo` — Forgejo push/PR/issue events → Discord embeds
- `POST /webhook/signoz` — SigNoz alerts → Discord embeds
- `GET /health` — Health check

Set `WEBHOOK_SECRET` in your env and configure the corresponding webhook URL in Forgejo/SigNoz to point to `http://<host>:<port>/webhook/<provider>`.

## Project Structure

```
├── src/
│   ├── index.ts              # Entrypoint
│   ├── agent/
│   │   ├── llm.ts            # 9Router LLM client
│   │   └── router.ts         # Intent classification
│   ├── executors/
│   │   └── shell.ts          # CLI subprocess runner
│   └── handlers/
│       ├── message.ts        # Discord message handling
│       └── webhook.ts        # Forgejo/SigNoz webhooks
├── bin/                      # [GITIGNORED] Built during Docker build
│   ├── .gitkeep
│   ├── outline-cli           # From github.com/Ghifaryh/outline-cli
│   ├── plane-cli             # From github.com/Ghifaryh/plane-cli
│   └── forgejo-cli           # From github.com/Ghifaryh/forgejo-cli
├── config/
│   └── channels.json         # Channel → tool permissions
├── Dockerfile
├── docker-compose.yml
└── .env.example
```
