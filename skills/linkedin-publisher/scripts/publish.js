#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';
import {
  LINKEDIN_IMAGES_URL,
  LINKEDIN_POSTS_URL,
  parseArgs,
  requireEnv,
  parsePostText,
  parseOptionalJsonFile,
  detectMimeType,
  authHeaders,
  curlJson,
  curlUpload,
} from './shared.js';

function buildBasePayload(author, commentary) {
  return {
    author,
    commentary,
    visibility: process.env.LINKEDIN_VISIBILITY || 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };
}

function buildTextPayload(author, commentary) {
  return buildBasePayload(author, commentary);
}

function buildMultiImagePayload(author, commentary, images) {
  return {
    ...buildBasePayload(author, commentary),
    content: {
      multiImage: {
        images,
      },
    },
  };
}

async function initializeImageUpload(accessToken, owner) {
  const parsed = await curlJson(`${LINKEDIN_IMAGES_URL}?action=initializeUpload`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: {
      initializeUploadRequest: {
        owner,
      },
    },
  });
  const value = parsed.data?.value;
  if (!value?.image || !value?.uploadUrl) {
    throw new Error(`initializeUpload returned incomplete response: ${JSON.stringify(parsed.data)}`);
  }
  return value;
}

async function tryWaitForImage(accessToken, imageUrn) {
  try {
    await curlJson(`${LINKEDIN_IMAGES_URL}/${encodeURIComponent(imageUrn)}`, {
      method: 'GET',
      headers: authHeaders(accessToken, false),
    });
    return;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1800));
  }
}

async function uploadLinkedInImage(accessToken, owner, imagePath, altText) {
  const initialized = await initializeImageUpload(accessToken, owner);
  await curlUpload(initialized.uploadUrl, imagePath, detectMimeType(imagePath));
  await tryWaitForImage(accessToken, initialized.image);
  return {
    id: initialized.image,
    altText: altText || `Carousel slide ${basename(imagePath)}`,
  };
}

function parseImageList(imagesArg) {
  if (!imagesArg) return [];
  return imagesArg.split(',').map((entry) => entry.trim()).filter(Boolean);
}

async function main() {
  const args = parseArgs(process.argv);
  const textFile = args['text-file'];
  const images = parseImageList(args.images);
  if (!textFile && images.length === 0) {
    throw new Error('Provide --text-file for text posts, or --text-file plus --images for carousel posts');
  }

  const accessToken = requireEnv('LINKEDIN_ACCESS_TOKEN');
  const author = requireEnv('LINKEDIN_AUTHOR_URN');
  const commentary = textFile ? parsePostText(textFile) : String(args.commentary || '').trim();
  const altTexts = parseOptionalJsonFile(args['alt-texts-file']);

  if (commentary.length > 3000) {
    throw new Error(`LinkedIn commentary exceeds 3000 characters (${commentary.length})`);
  }

  if (images.length === 1 || images.length > 20) {
    throw new Error(`LinkedIn multiImage posts require 2-20 images (got ${images.length})`);
  }

  const previewPayload = images.length > 0
    ? buildMultiImagePayload(
        author,
        commentary,
        images.map((imagePath, index) => ({
          id: `pending-upload:${basename(imagePath)}`,
          altText: altTexts?.[index] || altTexts?.[basename(imagePath)] || `Carousel slide ${index + 1}`,
        }))
      )
    : buildTextPayload(author, commentary);

  if (args['dry-run']) {
    console.log('✅ DRY RUN — no live publish executed');
    console.log(`   author: ${author}`);
    console.log(`   visibility: ${previewPayload.visibility}`);
    console.log(`   commentary_length: ${commentary.length}`);
    if (images.length > 0) {
      console.log(`   mode: multiImage`);
      console.log(`   image_count: ${images.length}`);
      images.forEach((imagePath, index) => {
        console.log(`   [${index + 1}] ${imagePath}`);
      });
    } else {
      console.log('   mode: text');
    }
    console.log('   preview:');
    console.log(commentary);
    return;
  }

  let payload;
  if (images.length > 0) {
    const uploadedImages = [];
    for (let index = 0; index < images.length; index += 1) {
      const imagePath = images[index];
      const altText = altTexts?.[index] || altTexts?.[basename(imagePath)] || `Carousel slide ${index + 1}`;
      const uploaded = await uploadLinkedInImage(accessToken, author, imagePath, altText);
      uploadedImages.push(uploaded);
    }
    payload = buildMultiImagePayload(author, commentary, uploadedImages);
  } else {
    payload = buildTextPayload(author, commentary);
  }

  const parsed = await curlJson(LINKEDIN_POSTS_URL, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: payload,
  });

  const restliLine = parsed.headers['x-restli-id'];
  const postId = restliLine ? restliLine.trim() : '';
  console.log(images.length > 0 ? '✅ LinkedIn carousel published' : '✅ LinkedIn post published');
  if (postId) console.log(`   post_id: ${postId}`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(error => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
