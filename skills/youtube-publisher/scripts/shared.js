#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { loadEnvFiles } = require("../../../scripts/shared/load-env.cjs");

loadEnvFiles([path.resolve(process.cwd(), ".env.local"), path.resolve(process.cwd(), ".env")]);

const execFileAsync = promisify(execFile);

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const YOUTUBE_UPLOAD_BASE = "https://www.googleapis.com/upload/youtube/v3/videos";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function parseBoolean(value, defaultValue = false) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return defaultValue;
}

function parseCsv(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function updateEnvLocal(key, value) {
  const envPath = path.resolve(process.cwd(), ".env.local");
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const line = `${key}="${String(value).replaceAll('"', '\\"')}"`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const next = pattern.test(current) ? current.replace(pattern, line) : `${current.trimEnd()}\n${line}\n`;
  fs.writeFileSync(envPath, next.startsWith("\n") ? next.slice(1) : next, "utf8");
}

function extractJsonBlockFromMarkdown(markdown) {
  const matches = markdown.matchAll(/```json\s*([\s\S]*?)```/g);
  for (const match of matches) {
    try {
      return JSON.parse(match[1]);
    } catch {
      // ignore malformed blocks and keep scanning
    }
  }
  return null;
}

function loadSpecFile(filePath) {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  if (absolutePath.toLowerCase().endsWith(".json")) {
    return JSON.parse(raw);
  }

  const parsed = extractJsonBlockFromMarkdown(raw);
  if (!parsed) {
    throw new Error(`Spec sem bloco json valido: ${absolutePath}`);
  }
  return parsed;
}

function writeJsonFile(filePath, value) {
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function execCurl(args, options = {}) {
  const { stdout, stderr } = await execFileAsync("curl", ["-sS", ...args], {
    maxBuffer: 1024 * 1024 * 20,
    ...options,
  });
  return `${stdout}${stderr}`;
}

function parseCurlHttpResponse(raw) {
  const normalized = raw.replace(/\r\n/g, "\n");
  const blocks = normalized
    .split(/(?=^HTTP\/[0-9.]+\s+\d{3}.*$)/gm)
    .map((part) => part.trim())
    .filter(Boolean);

  const lastBlock = blocks.at(-1) ?? normalized.trim();
  const splitMatch = lastBlock.match(/\n\s*\n/);
  const splitIndex = splitMatch ? splitMatch.index : -1;
  const separatorLength = splitMatch ? splitMatch[0].length : 0;
  const rawHeaders = splitIndex >= 0 ? lastBlock.slice(0, splitIndex) : lastBlock;
  const rawBody = splitIndex >= 0 ? lastBlock.slice(splitIndex + separatorLength).trim() : "";
  const statusLine = rawHeaders.split("\n").find((line) => line.startsWith("HTTP/")) ?? "";
  const statusMatch = statusLine.match(/\s(\d{3})\s/);
  const statusCode = statusMatch ? Number(statusMatch[1]) : 0;
  const headers = Object.fromEntries(
    rawHeaders
      .split("\n")
      .slice(1)
      .map((line) => {
        const separatorIndex = line.indexOf(":");
        if (separatorIndex === -1) return null;
        return [line.slice(0, separatorIndex).trim().toLowerCase(), line.slice(separatorIndex + 1).trim()];
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

async function curlJson(url, { method = "GET", headers = {}, body } = {}) {
  const args = ["-D", "-", "-X", method, url];
  for (const [key, value] of Object.entries(headers)) {
    args.push("-H", `${key}: ${value}`);
  }
  if (body !== undefined) {
    args.push("--data-raw", typeof body === "string" ? body : JSON.stringify(body));
  }

  const parsed = parseCurlHttpResponse(await execCurl(args));
  if (parsed.statusCode < 200 || parsed.statusCode >= 300) {
    throw new Error(
      `${url} failed [${parsed.statusCode}]: ${typeof parsed.data === "string" ? parsed.data : JSON.stringify(parsed.data)}`
    );
  }
  return parsed;
}

async function curlUploadBinary(uploadUrl, filePath, contentType, headers = {}) {
  const args = ["-D", "-", "-X", "PUT", uploadUrl, "-H", `Content-Type: ${contentType}`];
  for (const [key, value] of Object.entries(headers)) {
    args.push("-H", `${key}: ${value}`);
  }
  args.push("--data-binary", `@${path.resolve(filePath)}`);

  const parsed = parseCurlHttpResponse(await execCurl(args));
  if (parsed.statusCode < 200 || parsed.statusCode >= 300) {
    throw new Error(
      `Upload failed [${parsed.statusCode}]: ${typeof parsed.data === "string" ? parsed.data : JSON.stringify(parsed.data)}`
    );
  }
  return parsed;
}

function detectVideoMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".webm") return "video/webm";
  if (extension === ".mkv") return "video/x-matroska";
  if (extension === ".m4v") return "video/x-m4v";
  return "video/mp4";
}

function normalizePrivacyStatus(value) {
  const normalized = String(value || "private").trim().toLowerCase();
  if (!["private", "public", "unlisted"].includes(normalized)) {
    throw new Error(`Invalid privacy status: ${value}`);
  }
  return normalized;
}

module.exports = {
  GOOGLE_OAUTH_TOKEN_URL,
  YOUTUBE_API_BASE,
  YOUTUBE_UPLOAD_BASE,
  curlJson,
  curlUploadBinary,
  detectVideoMimeType,
  loadSpecFile,
  normalizePrivacyStatus,
  parseArgs,
  parseBoolean,
  parseCsv,
  requireEnv,
  updateEnvLocal,
  writeJsonFile,
};
