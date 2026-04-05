const path = require("node:path");
const {
  extractJsonBlockFromMarkdown,
  fileExists,
  readText,
  relativeToRepo,
  resolveSquadDir,
  writeJson,
  writeText,
} = require("./lib");

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/youtube-clips/build-publish-batch.js [--squad youtube-viral-clips] [--manifest path/to/clip-pack-manifest.md] [--render-result path/to/clip-render-result.json]",
      "",
      "Creates a YouTube upload batch spec from the approved manifest plus rendered clips.",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = [...argv];
  const config = {
    squad: "youtube-viral-clips",
    manifest: null,
    renderResult: null,
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
    if (current === "--manifest") {
      config.manifest = args.shift() || config.manifest;
      continue;
    }
    if (current === "--render-result") {
      config.renderResult = args.shift() || config.renderResult;
    }
  }

  return config;
}

function readJsonFile(filePath) {
  return JSON.parse(readText(filePath));
}

function readManifest(filePath) {
  const content = readText(filePath);
  if (filePath.toLowerCase().endsWith(".json")) {
    return JSON.parse(content);
  }

  const parsed = extractJsonBlockFromMarkdown(content);
  if (!parsed) {
    throw new Error("Manifest sem bloco ```json``` valido.");
  }
  return parsed;
}

function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags.map((value) => String(value).trim()).filter(Boolean);
  }
  return String(tags)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildDescription(clip) {
  const lines = [];
  if (clip.description) lines.push(String(clip.description).trim());
  else if (clip.notes) lines.push(String(clip.notes).trim());

  if (!lines.length) {
    lines.push("Corte curto produzido automaticamente a partir do video fonte aprovado pelo squad.");
  }

  const hashtags = normalizeTags(clip.tags)
    .slice(0, 8)
    .map((tag) => `#${tag.replace(/^#/, "").replace(/\s+/g, "")}`);

  const descriptionBody = lines.join("\n");
  if (hashtags.length > 0 && !/#\w/.test(descriptionBody)) {
    lines.push("", hashtags.join(" "));
  }

  return lines.join("\n").trim();
}

function buildBatchSpec(manifest, renderResult) {
  const manifestClips = new Map();
  for (const clip of manifest.clips || []) {
    if (clip?.id) {
      manifestClips.set(String(clip.id), clip);
    }
  }

  const defaults = {
    privacy_status: process.env.YOUTUBE_PRIVACY_STATUS || "private",
    category_id: process.env.YOUTUBE_CATEGORY_ID || "22",
    notify_subscribers: false,
  };

  const videos = (renderResult.clips || []).map((renderedClip, index) => {
    const manifestClip = manifestClips.get(String(renderedClip.id)) || {};
    const tags = normalizeTags(manifestClip.tags);

    return {
      id: renderedClip.id || `clip-${String(index + 1).padStart(2, "0")}`,
      video_file: renderedClip.output,
      title: String(manifestClip.title || renderedClip.title || `Clip ${index + 1}`).trim(),
      description: buildDescription(manifestClip),
      tags,
      score: Number(manifestClip.score || 0),
      chapter_title: String(manifestClip.chapter_title || "").trim(),
      privacy_status: manifestClip.privacy_status || defaults.privacy_status,
      category_id: manifestClip.category_id || defaults.category_id,
      playlist_id: manifestClip.playlist_id || "",
      notify_subscribers:
        typeof manifestClip.notify_subscribers === "boolean"
          ? manifestClip.notify_subscribers
          : defaults.notify_subscribers,
    };
  });

  return {
    defaults,
    videos,
  };
}

function buildMarkdownPreview(batchSpec) {
  const lines = [
    "## YouTube publish batch",
    `- Videos: ${batchSpec.videos.length}`,
    `- Default privacy: ${batchSpec.defaults.privacy_status}`,
    `- Default category: ${batchSpec.defaults.category_id}`,
    "",
    "## Queue",
  ];

  batchSpec.videos.forEach((video, index) => {
    lines.push(`${index + 1}. ${video.title}`);
    lines.push(`- Arquivo: \`${video.video_file}\``);
    lines.push(`- Privacy: ${video.privacy_status}`);
    lines.push(`- Tags: ${video.tags.join(", ") || "sem tags"}`);
  });

  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const squadDir = resolveSquadDir(options.squad);
  const manifestPath = options.manifest
    ? path.resolve(options.manifest)
    : path.join(squadDir, "output", "clip-pack-manifest.md");
  const renderResultPath = options.renderResult
    ? path.resolve(options.renderResult)
    : path.join(squadDir, "output", "clip-render-result.json");

  if (!fileExists(manifestPath)) {
    throw new Error(`Manifest nao encontrado: ${relativeToRepo(manifestPath)}`);
  }
  if (!fileExists(renderResultPath)) {
    throw new Error(`Render result nao encontrado: ${relativeToRepo(renderResultPath)}`);
  }

  const manifest = readManifest(manifestPath);
  const renderResult = readJsonFile(renderResultPath);
  const batchSpec = buildBatchSpec(manifest, renderResult);

  if (!batchSpec.videos.length) {
    throw new Error("Nenhum video renderizado encontrado para preparar o batch de publicacao.");
  }

  const outputJsonPath = path.join(squadDir, "output", "youtube-publish-batch.json");
  const outputMdPath = path.join(squadDir, "output", "youtube-publish-batch.md");
  writeJson(outputJsonPath, batchSpec);
  writeText(outputMdPath, buildMarkdownPreview(batchSpec));

  console.log(`Batch pronto: ${relativeToRepo(outputJsonPath)}`);
  console.log(`Preview: ${relativeToRepo(outputMdPath)}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
