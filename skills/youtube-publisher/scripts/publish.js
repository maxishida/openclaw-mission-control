#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
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
  writeJsonFile,
} = require("./shared.js");
const { createScheduledJob, normalizeDateString } = require("../../../scripts/social-scheduler/lib.js");

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node skills/youtube-publisher/scripts/publish.js --spec-file path/to/youtube-publish-batch.json [--dry-run] [--output-file path/to/result.json]",
      "  node skills/youtube-publisher/scripts/publish.js --video-file path/to/video.mp4 --title \"My short\" [--description \"...\"] [--tags ai,founders] [--privacy-status private]",
      "  node skills/youtube-publisher/scripts/publish.js --spec-file path/to/batch.json --schedule-at 2026-04-05T09:00:00+09:00",
      "",
      "Supports JSON specs or markdown specs with a fenced ```json block.",
    ].join("\n")
  );
}

function truncate(value, maxLength) {
  const normalized = String(value || "").trim();
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd() + "...";
}

function readDescription(args) {
  if (args["description-file"]) {
    return fs.readFileSync(path.resolve(args["description-file"]), "utf8").trim();
  }
  return String(args.description || "").trim();
}

function readExistingResults(outputFile) {
  if (!outputFile || !fs.existsSync(outputFile)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(outputFile, "utf8"));
    return Array.isArray(parsed?.results) ? parsed.results : [];
  } catch {
    return [];
  }
}

function getVideoKey(entry) {
  if (entry?.id) return `id:${String(entry.id)}`;
  if (entry?.file) return `file:${path.resolve(String(entry.file))}`;
  if (entry?.videoFile) return `file:${path.resolve(String(entry.videoFile))}`;
  if (entry?.title) return `title:${String(entry.title).trim()}`;
  return "";
}

function writeLiveProgress(outputFile, results, extra = {}) {
  if (!outputFile) return;

  writeJsonFile(outputFile, {
    mode: "live",
    results,
    updated_at: new Date().toISOString(),
    ...extra,
  });
}

function ensureFileExists(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Arquivo nao encontrado: ${absolutePath}`);
  }
  return absolutePath;
}

function normalizeVideoSpec(entry, defaults = {}, index = 0) {
  const videoFile = ensureFileExists(entry.video_file || entry.file || entry.videoFile);
  const title = truncate(entry.title || `Video ${index + 1}`, 100);
  const description = truncate(entry.description || "", 5000);
  const tags = parseCsv(entry.tags || defaults.tags).slice(0, 15);
  let privacyStatus = normalizePrivacyStatus(
    entry.privacy_status || entry.privacyStatus || defaults.privacy_status || process.env.YOUTUBE_PRIVACY_STATUS || "private"
  );
  const categoryId = String(entry.category_id || entry.categoryId || defaults.category_id || process.env.YOUTUBE_CATEGORY_ID || "22");
  const playlistId = String(entry.playlist_id || entry.playlistId || defaults.playlist_id || "").trim();
  const notifySubscribers = parseBoolean(
    entry.notify_subscribers ?? entry.notifySubscribers ?? defaults.notify_subscribers,
    false
  );
  const madeForKids = parseBoolean(entry.made_for_kids ?? entry.madeForKids, false);
  const publishAtRaw = entry.publish_at || entry.publishAt || defaults.publish_at || defaults.publishAt || "";
  const publishAt = publishAtRaw ? normalizeDateString(publishAtRaw) : "";

  if (!title) {
    throw new Error(`Video ${index + 1} sem titulo.`);
  }

  if (publishAt) {
    privacyStatus = "private";
  }

  return {
    id: entry.id || `video-${String(index + 1).padStart(2, "0")}`,
    videoFile,
    title,
    description,
    tags,
    privacyStatus,
    categoryId,
    playlistId,
    notifySubscribers,
    madeForKids,
    publishAt,
  };
}

function buildVideosFromArgs(args) {
  if (args["spec-file"]) {
    const spec = loadSpecFile(args["spec-file"]);
    return buildVideosFromSpec(spec);
  }

  if (!args["video-file"] || !args.title) {
    throw new Error("Provide --spec-file or use --video-file plus --title.");
  }

  return [
    normalizeVideoSpec(
      {
        video_file: args["video-file"],
        title: args.title,
        description: readDescription(args),
        tags: args.tags,
        privacy_status: args["privacy-status"],
        category_id: args["category-id"],
        playlist_id: args["playlist-id"],
        notify_subscribers: args["notify-subscribers"],
        made_for_kids: args["made-for-kids"],
      },
      {},
      0
    ),
  ];
}

function buildVideosFromSpec(spec) {
  const entries = spec.videos || spec.clips || [];
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("Spec sem videos/clips para publicar.");
  }
  return entries.map((entry, index) => normalizeVideoSpec(entry, spec.defaults || {}, index));
}

function buildInsertPayload(video) {
  return {
    snippet: {
      title: video.title,
      description: video.description,
      tags: video.tags,
      categoryId: video.categoryId,
    },
    status: {
      privacyStatus: video.privacyStatus,
      selfDeclaredMadeForKids: video.madeForKids,
      ...(video.publishAt ? { publishAt: video.publishAt } : {}),
    },
  };
}

async function initializeUpload(accessToken, video) {
  const stats = fs.statSync(video.videoFile);
  const uploadUrl = `${YOUTUBE_UPLOAD_BASE}?uploadType=resumable&part=snippet,status&notifySubscribers=${String(
    video.notifySubscribers
  )}`;

  const parsed = await curlJson(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(stats.size),
      "X-Upload-Content-Type": detectVideoMimeType(video.videoFile),
    },
    body: buildInsertPayload(video),
  });

  const location = parsed.headers.location;
  if (!location) {
    throw new Error(
      `Upload init sem header location para ${video.title}. headers=${JSON.stringify(parsed.headers)} body=${typeof parsed.data === "string" ? parsed.data : JSON.stringify(parsed.data)}`
    );
  }

  return location;
}

async function attachToPlaylist(accessToken, playlistId, videoId) {
  if (!playlistId) return null;

  const parsed = await curlJson(`${YOUTUBE_API_BASE}/playlistItems?part=snippet`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: {
      snippet: {
        playlistId,
        resourceId: {
          kind: "youtube#video",
          videoId,
        },
      },
    },
  });

  return parsed.data?.id || null;
}

async function publishVideo(accessToken, video) {
  const uploadSessionUrl = await initializeUpload(accessToken, video);
  const uploadResult = await curlUploadBinary(
    uploadSessionUrl,
    video.videoFile,
    detectVideoMimeType(video.videoFile)
  );

  const videoId = uploadResult.data?.id;
  if (!videoId) {
    throw new Error(`Upload concluido sem video id para ${video.title}`);
  }

  const playlistItemId = await attachToPlaylist(accessToken, video.playlistId, videoId);

  return {
    id: video.id,
    title: video.title,
    video_id: videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    playlist_item_id: playlistItemId,
    privacy_status: video.privacyStatus,
    file: video.videoFile,
  };
}

async function publishBatch(accessToken, videos, options = {}) {
  const outputFile = options.outputFile ? path.resolve(options.outputFile) : null;
  const resume = options.resume !== false;
  const existingResults = resume ? readExistingResults(outputFile) : [];
  const publishedKeys = new Set(existingResults.map((entry) => getVideoKey(entry)).filter(Boolean));
  const pendingVideos = resume
    ? videos.filter((video) => !publishedKeys.has(getVideoKey(video)))
    : [...videos];
  const results = [...existingResults];

  if (pendingVideos.length === 0) {
    writeLiveProgress(outputFile, results, {
      total: videos.length,
      completed: results.length,
      pending: 0,
      skipped_existing: existingResults.length,
      status: "completed",
    });

    return {
      results,
      publishedNow: 0,
      skippedExisting: existingResults.length,
      total: videos.length,
      pending: 0,
    };
  }

  for (let index = 0; index < pendingVideos.length; index += 1) {
    const video = pendingVideos[index];

    try {
      const result = await publishVideo(accessToken, video);
      results.push(result);

      writeLiveProgress(outputFile, results, {
        total: videos.length,
        completed: results.length,
        pending: pendingVideos.length - index - 1,
        skipped_existing: existingResults.length,
        status: "running",
        last_published: {
          id: result.id,
          title: result.title,
          url: result.url,
        },
      });
    } catch (error) {
      writeLiveProgress(outputFile, results, {
        total: videos.length,
        completed: results.length,
        pending: pendingVideos.length - index,
        skipped_existing: existingResults.length,
        status: "failed",
        last_error: {
          message: error.message,
          video_id: video.id,
          title: video.title,
        },
      });
      throw error;
    }
  }

  writeLiveProgress(outputFile, results, {
    total: videos.length,
    completed: results.length,
    pending: 0,
    skipped_existing: existingResults.length,
    status: "completed",
  });

  return {
    results,
    publishedNow: results.length - existingResults.length,
    skippedExisting: existingResults.length,
    total: videos.length,
    pending: 0,
  };
}

function printDryRun(videos) {
  console.log("✅ DRY RUN — no live publish executed");
  videos.forEach((video, index) => {
    console.log(`[${index + 1}] ${video.title}`);
    console.log(`   file: ${video.videoFile}`);
    console.log(`   privacy: ${video.privacyStatus}`);
    console.log(`   tags: ${video.tags.join(", ") || "sem tags"}`);
    console.log(`   playlist: ${video.playlistId || "nenhuma"}`);
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || args.h) {
    printUsage();
    process.exit(0);
  }

  const videos = buildVideosFromArgs(args);
  const outputFile = args["output-file"] ? path.resolve(args["output-file"]) : null;
  const scheduleAt = args["schedule-at"] || args["publish-at"]
    ? normalizeDateString(args["schedule-at"] || args["publish-at"])
    : "";

  if (scheduleAt) {
    const firstVideo = videos[0] || {};
    const commandArgs = process.argv.slice(2).filter((value, index, all) => {
      if (value === "--schedule-at" || value === "--publish-at") return false;
      if (index > 0 && (all[index - 1] === "--schedule-at" || all[index - 1] === "--publish-at")) return false;
      return true;
    });
    commandArgs.push("--run-due-job");
    const { job, jobFile } = createScheduledJob({
      platform: "youtube",
      scheduleAt,
      command: process.execPath,
      args: [path.resolve(__filename), ...commandArgs],
      cwd: process.cwd(),
      metadata: {
        mode: "youtube-publish",
        title: firstVideo.title || "youtube-batch",
        total_videos: videos.length,
        output_file: outputFile,
      },
    });
    console.log("✅ YouTube publish scheduled");
    console.log(`   job_id: ${job.id}`);
    console.log(`   schedule_at: ${job.schedule_at}`);
    console.log(`   job_file: ${jobFile}`);
    return;
  }

  if (args["dry-run"]) {
    printDryRun(videos);
    if (outputFile) {
      writeJsonFile(outputFile, {
        mode: "dry-run",
        videos: videos.map((video) => ({
          id: video.id,
          title: video.title,
          file: video.videoFile,
          privacy_status: video.privacyStatus,
          publish_at: video.publishAt || null,
          tags: video.tags,
          playlist_id: video.playlistId,
        })),
      });
    }
    return;
  }

  const accessToken = requireEnv("YOUTUBE_ACCESS_TOKEN");
  const summary = await publishBatch(accessToken, videos, {
    outputFile,
    resume: true,
  });
  const results = summary.results;

  console.log("✅ YouTube publish completed");
  if (summary.skippedExisting > 0) {
    console.log(`   skipped_existing: ${summary.skippedExisting}`);
  }
  console.log(`   published_now: ${summary.publishedNow}`);
  results.forEach((result, index) => {
    console.log(`[${index + 1}] ${result.title}`);
    console.log(`   video_id: ${result.video_id}`);
    console.log(`   url: ${result.url}`);
  });
}

module.exports = {
  buildVideosFromSpec,
  buildVideosFromArgs,
  normalizeVideoSpec,
  publishBatch,
  publishVideo,
  readExistingResults,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
