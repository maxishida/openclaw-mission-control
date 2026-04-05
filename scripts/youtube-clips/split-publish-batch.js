const path = require("node:path");
const { fileExists, readText, relativeToRepo, resolveSquadDir, writeJson, writeText } = require("./lib");

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/youtube-clips/split-publish-batch.js [--squad youtube-viral-clips] [--limit 4] [--batch path/to/youtube-publish-batch.json]",
      "",
      "Splits a full publish batch into publish-now and deferred queues.",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = [...argv];
  const config = {
    squad: "youtube-viral-clips",
    limit: Number(process.env.YOUTUBE_MAX_PUBLISH_PER_RUN || 4),
    batch: null,
  };

  while (args.length > 0) {
    const current = args.shift();
    if (!current) continue;

    if (current === "--help" || current === "-h") {
      config.help = true;
      return config;
    }
    if (current === "--squad") {
      config.squad = args.shift() || config.squad;
      continue;
    }
    if (current === "--limit") {
      config.limit = Math.max(1, Number(args.shift() || config.limit));
      continue;
    }
    if (current === "--batch") {
      config.batch = args.shift() || config.batch;
    }
  }

  return config;
}

function buildMarkdown(nowBatch, deferredBatch) {
  const lines = [
    "## Publish split",
    `- Publish now: ${nowBatch.videos.length}`,
    `- Deferred: ${deferredBatch.videos.length}`,
    "",
    "## Publish now queue",
  ];

  nowBatch.videos.forEach((video, index) => {
    lines.push(`${index + 1}. ${video.title}`);
    lines.push(`- Score: ${video.score || "n/a"}`);
  });

  if (deferredBatch.videos.length) {
    lines.push("", "## Deferred queue");
    deferredBatch.videos.forEach((video, index) => {
      lines.push(`${index + 1}. ${video.title}`);
      lines.push(`- Score: ${video.score || "n/a"}`);
    });
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const squadDir = resolveSquadDir(options.squad);
  const batchPath = options.batch
    ? path.resolve(options.batch)
    : path.join(squadDir, "output", "youtube-publish-batch.json");

  if (!fileExists(batchPath)) {
    throw new Error(`Batch nao encontrado: ${relativeToRepo(batchPath)}`);
  }

  const batch = JSON.parse(readText(batchPath));
  const entries = Array.isArray(batch.videos) ? batch.videos : [];
  if (!entries.length) {
    throw new Error("Batch vazio.");
  }

  const prioritized = [...entries].sort((left, right) => {
    const leftScore = Number(left.score || 0);
    const rightScore = Number(right.score || 0);
    if (rightScore !== leftScore) return rightScore - leftScore;
    return String(left.title || "").localeCompare(String(right.title || ""));
  });
  const approved = prioritized.filter((video) => Number(video.score || 0) >= 80);
  const nowSource = approved.length > 0 ? approved : prioritized;

  const nowBatch = {
    defaults: batch.defaults || {},
    videos: nowSource.slice(0, options.limit),
  };
  const nowIds = new Set(nowBatch.videos.map((video) => video.id));
  const deferredBatch = {
    defaults: batch.defaults || {},
    videos: prioritized.filter((video) => !nowIds.has(video.id)),
  };

  const outputDir = path.join(squadDir, "output");
  const nowPath = path.join(outputDir, "youtube-publish-batch-now.json");
  const deferredPath = path.join(outputDir, "youtube-publish-batch-deferred.json");
  const markdownPath = path.join(outputDir, "youtube-publish-split.md");
  writeJson(nowPath, nowBatch);
  writeJson(deferredPath, deferredBatch);
  writeText(markdownPath, buildMarkdown(nowBatch, deferredBatch));

  console.log(`Publish now: ${relativeToRepo(nowPath)}`);
  console.log(`Deferred: ${relativeToRepo(deferredPath)}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
