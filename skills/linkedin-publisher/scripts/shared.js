#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadEnvFiles } from '../../shared/load-env.js';

loadEnvFiles([resolve(process.cwd(), '.env.local'), resolve(process.cwd(), '.env')]);

export const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
export const LINKEDIN_POSTS_URL = 'https://api.linkedin.com/rest/posts';
export const LINKEDIN_IMAGES_URL = 'https://api.linkedin.com/rest/images';
export const LINKEDIN_ME_URL = 'https://api.linkedin.com/v2/me';
const execFileAsync = promisify(execFile);

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

export function getVersion() {
  return process.env.LINKEDIN_API_VERSION || '202603';
}

export function authHeaders(accessToken, json = true) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'X-Restli-Protocol-Version': '2.0.0',
    'Linkedin-Version': getVersion(),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

export function parsePostText(filePath) {
  const raw = readFileSync(resolve(filePath), 'utf8');
  const lines = raw.split('\n');
  const postIndex = lines.findIndex(line => line.trim() === '## Post');
  const hashtagsIndex = lines.findIndex(line => line.trim() === '## Hashtags');
  if (postIndex === -1 || hashtagsIndex === -1 || hashtagsIndex <= postIndex) {
    throw new Error('Post file must contain "## Post" and "## Hashtags" sections');
  }
  const post = lines.slice(postIndex + 1, hashtagsIndex).join('\n').trim();
  const hashtags = lines.slice(hashtagsIndex + 1).join('\n').trim();
  return `${post}\n\n${hashtags}`.trim();
}

export function updateEnvLocal(key, value) {
  const envPath = resolve(process.cwd(), '.env.local');
  const current = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const line = `${key}="${String(value).replaceAll('"', '\\"')}"`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  const next = pattern.test(current) ? current.replace(pattern, line) : `${current.trimEnd()}\n${line}\n`;
  writeFileSync(envPath, next.endsWith('\n') ? next : `${next}\n`, 'utf8');
}

export async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    throw new Error(`${url} failed [${response.status}]: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return { response, data };
}

export function detectMimeType(filePath) {
  const extension = extname(filePath).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.webp') return 'image/webp';
  return 'image/jpeg';
}

export function parseOptionalJsonFile(filePath) {
  if (!filePath) return null;
  return JSON.parse(readFileSync(resolve(filePath), 'utf8'));
}

export async function execCurl(args, options = {}) {
  const { stdout, stderr } = await execFileAsync('curl', ['-sS', ...args], {
    maxBuffer: 1024 * 1024 * 20,
    ...options,
  });
  return `${stdout}${stderr}`;
}

export function parseCurlHttpResponse(raw) {
  const normalized = raw.replace(/\r\n/g, '\n');
  const blocks = normalized
    .split(/(?=^HTTP\/[0-9.]+\s+\d{3}.*$)/gm)
    .map((part) => part.trim())
    .filter(Boolean);

  const lastBlock = blocks.at(-1) ?? normalized.trim();
  const separator = lastBlock.includes('\n\n') ? '\n\n' : '\n';
  const splitIndex = lastBlock.indexOf(separator);
  const rawHeaders = splitIndex >= 0 ? lastBlock.slice(0, splitIndex) : lastBlock;
  const rawBody = splitIndex >= 0 ? lastBlock.slice(splitIndex + separator.length).trim() : '';
  const statusLine = rawHeaders.split('\n').find((line) => line.startsWith('HTTP/')) ?? '';
  const statusMatch = statusLine.match(/\s(\d{3})\s/);
  const statusCode = statusMatch ? Number(statusMatch[1]) : 0;
  const headers = Object.fromEntries(
    rawHeaders
      .split('\n')
      .slice(1)
      .map((line) => {
        const index = line.indexOf(':');
        if (index === -1) return null;
        return [line.slice(0, index).trim().toLowerCase(), line.slice(index + 1).trim()];
      })
      .filter(Boolean)
  );

  let data = rawBody;
  try {
    data = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    data = rawBody;
  }

  return { statusCode, headers, rawHeaders, rawBody, data };
}

export async function curlJson(url, { method = 'GET', headers = {}, body } = {}) {
  const args = ['-D', '-', '-X', method, url];
  for (const [key, value] of Object.entries(headers)) {
    args.push('-H', `${key}: ${value}`);
  }
  if (body !== undefined) {
    args.push('--data-raw', typeof body === 'string' ? body : JSON.stringify(body));
  }

  const parsed = parseCurlHttpResponse(await execCurl(args));
  if (parsed.statusCode < 200 || parsed.statusCode >= 300) {
    throw new Error(`${url} failed [${parsed.statusCode}]: ${typeof parsed.data === 'string' ? parsed.data : JSON.stringify(parsed.data)}`);
  }
  return parsed;
}

export async function curlUpload(uploadUrl, filePath, contentType) {
  const parsed = parseCurlHttpResponse(await execCurl([
    '-D', '-',
    '-X', 'PUT',
    uploadUrl,
    '-H', `Content-Type: ${contentType}`,
    '--upload-file', resolve(filePath),
  ]));

  if (parsed.statusCode < 200 || parsed.statusCode >= 300) {
    throw new Error(`Upload failed [${parsed.statusCode}]: ${parsed.rawBody || parsed.rawHeaders}`);
  }
  return parsed;
}
