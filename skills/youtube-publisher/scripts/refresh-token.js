#!/usr/bin/env node

const {
  GOOGLE_OAUTH_TOKEN_URL,
  parseArgs,
  requireEnv,
  updateEnvLocal,
} = require("./shared.js");

async function main() {
  const args = parseArgs(process.argv);
  const clientId = args["client-id"] || requireEnv("YOUTUBE_CLIENT_ID");
  const clientSecret = args["client-secret"] || requireEnv("YOUTUBE_CLIENT_SECRET");
  const refreshToken = args["refresh-token"] || requireEnv("YOUTUBE_REFRESH_TOKEN");

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  if (!data.access_token) {
    throw new Error("Refresh flow returned no access_token.");
  }

  updateEnvLocal("YOUTUBE_ACCESS_TOKEN", data.access_token);

  console.log("✅ YouTube access token renovado");
  console.log(`   expires_in: ${data.expires_in || "n/a"}`);
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
