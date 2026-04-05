#!/usr/bin/env node

const {
  YOUTUBE_API_BASE,
  curlJson,
  requireEnv,
  updateEnvLocal,
} = require("./shared.js");

async function main() {
  const accessToken = requireEnv("YOUTUBE_ACCESS_TOKEN");

  const parsed = await curlJson(`${YOUTUBE_API_BASE}/channels?part=id,snippet&mine=true`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  const channel = parsed.data?.items?.[0];
  if (!channel?.id) {
    throw new Error("Nenhum canal autenticado foi retornado pela API do YouTube.");
  }

  updateEnvLocal("YOUTUBE_CHANNEL_ID", channel.id);
  if (channel.snippet?.title) {
    updateEnvLocal("YOUTUBE_CHANNEL_TITLE", channel.snippet.title);
  }

  console.log("✅ Canal resolvido");
  console.log(`   channel_id: ${channel.id}`);
  console.log(`   title: ${channel.snippet?.title || "n/a"}`);
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
