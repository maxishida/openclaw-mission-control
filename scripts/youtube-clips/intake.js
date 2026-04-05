const path = require("node:path");
const {
  ensureBinary,
  ensureDir,
  extractYouTubeVideoId,
  fileExists,
  findNewestSourceVideo,
  formatSecondsForHumans,
  getLocalYtDlpPath,
  normalizeYouTubeUrl,
  parseTimedTextFile,
  pickTranscriptFile,
  relativeToRepo,
  resolveSquadDir,
  runCommand,
  transcriptToMarkdown,
  transcriptToPlainText,
  writeJson,
  writeText,
} = require("./lib");

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/youtube-clips/intake.js <youtube-url> [--squad youtube-viral-clips] [--skip-video]",
      "",
      "Examples:",
      "  node scripts/youtube-clips/intake.js https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "  npm run youtube:ingest -- https://www.youtube.com/watch?v=dQw4w9WgXcQ --skip-video",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = [...argv];
  const config = {
    url: null,
    squad: "youtube-viral-clips",
    skipVideo: false,
  };

  while (args.length > 0) {
    const current = args.shift();
    if (!current) continue;

    if (current === "--help" || current === "-h") {
      config.help = true;
      return config;
    }
    if (current === "--skip-video") {
      config.skipVideo = true;
      continue;
    }
    if (current === "--squad") {
      config.squad = args.shift() || config.squad;
      continue;
    }

    if (!config.url) {
      config.url = current;
    }
  }

  return config;
}

function buildSourceBrief(metadata, canonicalUrl, sourceVideoPath, transcriptSegments, transcriptPath) {
  const hasSourceVideo = fileExists(sourceVideoPath);
  const lines = [
    "## Video source",
    `- URL: ${canonicalUrl}`,
    `- Title: ${metadata.title || "Sem titulo"}`,
    `- Channel: ${metadata.channel || metadata.uploader || "Desconhecido"}`,
    `- Duration: ${formatSecondsForHumans(metadata.duration || 0)}`,
    `- Published at: ${metadata.upload_date || "Desconhecido"}`,
    "",
    "## Summary",
    metadata.description ? metadata.description.trim() : "Sem descricao disponivel.",
    "",
    "## Chapters",
  ];

  if (Array.isArray(metadata.chapters) && metadata.chapters.length > 0) {
    metadata.chapters.forEach((chapter, index) => {
      lines.push(
        `${index + 1}. ${chapter.title || `Capitulo ${index + 1}`} (${formatSecondsForHumans(chapter.start_time || 0)} - ${formatSecondsForHumans(chapter.end_time || metadata.duration || 0)})`
      );
    });
  } else {
    lines.push("- Sem capitulos detectados.");
  }

  lines.push("", "## Transcript status");
  if (transcriptSegments.length > 0 && transcriptPath) {
    lines.push(`- Transcript encontrado em \`${relativeToRepo(transcriptPath)}\``);
    lines.push(`- Segmentos: ${transcriptSegments.length}`);
    lines.push(`- Preview: ${transcriptSegments.slice(0, 5).map((segment) => segment.text).join(" ")}`);
  } else {
    lines.push("- Nenhum transcript automatico foi encontrado.");
  }

  lines.push("", "## Files generated");
  lines.push(`- Metadata JSON: \`${relativeToRepo(sourceVideoPath.replace(/\.[^.]+$/, ".info.json"))}\``);
  lines.push(
    hasSourceVideo
      ? `- Source video: \`${relativeToRepo(sourceVideoPath)}\``
      : "- Source video: nao baixado ainda"
  );
  if (transcriptPath) {
    lines.push(`- Transcript file: \`${relativeToRepo(transcriptPath)}\``);
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.url) {
    printUsage();
    process.exit(options.help ? 0 : 1);
  }

  const canonicalUrl = normalizeYouTubeUrl(options.url);
  if (!canonicalUrl) {
    throw new Error("URL de YouTube invalida. Use um link youtube.com/watch, youtube.com/shorts ou youtu.be.");
  }

  const ytDlpPath = getLocalYtDlpPath();
  ensureBinary(ytDlpPath, "Rode `npm run youtube:setup-tools` para baixar o yt-dlp local do projeto.");

  const squadDir = resolveSquadDir(options.squad);
  if (!fileExists(squadDir)) {
    throw new Error(`Squad nao encontrado: ${options.squad}`);
  }

  const inputDir = path.join(squadDir, "input");
  const outputDir = path.join(squadDir, "output");
  const sourceDir = path.join(outputDir, "source");
  ensureDir(inputDir);
  ensureDir(outputDir);
  ensureDir(sourceDir);

  const videoId = extractYouTubeVideoId(canonicalUrl);
  const baseStem = path.join(sourceDir, videoId);

  const metadataResult = runCommand(
    ytDlpPath,
    ["--dump-single-json", "--no-warnings", "--no-playlist", canonicalUrl],
    { stdio: "pipe" }
  );
  const metadata = JSON.parse(metadataResult.stdout);
  const metadataPath = `${baseStem}.info.json`;
  writeJson(metadataPath, metadata);

  if (!options.skipVideo) {
    runCommand(
      ytDlpPath,
      [
        "--no-warnings",
        "--no-progress",
        "--no-playlist",
        "-f",
        "mp4/bestvideo+bestaudio/best",
        "--merge-output-format",
        "mp4",
        "-o",
        `${baseStem}.%(ext)s`,
        canonicalUrl,
      ],
      { stdio: "inherit" }
    );
  }

  runCommand(
    ytDlpPath,
    [
      "--skip-download",
      "--write-auto-sub",
      "--write-sub",
      "--sub-langs",
      "en.*,pt-BR.*,pt.*,es.*",
      "--convert-subs",
      "vtt",
      "--no-warnings",
      "--no-playlist",
      "-o",
      `${baseStem}.%(ext)s`,
      canonicalUrl,
    ],
    { stdio: "pipe", allowFailure: true }
  );

  const transcriptPath = pickTranscriptFile(baseStem);
  const transcriptSegments = transcriptPath ? parseTimedTextFile(transcriptPath) : [];

  if (transcriptSegments.length > 0) {
    writeJson(`${baseStem}.transcript.json`, transcriptSegments);
    writeText(path.join(outputDir, "source-transcript.txt"), `${transcriptToPlainText(transcriptSegments)}\n`);
    writeText(
      path.join(outputDir, "source-transcript.md"),
      `# Transcript\n\n${transcriptToMarkdown(transcriptSegments)}\n`
    );
  }

  const sourceVideoPath = findNewestSourceVideo(sourceDir, baseStem)
    || path.join(sourceDir, `${videoId}.mp4`);

  writeText(path.join(inputDir, "source-video.url.txt"), `${canonicalUrl}\n`);
  writeText(
    path.join(outputDir, "source-video-brief.md"),
    buildSourceBrief(metadata, canonicalUrl, sourceVideoPath, transcriptSegments, transcriptPath)
  );

  const renderTemplate = {
    source_url: canonicalUrl,
    source_video: relativeToRepo(sourceVideoPath),
    clips: [
      {
        id: "clip-01",
        title: "Substitua pelo titulo final",
        start: "00:00:30.000",
        end: "00:00:45.000",
        notes: "Defina um trecho real depois de revisar o transcript.",
      },
    ],
  };
  writeJson(path.join(inputDir, "clip-render-spec.template.json"), renderTemplate);

  console.log(`Video ingerido: ${canonicalUrl}`);
  console.log(`Brief: ${relativeToRepo(path.join(outputDir, "source-video-brief.md"))}`);
  console.log(`Metadata: ${relativeToRepo(metadataPath)}`);
  if (transcriptPath && transcriptSegments.length > 0) {
    console.log(`Transcript: ${relativeToRepo(transcriptPath)}`);
  } else {
    console.log("Transcript: nenhum arquivo automatico encontrado");
  }
  console.log(`Template de render: ${relativeToRepo(path.join(inputDir, "clip-render-spec.template.json"))}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
