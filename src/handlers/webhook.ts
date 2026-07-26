import express from "express";
import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { createHmac, timingSafeEqual } from "node:crypto";

const app = express();
app.use(express.json({ limit: "10mb" }));

function verifyWebhookSecret(req: express.Request): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true;

  const signature = req.headers["x-webhook-signature"] as string | undefined;
  if (!signature) return false;

  const body = JSON.stringify(req.body);
  const expected = createHmac("sha256", secret).update(body).digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}

function getWebhookChannel(
  client: Client,
  channelId?: string
): TextChannel | null {
  const targetId = channelId || process.env.DISCORD_WEBHOOK_CHANNEL_ID;
  if (!targetId) return null;

  const channel = client.channels.cache.get(targetId);
  if (channel?.isTextBased()) return channel as TextChannel;
  return null;
}

export function startWebhookServer(client: Client): void {
  const port = parseInt(process.env.WEBHOOK_PORT || "3000", 10);

  app.post("/webhook/forgejo", async (req, res) => {
    if (!verifyWebhookSecret(req)) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    const event = req.headers["x-gitea-event"] as string | undefined;
    const payload = req.body;

    try {
      const channel = getWebhookChannel(client);
      if (!channel) {
        console.warn("No webhook channel configured, ignoring Forgejo event");
        return res.status(200).json({ status: "ignored", reason: "no channel" });
      }

      const embed = buildForgejoEmbed(event || "unknown", payload);
      await channel.send({ embeds: [embed] });

      res.status(200).json({ status: "ok" });
    } catch (err) {
      console.error("Forgejo webhook error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/webhook/signoz", async (req, res) => {
    if (!verifyWebhookSecret(req)) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    const payload = req.body;

    try {
      const channel = getWebhookChannel(client);
      if (!channel) {
        console.warn("No webhook channel configured, ignoring SigNoz event");
        return res.status(200).json({ status: "ignored", reason: "no channel" });
      }

      const embed = buildSigNozEmbed(payload);
      await channel.send({ embeds: [embed] });

      res.status(200).json({ status: "ok" });
    } catch (err) {
      console.error("SigNoz webhook error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.listen(port, () => {
    console.log(`Webhook server listening on port ${port}`);
  });
}

function buildForgejoEmbed(
  event: string,
  payload: Record<string, unknown>
): EmbedBuilder {
  const action = payload.action as string | undefined;
  const repository = payload.repository as Record<string, unknown> | undefined;
  const repoName = repository?.full_name ?? "unknown";

  let title = `Forgejo: ${event}`;
  let description = "";
  let color = 0x6cc644;

  switch (event) {
    case "push": {
      const commits = payload.commits as Array<{
        message?: string;
        id?: string;
      }> | undefined;
      const commitCount = commits?.length ?? 0;
      const ref = payload.ref as string;
      title = `Push to ${repoName} (${ref})`;
      description = `${commitCount} commit(s) pushed`;
      if (commits && commits.length > 0) {
        const commitList = commits
          .slice(0, 5)
          .map(
            (c) =>
              `\`${c.id?.slice(0, 7) ?? "?"}\` ${c.message ?? "(no message)"}`
          )
          .join("\n");
        description += `\n\n${commitList}`;
      }
      color = 0x6cc644;
      break;
    }
    case "pull_request": {
      const pr = payload.pull_request as Record<string, unknown> | undefined;
      title = `PR ${action}: ${repoName}`;
      description = `${pr?.title ?? "Unknown"} (#${pr?.number ?? "?"})`;
      color = 0x7c3aed;
      break;
    }
    case "issues": {
      const issue = payload.issue as Record<string, unknown> | undefined;
      title = `Issue ${action}: ${repoName}`;
      description = `${issue?.title ?? "Unknown"} (#${issue?.number ?? "?"})`;
      color = 0xf59e0b;
      break;
    }
    default:
      description = `Event: ${event}`;
      color = 0x6b7280;
  }

  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description.slice(0, 4000))
    .setColor(color)
    .setTimestamp();
}

function buildSigNozEmbed(payload: Record<string, unknown>): EmbedBuilder {
  const labels = (payload.labels ?? {}) as Record<string, string>;
  const annotations = (payload.annotations ?? {}) as Record<string, string>;

  const alertName =
    (payload.alertName as string) ||
    labels.alertname ||
    "Unknown Alert";
  const severity =
    (payload.severity as string) ||
    labels.severity ||
    "unknown";
  const status = (payload.status as string) || "firing";
  const description =
    (payload.description as string) ||
    annotations.description ||
    "No description";

  const severityColors: Record<string, number> = {
    critical: 0xef4444,
    warning: 0xf59e0b,
    info: 0x3b82f6,
    unknown: 0x6b7280,
  };

  const embed = new EmbedBuilder()
    .setTitle(`SigNoz Alert: ${alertName}`)
    .setDescription(description.slice(0, 4000))
    .setColor(severityColors[severity.toLowerCase()] ?? severityColors.unknown)
    .addFields(
      { name: "Severity", value: severity, inline: true },
      { name: "Status", value: status, inline: true }
    )
    .setTimestamp();

  if (Object.keys(labels).length > 0) {
    const importantLabels = Object.entries(labels)
      .filter(([k]) => !["alertname", "severity"].includes(k))
      .slice(0, 5)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    if (importantLabels) {
      embed.addFields({ name: "Labels", value: importantLabels });
    }
  }

  return embed;
}
