# Agent Discord Harness

Central orchestrator for self-hosted developer automation via Discord.

Routes messages from Discord channels, classifies intent using an LLM, and dispatches commands to local CLI tools (Outline, Plane, Forgejo) — or responds conversationally.

## Architecture

```
Discord Message/DM
       ↓
   [Discord Bot]  ← src/index.ts
       ↓
   Intent Router (OpenRouter LLM)
       ↓
  ┌────────────────┐
  │ Chat Response   │  free model for simple queries
  │ CLI Execution   │  shells out to bin/<tool>
  └────────────────┘
       ↓
  Formatted Discord Embed
```

Webhook ingress is also supported — Forgejo and SigNoz events are received, formatted, and posted to a configured Discord channel.

## Setup

### Prerequisites

- Node.js 22+
- Go 1.23+ (for CLI binaries)
- A Discord bot token
- An OpenRouter API key

### Install

```bash
git clone https://github.com/Ghifaryh/agent-discord-harness.git && cd agent-discord-harness
cp .env.example .env
# Fill in your tokens in .env
npm install
```

### Build CLI binaries

```bash
cd bin/outline-cli && go build -o ../outline-cli . && cd ../..
cd bin/plane-cli && go build -o ../plane-cli . && cd ../..
cd bin/forgejo-cli && go build -o ../forgejo-cli . && cd ../..
chmod +x bin/outline-cli bin/plane-cli bin/forgejo-cli
```

### Run

```bash
npm run dev    # development with hot-reload
npm run build && npm start    # production
```

### Docker

```bash
docker compose up -d
```

## Configuration

### Environment Variables

| Variable             | Description                                      |
| -------------------- | ------------------------------------------------ |
| `DISCORD_TOKEN`      | Discord bot token                                |
| `OPENROUTER_API_KEY` | OpenRouter API key                               |
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

Each tool outputs JSON to stdout for easy parsing by the harness.

### outline-cli (Docs/Wiki)

```bash
./bin/outline-cli doc create --title "Spec" --body "Markdown..."
./bin/outline-cli doc list
./bin/outline-cli doc get --id "doc_xxx"
./bin/outline-cli doc update --id "doc_xxx" --body "Updated content"
```

### plane-cli (Project Tasks)

```bash
./bin/plane-cli task create --title "Bug fix" --priority high
./bin/plane-cli task list --state todo
./bin/plane-cli task update --id "xxx" --state in_progress
./bin/plane-cli task close --id "xxx"
```

### forgejo-cli (Git/Repos)

```bash
./bin/forgejo-cli repo list
./bin/forgejo-cli pr create --repo "owner/name" --branch "feat/x" --title "Add feature"
./bin/forgejo-cli pr list --repo "owner/name" --state open
./bin/forgejo-cli issue create --repo "owner/name" --title "Bug report" --labels "bug"
```

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
│   │   ├── llm.ts            # OpenRouter client (free-first)
│   │   └── router.ts         # Intent classification
│   ├── executors/
│   │   └── shell.ts          # CLI subprocess runner
│   └── handlers/
│       ├── message.ts        # Discord message handling
│       └── webhook.ts        # Forgejo/SigNoz webhooks
├── bin/
│   ├── outline-cli/          # Go: Outline API wrapper
│   ├── plane-cli/            # Go: Plane API wrapper
│   └── forgejo-cli/          # Go: Forgejo API wrapper
├── config/
│   └── channels.json         # Channel → tool permissions
├── Dockerfile
├── docker-compose.yml
└── .env.example
```
