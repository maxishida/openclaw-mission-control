#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  parseArgs,
  requireEnv,
  updateEnvLocal,
  LINKEDIN_TOKEN_URL,
} from './shared.js';

const execFileAsync = promisify(execFile);

async function main() {
  const args = parseArgs(process.argv);
  const code = args.code || requireEnv('LINKEDIN_OAUTH_CODE');
  const clientId = requireEnv('LINKEDIN_CLIENT_ID');
  const clientSecret = requireEnv('LINKEDIN_CLIENT_SECRET');
  const redirectUri = requireEnv('LINKEDIN_REDIRECT_URI');
  const codeVerifier = process.env.LINKEDIN_CODE_VERIFIER;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (codeVerifier) body.set('code_verifier', codeVerifier);

  const commandArgs = [
    '-sS',
    '-X', 'POST',
    LINKEDIN_TOKEN_URL,
    '-H', 'Content-Type: application/x-www-form-urlencoded',
    '--data-urlencode', 'grant_type=authorization_code',
    '--data-urlencode', `code=${code}`,
    '--data-urlencode', `redirect_uri=${redirectUri}`,
    '--data-urlencode', `client_id=${clientId}`,
    '--data-urlencode', `client_secret=${clientSecret}`,
  ];
  if (codeVerifier) {
    commandArgs.push('--data-urlencode', `code_verifier=${codeVerifier}`);
  }

  const { stdout } = await execFileAsync('curl', commandArgs, { maxBuffer: 1024 * 1024 });
  const data = JSON.parse(stdout);

  if (data?.error) {
    throw new Error(`LinkedIn token exchange error: ${JSON.stringify(data)}`);
  }

  if (!data?.access_token) {
    throw new Error('LinkedIn token exchange did not return access_token');
  }

  updateEnvLocal('LINKEDIN_ACCESS_TOKEN', data.access_token);
  console.log('✅ LinkedIn access token saved to .env.local');
  if (data.expires_in) console.log(`   expires_in: ${data.expires_in}`);
  if (data.refresh_token) {
    updateEnvLocal('LINKEDIN_REFRESH_TOKEN', data.refresh_token);
    console.log('   refresh_token also saved to .env.local');
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(error => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
