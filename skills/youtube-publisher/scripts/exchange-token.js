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
  const redirectUri = args["redirect-uri"] || requireEnv("YOUTUBE_REDIRECT_URI");
  const code = args.code || requireEnv("YOUTUBE_OAUTH_CODE");

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  if (!data.access_token) {
    throw new Error("OAuth exchange returned no access_token.");
  }

  updateEnvLocal("YOUTUBE_ACCESS_TOKEN", data.access_token);
  if (data.refresh_token) {
    updateEnvLocal("YOUTUBE_REFRESH_TOKEN", data.refresh_token);
  }

  console.log("✅ YouTube token exchange concluido");
  console.log(`   expires_in: ${data.expires_in || "n/a"}`);
  console.log(`   refresh_token: ${data.refresh_token ? "stored in .env.local" : "not returned"}`);
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
