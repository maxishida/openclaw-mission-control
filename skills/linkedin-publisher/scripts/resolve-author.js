#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import {
  LINKEDIN_ME_URL,
  authHeaders,
  requireEnv,
  updateEnvLocal,
  fetchJson,
} from './shared.js';

async function main() {
  const accessToken = requireEnv('LINKEDIN_ACCESS_TOKEN');
  const { data } = await fetchJson(LINKEDIN_ME_URL, {
    method: 'GET',
    headers: authHeaders(accessToken, false),
  });

  if (!data?.id) {
    throw new Error('LinkedIn /v2/me did not return member id');
  }

  const authorUrn = `urn:li:person:${data.id}`;
  updateEnvLocal('LINKEDIN_AUTHOR_URN', authorUrn);
  console.log(`✅ LinkedIn author URN saved: ${authorUrn}`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(error => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
