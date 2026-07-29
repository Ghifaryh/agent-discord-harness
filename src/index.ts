import "dotenv/config";
import { Client, GatewayIntentBits, Events } from "discord.js";
import { initMessageHandler } from "./handlers/message.js";
import { startWebhookServer } from "./handlers/webhook.js";

const required = ["DISCORD_TOKEN", "AI_PROVIDER_BASE_URL", "AI_PROVIDER_API_KEY"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(`Serving ${readyClient.guilds.cache.size} guild(s)`);

  readyClient.user.setActivity("for mentions | DM me anything", {
    type: 0,
  });
});

initMessageHandler(client);
startWebhookServer(client);

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is required");
  process.exit(1);
}

client.login(token).catch((err) => {
  console.error("Failed to login:", err);
  process.exit(1);
});
