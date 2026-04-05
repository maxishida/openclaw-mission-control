#!/usr/bin/env node

const path = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");
const {
  GOOGLE_OAUTH_TOKEN_URL,
  loadSpecFile,
  parseArgs,
  parseCsv,
  requireEnv,
  updateEnvLocal,
  writeJsonFile,
} = require("../../skills/youtube-publisher/scripts/shared.js");
const {
  buildVideosFromSpec,
  publishBatch,
  readExistingResults,
} = require("../../skills/youtube-publisher/scripts/publish.js");

const DEFAULT_RETRY_TOKENS = [
  "uploadlimitexceeded",
  "quotaexceeded",
  "ratelimitexceeded",
  "backenderror",
  "internalerror",
  "temporarily unavailable",
  "503",
  "502",
  "500",
];

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/youtube-clips/retry-publish.js --spec-file path/to/youtube-publish-batch.json [--output-file path/to/result.json] [--interval-minutes 60] [--max-attempts 48]",
      "",
      "Retries YouTube publish for pending videos only, refreshing the token before each attempt.",
    ].join("\n")
  );
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function resolveDefaultOutputFile(specFile) {
  return path.join(path.dirname(specFile), "publish-result-live.json");
}

function resolveDefaultStateFile(outputFile) {
  return path.resolve(
    process.cwd(),
    ".context",
    "youtube-retry",
    `${path.basename(outputFile, path.extname(outputFile))}.state.json`
  );
}

function resolveRetryTokens(argValue) {
  const tokens = parseCsv(argValue).map((entry) => entry.toLowerCase());
  return tokens.length > 0 ? tokens : DEFAULT_RETRY_TOKENS;
}

function getProgress(videos, outputFile) {
  const existingResults = readExistingResults(outputFile);
  const publishedIds = new Set(existingResults.map((entry) => String(entry?.id || "")).filter(Boolean));
  const completed = videos.filter((video) => publishedIds.has(String(video.id))).length;
  return {
    total: videos.length,
    completed,
    pending: Math.max(0, videos.length - completed),
    results: existingResults,
  };
}

function writeState(stateFile, payload) {
  writeJsonFile(stateFile, {
    updated_at: new Date().toISOString(),
    ...payload,
  });
}

function isRetryableError(error, retryTokens) {
  const message = String(error?.message || error || "").toLowerCase();
  return retryTokens.some((token) => message.includes(token));
}

async function refreshAccessToken() {
  const clientId = requireEnv("YOUTUBE_CLIENT_ID");
  const clientSecret = requireEnv("YOUTUBE_CLIENT_SECRET");
  const refreshToken = requireEnv("YOUTUBE_REFRESH_TOKEN");

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
  if (!response.ok || !data.access_token) {
    throw new Error(
      `token refresh failed: ${typeof data === "string" ? data : JSON.stringify(data)}`
    );
  }

  updateEnvLocal("YOUTUBE_ACCESS_TOKEN", data.access_token);
  process.env.YOUTUBE_ACCESS_TOKEN = data.access_token;
  return data.access_token;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || args.h) {
    printUsage();
    process.exit(0);
  }

  if (!args["spec-file"]) {
    throw new Error("--spec-file is required");
  }

  const specFile = path.resolve(args["spec-file"]);
  const outputFile = args["output-file"]
    ? path.resolve(args["output-file"])
    : resolveDefaultOutputFile(specFile);
  const stateFile = args["state-file"]
    ? path.resolve(args["state-file"])
    : resolveDefaultStateFile(outputFile);
  const intervalMinutes = parsePositiveInt(args["interval-minutes"], 60);
  const maxAttempts = parsePositiveInt(args["max-attempts"], 48);
  const retryTokens = resolveRetryTokens(args["retry-on"]);
  const spec = loadSpecFile(specFile);
  const videos = buildVideosFromSpec(spec);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const progressBefore = getProgress(videos, outputFile);
    if (progressBefore.pending === 0) {
      writeState(stateFile, {
        status: "completed",
        attempt: attempt - 1,
        total: progressBefore.total,
        completed: progressBefore.completed,
        pending: 0,
        output_file: outputFile,
      });
      console.log("✅ Nenhum video pendente para publicar");
      return;
    }

    writeState(stateFile, {
      status: "running",
      attempt,
      total: progressBefore.total,
      completed: progressBefore.completed,
      pending: progressBefore.pending,
      output_file: outputFile,
      spec_file: specFile,
    });
    console.log(
      `Tentativa ${attempt}/${maxAttempts}: ${progressBefore.completed}/${progressBefore.total} publicados, ${progressBefore.pending} pendentes`
    );

    try {
      const accessToken = await refreshAccessToken();
      const summary = await publishBatch(accessToken, videos, {
        outputFile,
        resume: true,
      });
      const progressAfter = getProgress(videos, outputFile);

      writeState(stateFile, {
        status: progressAfter.pending === 0 ? "completed" : "running",
        attempt,
        total: progressAfter.total,
        completed: progressAfter.completed,
        pending: progressAfter.pending,
        published_now: summary.publishedNow,
        skipped_existing: summary.skippedExisting,
        output_file: outputFile,
      });

      if (progressAfter.pending === 0) {
        console.log("✅ Lote completo publicado");
        return;
      }
    } catch (error) {
      const retryable = isRetryableError(error, retryTokens);
      const progressAfterError = getProgress(videos, outputFile);

      if (!retryable || attempt >= maxAttempts) {
        writeState(stateFile, {
          status: "failed",
          attempt,
          total: progressAfterError.total,
          completed: progressAfterError.completed,
          pending: progressAfterError.pending,
          output_file: outputFile,
          last_error: String(error.message || error),
          retryable,
        });
        throw error;
      }

      const nextRetryAt = new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString();
      writeState(stateFile, {
        status: "waiting",
        attempt,
        total: progressAfterError.total,
        completed: progressAfterError.completed,
        pending: progressAfterError.pending,
        output_file: outputFile,
        last_error: String(error.message || error),
        retryable: true,
        next_retry_at: nextRetryAt,
      });

      console.error(`⚠️ ${error.message}`);
      console.error(`⏳ Novo retry agendado para ${nextRetryAt}`);
      await sleep(intervalMinutes * 60 * 1000);
    }
  }
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
