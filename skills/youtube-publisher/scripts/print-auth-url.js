#!/usr/bin/env node

const { parseArgs, requireEnv } = require("./shared.js");

function main() {
  const args = parseArgs(process.argv);
  const clientId = requireEnv("YOUTUBE_CLIENT_ID");
  const redirectUri = requireEnv("YOUTUBE_REDIRECT_URI");
  const scopes = args.scopes || process.env.YOUTUBE_SCOPES || "https://www.googleapis.com/auth/youtube";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
  });

  if (args.state) {
    params.set("state", args.state);
  }

  console.log(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

try {
  main();
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}
