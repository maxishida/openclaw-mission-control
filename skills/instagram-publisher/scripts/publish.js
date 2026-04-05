#!/usr/bin/env node
// Instagram Post Publisher
// Usage: node --env-file=.env publish.js --images "image.jpg[,slide2.jpg,...]" --caption "..." [--caption-file path.txt] [--dry-run]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { loadEnvFiles } from '../../shared/load-env.js';

const require = createRequire(import.meta.url);
const { createScheduledJob, normalizeDateString } = require('../../../scripts/social-scheduler/lib.js');

loadEnvFiles([resolve(process.cwd(), '.env.local'), resolve(process.cwd(), '.env')]);

export function parseArgs(argv) {
  const args = { images: [], caption: '', dryRun: false, force: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--images') {
      if (i + 1 < argv.length) args.images = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    } else if (argv[i] === '--caption') {
      if (i + 1 < argv.length) args.caption = argv[++i];
    } else if (argv[i] === '--caption-file') {
      if (i + 1 < argv.length) args.captionFile = argv[++i];
    } else if (argv[i] === '--dry-run') {
      args.dryRun = true;
    } else if (argv[i] === '--force') {
      args.force = true;
    } else if (argv[i] === '--publish-at' || argv[i] === '--schedule-at') {
      if (i + 1 < argv.length) args.publishAt = argv[++i];
    }
  }
  return args;
}

export async function uploadToCatbox(imagePath) {
  const absolutePath = resolve(imagePath);
  const fileBuffer = readFileSync(absolutePath);
  const fileName = absolutePath.split(/[\\/]/).pop();
  const blob = new Blob([fileBuffer], { type: 'image/jpeg' });
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', blob, fileName);
  const res = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    throw new Error(`catbox.moe upload failed [${res.status}]: ${await res.text()}`);
  }
  return (await res.text()).trim();
}

const IG_BASE = 'https://graph.facebook.com/v21.0';
const REQUIRED_PERMISSIONS = ['instagram_basic', 'instagram_content_publish'];
const PAGE_LINK_PERMISSIONS = ['pages_show_list', 'pages_read_engagement'];
const LEDGER_FILE = resolve(process.cwd(), '.context', 'instagram-publisher', 'publish-ledger.json');

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function readLedger() {
  if (!existsSync(LEDGER_FILE)) return { entries: [] };
  try {
    const parsed = JSON.parse(readFileSync(LEDGER_FILE, 'utf8'));
    return Array.isArray(parsed?.entries) ? parsed : { entries: [] };
  } catch {
    return { entries: [] };
  }
}

function writeLedger(ledger) {
  ensureDir(resolve(LEDGER_FILE, '..'));
  writeFileSync(LEDGER_FILE, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
}

function computeContentHash(images, caption) {
  const normalizedImages = images.map((imagePath) => resolve(imagePath)).join('|');
  return createHash('sha256')
    .update(`${normalizedImages}\n${caption.trim()}`)
    .digest('hex');
}

function findPublishedDuplicate(ledger, contentHash) {
  return ledger.entries.find((entry) => entry.contentHash === contentHash && entry.status === 'published');
}

function appendLedgerEntry(entry) {
  const ledger = readLedger();
  ledger.entries = [...ledger.entries, entry].slice(-200);
  writeLedger(ledger);
}

function sleep(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

function isRetryableInstagramError(error) {
  const message = String(error?.message || error || '');
  return (
    /\[(500|502|503|504)\]/.test(message)
    || /is_transient["']?\s*:\s*true/i.test(message)
    || /retry your request later/i.test(message)
    || /An unexpected error has occurred/i.test(message)
  );
}

async function withRetry(label, fn, attempts = 4, baseDelayMs = 2500) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableInstagramError(error) || attempt === attempts) {
        throw error;
      }
      const delayMs = baseDelayMs * attempt;
      console.log(`   Retry ${attempt}/${attempts - 1} for ${label} after transient Instagram error...`);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

export async function createChildContainer(userId, imageUrl, accessToken) {
  const params = new URLSearchParams({
    image_url: imageUrl,
    is_carousel_item: 'true',
    access_token: accessToken,
  });
  const res = await fetch(`${IG_BASE}/${userId}/media?${params}`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`createChildContainer failed [${res.status}]: ${await res.text()}`);
  }
  return (await res.json()).id;
}

export async function createImageContainer(userId, imageUrl, caption, accessToken) {
  const params = new URLSearchParams({
    image_url: imageUrl,
    caption,
    access_token: accessToken,
  });
  const res = await fetch(`${IG_BASE}/${userId}/media?${params}`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`createImageContainer failed [${res.status}]: ${await res.text()}`);
  }
  return (await res.json()).id;
}

export async function getContainerStatus(containerId, accessToken) {
  const params = new URLSearchParams({ fields: 'status_code', access_token: accessToken });
  const res = await fetch(`${IG_BASE}/${containerId}?${params}`);
  if (!res.ok) {
    throw new Error(`getContainerStatus failed [${res.status}]: ${await res.text()}`);
  }
  return (await res.json()).status_code;
}

export async function pollUntilFinished(containerId, accessToken, timeoutMs = 60_000, intervalMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await getContainerStatus(containerId, accessToken);
    if (status === 'FINISHED') return;
    if (status === 'ERROR') throw new Error(`Container ${containerId} entered ERROR state`);
    await sleep(intervalMs);
  }
  throw new Error(`Container ${containerId} timed out after ${timeoutMs}ms`);
}

export async function createCarouselContainer(userId, childIds, caption, accessToken) {
  const params = new URLSearchParams({
    media_type: 'CAROUSEL',
    children: childIds.join(','),
    caption,
    access_token: accessToken,
  });
  const res = await fetch(`${IG_BASE}/${userId}/media?${params}`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`createCarouselContainer failed [${res.status}]: ${await res.text()}`);
  }
  return (await res.json()).id;
}

export async function publishMedia(userId, containerId, accessToken) {
  const params = new URLSearchParams({ creation_id: containerId, access_token: accessToken });
  const res = await fetch(`${IG_BASE}/${userId}/media_publish?${params}`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`publishMedia failed [${res.status}]: ${await res.text()}`);
  }
  return (await res.json()).id;
}

export async function getPermalink(mediaId, accessToken) {
  const params = new URLSearchParams({ fields: 'permalink', access_token: accessToken });
  const res = await fetch(`${IG_BASE}/${mediaId}?${params}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.permalink ?? null;
}

export async function getGrantedPermissions(accessToken) {
  const params = new URLSearchParams({ access_token: accessToken });
  const res = await fetch(`${IG_BASE}/me/permissions?${params}`);
  if (!res.ok) {
    throw new Error(`getGrantedPermissions failed [${res.status}]: ${await res.text()}`);
  }
  const json = await res.json();
  return Array.isArray(json.data) ? json.data.filter((item) => item.status === 'granted') : [];
}

export async function getManagedAccounts(accessToken) {
  const params = new URLSearchParams({
    fields: 'id,name,instagram_business_account',
    access_token: accessToken,
  });
  const res = await fetch(`${IG_BASE}/me/accounts?${params}`);
  if (!res.ok) {
    throw new Error(`getManagedAccounts failed [${res.status}]: ${await res.text()}`);
  }
  const json = await res.json();
  return Array.isArray(json.data) ? json.data : [];
}

export async function verifyPublishAccess(userId, accessToken) {
  const grantedPermissions = await getGrantedPermissions(accessToken);
  const granted = new Set(grantedPermissions.map((item) => item.permission));
  const missingRequired = REQUIRED_PERMISSIONS.filter((permission) => !granted.has(permission));
  if (missingRequired.length) {
    throw new Error(`Instagram token is missing required permission(s): ${missingRequired.join(', ')}`);
  }

  const accounts = await getManagedAccounts(accessToken);
  if (!accounts.length) {
    const missingPageLink = PAGE_LINK_PERMISSIONS.filter((permission) => !granted.has(permission));
    const hint = missingPageLink.length
      ? ` Missing page-level permission(s): ${missingPageLink.join(', ')}.`
      : '';
    throw new Error(
      `Instagram token does not expose any Facebook Pages in /me/accounts. ` +
      `Use a token from the Facebook user that manages the Page connected to this Instagram account.${hint}`
    );
  }

  const matchedAccount = accounts.find((account) => account.instagram_business_account?.id === userId);
  if (!matchedAccount) {
    const knownAccounts = accounts
      .map((account) => {
        const igId = account.instagram_business_account?.id ?? 'none';
        return `${account.name} (page ${account.id}, instagram_business_account ${igId})`;
      })
      .join('; ');
    throw new Error(
      `INSTAGRAM_USER_ID=${userId} is not linked to any Facebook Page visible to this token. ` +
      `Available page links: ${knownAccounts}`
    );
  }

  return {
    pageId: matchedAccount.id,
    pageName: matchedAccount.name,
  };
}

async function main() {
  const { images, caption, captionFile, dryRun, force, publishAt } = parseArgs(process.argv);
  const finalCaption = captionFile ? readFileSync(resolve(captionFile), 'utf8').trim() : caption;
  const publishMode = images.length === 1 ? 'single-image' : 'carousel';

  if (!images.length) {
    throw new Error('--images is required (e.g. --images "image.jpg" or --images "slide1.jpg,slide2.jpg")');
  }
  if (!finalCaption) throw new Error('--caption or --caption-file is required');
  if (images.length > 10) {
    throw new Error(`Instagram supports 1-10 images per publish request (got ${images.length})`);
  }
  if (finalCaption.length > 2200) {
    throw new Error(`Caption exceeds Instagram's 2200-character limit (got ${finalCaption.length})`);
  }

  if (publishAt) {
    const normalizedPublishAt = normalizeDateString(publishAt);
    const commandArgs = process.argv.slice(2).filter((value, index, all) => {
      if (value === '--publish-at' || value === '--schedule-at') return false;
      if (index > 0 && (all[index - 1] === '--publish-at' || all[index - 1] === '--schedule-at')) return false;
      return true;
    });
    commandArgs.push('--run-due-job');
    const { job, jobFile } = createScheduledJob({
      platform: 'instagram',
      scheduleAt: normalizedPublishAt,
      command: process.execPath,
      args: [fileURLToPath(import.meta.url), ...commandArgs],
      cwd: process.cwd(),
      metadata: {
        mode: publishMode,
        image_count: images.length,
        caption_length: finalCaption.length,
      },
    });
    console.log('✅ Instagram publish scheduled');
    console.log(`   job_id: ${job.id}`);
    console.log(`   schedule_at: ${job.schedule_at}`);
    console.log(`   job_file: ${jobFile}`);
    return;
  }

  const { INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID } = process.env;
  if (!INSTAGRAM_ACCESS_TOKEN) throw new Error('INSTAGRAM_ACCESS_TOKEN is not set in environment');
  if (!INSTAGRAM_USER_ID) throw new Error('INSTAGRAM_USER_ID is not set in environment');

  const contentHash = computeContentHash(images, finalCaption);
  const ledger = readLedger();
  const duplicate = findPublishedDuplicate(ledger, contentHash);
  if (duplicate && !force) {
    throw new Error(
      `Este pacote ja foi publicado anteriormente em ${duplicate.permalink || duplicate.postId || duplicate.createdAt}. ` +
      'Use --force para publicar mesmo assim.'
    );
  }

  console.log('Verifying Instagram publish access...');
  const access = await verifyPublishAccess(INSTAGRAM_USER_ID, INSTAGRAM_ACCESS_TOKEN);
  console.log(`   Connected Page: ${access.pageName} (${access.pageId})`);
  console.log(`   Publish mode: ${publishMode}`);

  console.log(`Uploading ${images.length} image(s) to catbox.moe...`);
  const imageUrls = await Promise.all(images.map((imagePath) => uploadToCatbox(imagePath)));
  imageUrls.forEach((url, index) => console.log(`   [${index + 1}] ${url}`));

  let publishContainerId;

  if (publishMode === 'single-image') {
    console.log('\nCreating single-image container...');
    publishContainerId = await withRetry(
      'single-image container',
      () => createImageContainer(
        INSTAGRAM_USER_ID,
        imageUrls[0],
        finalCaption,
        INSTAGRAM_ACCESS_TOKEN
      )
    );
    console.log(`   Container ID: ${publishContainerId}`);

    console.log('\nWaiting for image container to finish processing...');
    await pollUntilFinished(publishContainerId, INSTAGRAM_ACCESS_TOKEN);
    console.log('   Image container ready.');
  } else {
    console.log('\nCreating Instagram media containers...');
    const childIds = [];
    for (const [index, url] of imageUrls.entries()) {
      const childId = await withRetry(
        `child container ${index + 1}`,
        () => createChildContainer(INSTAGRAM_USER_ID, url, INSTAGRAM_ACCESS_TOKEN)
      );
      childIds.push(childId);
      console.log(`   Child ${index + 1}: ${childId}`);
      await sleep(1200);
    }
    console.log(`   Container IDs: ${childIds.join(', ')}`);

    console.log('\nWaiting for containers to finish processing...');
    await Promise.all(childIds.map((id) => pollUntilFinished(id, INSTAGRAM_ACCESS_TOKEN)));
    console.log('   All containers ready.');

    console.log('\nCreating carousel container...');
    publishContainerId = await withRetry(
      'carousel container',
      () => createCarouselContainer(
        INSTAGRAM_USER_ID,
        childIds,
        finalCaption,
        INSTAGRAM_ACCESS_TOKEN
      )
    );
    await pollUntilFinished(publishContainerId, INSTAGRAM_ACCESS_TOKEN);
    console.log(`   Carousel container ID: ${publishContainerId}`);
  }

  if (dryRun) {
    appendLedgerEntry({
      contentHash,
      status: 'dry-run',
      publishMode,
      createdAt: new Date().toISOString(),
      imageCount: images.length,
      captionLength: finalCaption.length,
      pageId: access.pageId,
      pageName: access.pageName,
      containerId: publishContainerId,
    });
    console.log('\nDRY RUN complete. Skipping final publish call.');
    console.log(`   Container ready: ${publishContainerId}`);
    return;
  }

  console.log('\nPublishing to Instagram...');
  const postId = await withRetry(
    'media publish',
    () => publishMedia(INSTAGRAM_USER_ID, publishContainerId, INSTAGRAM_ACCESS_TOKEN)
  );
  const permalink = await getPermalink(postId, INSTAGRAM_ACCESS_TOKEN);
  console.log('\nPublished successfully.');
  console.log(`   Post ID: ${postId}`);
  if (permalink) console.log(`   URL: ${permalink}`);
  appendLedgerEntry({
    contentHash,
    status: 'published',
    publishMode,
    createdAt: new Date().toISOString(),
    imageCount: images.length,
    captionLength: finalCaption.length,
    pageId: access.pageId,
    pageName: access.pageName,
    containerId: publishContainerId,
    postId,
    permalink,
  });
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(`\nERROR: ${err.message}`);
    process.exit(1);
  });
}
