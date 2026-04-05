const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const ffmpegStatic = require("ffmpeg-static");

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]);
const TIMED_TEXT_EXTENSIONS = new Set([".vtt", ".srt"]);

function repoRoot() {
  return process.cwd();
}

function resolveToolsDir() {
  return path.resolve(repoRoot(), ".context", "tools", "youtube-clips");
}

function getYtDlpBinaryName() {
  return process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
}

function getLocalYtDlpPath() {
  return path.join(resolveToolsDir(), getYtDlpBinaryName());
}

function getFfmpegPath() {
  if (ffmpegStatic && fileExists(ffmpegStatic)) {
    return ffmpegStatic;
  }
  return "ffmpeg";
}

function resolveSquadDir(squadName = "youtube-viral-clips") {
  return path.resolve(repoRoot(), "squads", squadName);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function relativeToRepo(filePath) {
  return path.relative(repoRoot(), filePath).replace(/\\/g, "/");
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function extractYouTubeVideoId(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) {
    return raw;
  }

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.replace(/^\//, "").split("/")[0];
      return id || null;
    }

    if (host.endsWith("youtube.com") || host === "m.youtube.com") {
      if (url.pathname === "/watch") {
        return url.searchParams.get("v");
      }

      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") {
        return parts[1] || null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeYouTubeUrl(input) {
  const videoId = extractYouTubeVideoId(input);
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

function ensureExecutable(filePath) {
  if (process.platform === "win32" || !fileExists(filePath)) {
    return;
  }
  try {
    fs.chmodSync(filePath, 0o755);
  } catch {
    // Ignore chmod errors and let the actual spawn probe fail with a useful message.
  }
}

function ensureBinary(commandPath, installHint) {
  if (!commandPath) {
    throw new Error(installHint);
  }

  const isPathLike = /[\\/]/.test(String(commandPath)) || path.isAbsolute(String(commandPath));
  if (isPathLike && !fileExists(commandPath)) {
    throw new Error(`${relativeToRepo(commandPath)} nao encontrado. ${installHint}`);
  }

  if (isPathLike) {
    ensureExecutable(commandPath);
  }

  const versionArg = path.basename(commandPath).toLowerCase().includes("ffmpeg")
    ? "-version"
    : "--version";
  const probe = spawnSync(commandPath, [versionArg], { encoding: "utf8" });
  if (!probe.error && probe.status === 0) {
    return;
  }

  if (probe.error && probe.error.code === "ENOENT") {
    const label = isPathLike ? relativeToRepo(commandPath) : String(commandPath);
    throw new Error(`${label} nao encontrado. ${installHint}`);
  }

  if (probe.status === 0) {
    return;
  }

  const detail = [probe.stdout, probe.stderr].filter(Boolean).join("\n").trim();
  const label = isPathLike ? relativeToRepo(commandPath) : String(commandPath);
  throw new Error(
    `${label} nao passou na validacao${detail ? `:\n${detail}` : ""}. ${installHint}`
  );
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: options.stdio || "pipe",
    cwd: options.cwd || repoRoot(),
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error(`${command} nao encontrado`);
    }
    throw result.error;
  }

  if (result.status !== 0 && !options.allowFailure) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} falhou com codigo ${result.status}${detail ? `\n${detail}` : ""}`);
  }

  return result;
}

function parseTimestampToSeconds(value) {
  if (typeof value === "number") {
    return value;
  }

  const raw = String(value || "").trim();
  if (!raw) {
    return NaN;
  }

  if (/^\d+(\.\d+)?$/.test(raw)) {
    return Number(raw);
  }

  const cleaned = raw.replace(",", ".");
  const parts = cleaned.split(":").map(Number);
  if (parts.some((part) => Number.isNaN(part))) {
    return NaN;
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return NaN;
}

function formatSecondsForHumans(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatSecondsForFfmpeg(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  return safe.toFixed(3);
}

function listFiles(dirPath) {
  if (!fileExists(dirPath)) return [];
  return fs.readdirSync(dirPath).map((name) => path.join(dirPath, name));
}

function pickTranscriptFile(baseStem) {
  const dirPath = path.dirname(baseStem);
  const prefix = `${path.basename(baseStem)}.`;
  const candidates = listFiles(dirPath)
    .filter((filePath) => {
      const base = path.basename(filePath);
      return base.startsWith(prefix) && TIMED_TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
    })
    .sort((left, right) => scoreTranscriptCandidate(right) - scoreTranscriptCandidate(left));
  return candidates[0] || null;
}

function scoreTranscriptCandidate(filePath) {
  const name = path.basename(filePath).toLowerCase();
  let score = 0;
  if (name.includes(".en.")) score += 30;
  if (name.includes(".pt-br.")) score += 26;
  if (name.includes(".pt.")) score += 24;
  if (name.includes(".en-orig.")) score += 22;
  if (name.includes(".orig.")) score += 20;
  if (name.endsWith(".vtt")) score += 5;
  if (name.includes(".live_chat.")) score -= 100;
  return score;
}

function parseTimedTextFile(filePath) {
  const raw = readText(filePath).replace(/^\uFEFF/, "");
  if (filePath.toLowerCase().endsWith(".srt")) {
    return parseSrt(raw);
  }
  return parseVtt(raw);
}

function parseVtt(raw) {
  const lines = raw.replace(/\r/g, "").split("\n");
  const segments = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line || line === "WEBVTT" || line.startsWith("NOTE") || line.startsWith("Kind:") || line.startsWith("Language:")) {
      index += 1;
      continue;
    }

    if (line.includes("-->")) {
      const [startRaw, endRaw] = line.split("-->").map((part) => part.trim().split(" ")[0]);
      const textLines = [];
      index += 1;
      while (index < lines.length && lines[index].trim()) {
        if (!lines[index].trim().startsWith("<")) {
          textLines.push(lines[index].trim());
        }
        index += 1;
      }
      const text = cleanTranscriptText(textLines.join(" "));
      if (text) {
        segments.push({
          start: parseTimestampToSeconds(startRaw),
          end: parseTimestampToSeconds(endRaw),
          text,
        });
      }
      continue;
    }

    index += 1;
  }

  return mergeTranscriptSegments(segments);
}

function parseSrt(raw) {
  const blocks = raw.replace(/\r/g, "").split("\n\n");
  const segments = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const timingLine = lines.find((line) => line.includes("-->"));
    if (!timingLine) continue;
    const [startRaw, endRaw] = timingLine.split("-->").map((part) => part.trim().split(" ")[0]);
    const textStart = lines.indexOf(timingLine) + 1;
    const text = cleanTranscriptText(lines.slice(textStart).join(" "));
    if (text) {
      segments.push({
        start: parseTimestampToSeconds(startRaw),
        end: parseTimestampToSeconds(endRaw),
        text,
      });
    }
  }

  return mergeTranscriptSegments(segments);
}

function cleanTranscriptText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeTranscriptSegments(segments) {
  const merged = [];

  for (const segment of segments) {
    if (!segment.text || Number.isNaN(segment.start) || Number.isNaN(segment.end)) {
      continue;
    }

    const previous = merged[merged.length - 1];
    if (previous && previous.text === segment.text && Math.abs(previous.end - segment.start) < 0.2) {
      previous.end = segment.end;
      continue;
    }

    merged.push(segment);
  }

  return merged;
}

function transcriptToPlainText(segments) {
  return segments.map((segment) => segment.text).join("\n");
}

function transcriptToMarkdown(segments) {
  return segments
    .map((segment) => `- [${formatSecondsForHumans(segment.start)} - ${formatSecondsForHumans(segment.end)}] ${segment.text}`)
    .join("\n");
}

function findNewestSourceVideo(sourceDir, preferredStem = null) {
  const files = listFiles(sourceDir)
    .filter((filePath) => VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase()))
    .map((filePath) => ({
      filePath,
      stat: fs.statSync(filePath),
      preferred: preferredStem ? path.basename(filePath).startsWith(path.basename(preferredStem)) : false,
    }))
    .sort((left, right) => {
      if (left.preferred !== right.preferred) {
        return left.preferred ? -1 : 1;
      }
      return right.stat.mtimeMs - left.stat.mtimeMs;
    });

  return files[0]?.filePath || null;
}

function extractJsonBlockFromMarkdown(markdown) {
  const matches = markdown.matchAll(/```json\s*([\s\S]*?)```/g);
  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch {
      // Ignore malformed blocks and keep scanning.
    }
  }
  return null;
}

module.exports = {
  ensureBinary,
  ensureDir,
  extractJsonBlockFromMarkdown,
  extractYouTubeVideoId,
  fileExists,
  findNewestSourceVideo,
  getFfmpegPath,
  getLocalYtDlpPath,
  formatSecondsForFfmpeg,
  formatSecondsForHumans,
  normalizeYouTubeUrl,
  parseTimedTextFile,
  parseTimestampToSeconds,
  pickTranscriptFile,
  readText,
  relativeToRepo,
  resolveToolsDir,
  resolveSquadDir,
  runCommand,
  slugify,
  transcriptToMarkdown,
  transcriptToPlainText,
  writeJson,
  writeText,
};
