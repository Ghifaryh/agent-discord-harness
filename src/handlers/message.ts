import {
  Client,
  Message,
  EmbedBuilder,
  AttachmentBuilder,
} from "discord.js";
import { classifyIntent, generateChatResponse } from "../agent/router.js";
import { execCLI, formatCLIOutput } from "../executors/shell.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface ChannelConfig {
  channels: Record<
    string,
    {
      description?: string;
      allowedTools: string[];
      requireMention: boolean;
    }
  >;
  defaults: {
    allowedTools: string[];
    requireMention: boolean;
  };
}

let channelConfig: ChannelConfig = {
  channels: {},
  defaults: { allowedTools: [], requireMention: true },
};

function loadChannelConfig(): void {
  try {
    const raw = readFileSync(
      resolve(process.cwd(), "config/channels.json"),
      "utf-8"
    );
    channelConfig = JSON.parse(raw) as ChannelConfig;
  } catch {
    console.warn("Failed to load config/channels.json, using defaults");
  }
}

function getChannelAllowedTools(channelId: string): string[] {
  const channel = channelConfig.channels[channelId];
  if (channel) return channel.allowedTools;
  return channelConfig.defaults.allowedTools;
}

export function initMessageHandler(client: Client): void {
  loadChannelConfig();

  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot) return;

    const isDM = !message.guild;
    const isMentioned = message.mentions.has(client.user!);

    if (!isDM && !isMentioned) return;

    const userMessage = message.content
      .replace(/<@!?\d+>/g, "")
      .trim();

    if (!userMessage) return;

    if ("sendTyping" in message.channel) {
      await message.channel.sendTyping();
    }

    try {
      const channelId = message.channel.id;
      const allowedTools = getChannelAllowedTools(channelId);

      const intent = await classifyIntent(userMessage, allowedTools);

      if (intent.type === "cli") {
        const result = await execCLI(intent.tool, intent.args);
        const output = formatCLIOutput(result);

        const embed = new EmbedBuilder()
          .setTitle(`${intent.tool} → ${intent.command}`)
          .setDescription(output.slice(0, 4000))
          .setColor(result.success ? 0x00ff00 : 0xff0000)
          .setTimestamp();

        await message.reply({ embeds: [embed] });
      } else {
        const response = await generateChatResponse(userMessage);
        await message.reply({ content: response.slice(0, 2000) });
      }
    } catch (err) {
      console.error("Message handler error:", err);
      await message.reply({
        content: "Something went wrong processing that request.",
      });
    }
  });
}

export { loadChannelConfig, getChannelAllowedTools };
