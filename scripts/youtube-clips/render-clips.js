const path = require("node:path");
const {
  ensureBinary,
  ensureDir,
  extractJsonBlockFromMarkdown,
  fileExists,
  findNewestSourceVideo,
  getFfmpegPath,
  formatSecondsForFfmpeg,
  formatSecondsForHumans,
  parseTimedTextFile,
  parseTimestampToSeconds,
  pickTranscriptFile,
  readText,
  relativeToRepo,
  resolveSquadDir,
  runCommand,
  slugify,
  writeJson,
  writeText,
} = require("./lib");

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/youtube-clips/render-clips.js [--squad youtube-viral-clips] [--spec path/to/clip-pack-manifest.md] [--source path/to/source.mp4]",
      "",
      "Spec format:",
      "  - JSON file directly, or",
      "  - Markdown with a ```json fenced block containing { source_video, clips: [...] }",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = [...argv];
  const config = {
    squad: "youtube-viral-clips",
    spec: null,
    source: null,
    subtitles: "auto",
    preset: "fast",
    crf: "20",
    skipExisting: true,
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
    if (current === "--spec") {
      config.spec = args.shift() || config.spec;
      continue;
    }
    if (current === "--source") {
      config.source = args.shift() || config.source;
      continue;
    }
    if (current === "--subtitles") {
      config.subtitles = args.shift() || config.subtitles;
      continue;
    }
    if (current === "--no-subtitles") {
      config.subtitles = "off";
      continue;
    }
    if (current === "--preset") {
      config.preset = args.shift() || config.preset;
      continue;
    }
    if (current === "--crf") {
      config.crf = args.shift() || config.crf;
      continue;
    }
    if (current === "--force") {
      config.skipExisting = false;
      continue;
    }
    if (!config.spec) {
      config.spec = current;
    }
  }

  return config;
}

function readRenderSpec(specPath) {
  const content = readText(specPath);
  if (specPath.toLowerCase().endsWith(".json")) {
    return JSON.parse(content);
  }

  const jsonBlock = extractJsonBlockFromMarkdown(content);
  if (!jsonBlock) {
    throw new Error("Manifest markdown sem bloco ```json``` renderizavel.");
  }
  return jsonBlock;
}

function resolveSourceVideo(config, spec, squadDir) {
  if (config.source) {
    return path.resolve(config.source);
  }
  if (spec.source_video) {
    return path.resolve(spec.source_video);
  }
  const sourceDir = path.join(squadDir, "output", "source");
  const found = findNewestSourceVideo(sourceDir);
  if (found) return found;
  throw new Error("Nenhum video fonte encontrado. Rode a ingestao primeiro.");
}

function normalizeClips(rawClips) {
  if (!Array.isArray(rawClips) || rawClips.length === 0) {
    throw new Error("Render spec sem clips.");
  }

  return rawClips.map((clip, index) => {
    const startSeconds = parseTimestampToSeconds(clip.start);
    const endSeconds = parseTimestampToSeconds(clip.end);
    if (Number.isNaN(startSeconds) || Number.isNaN(endSeconds) || endSeconds <= startSeconds) {
      throw new Error(`Clip ${index + 1} com timestamps invalidos.`);
    }

    const id = clip.id || `clip-${String(index + 1).padStart(2, "0")}`;
    return {
      id,
      title: clip.title || id,
      notes: clip.notes || "",
      startSeconds,
      endSeconds,
      durationSeconds: endSeconds - startSeconds,
      startLabel: formatSecondsForHumans(startSeconds),
      endLabel: formatSecondsForHumans(endSeconds),
      subtitles: clip.subtitles !== false,
    };
  });
}

function formatAssTimestamp(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const centiseconds = Math.floor((safe - Math.floor(safe)) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function cleanAssText(value) {
  return String(value || "")
    .replace(/\{|\}/g, "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSubtitleEvents(transcriptSegments, clip) {
  return transcriptSegments
    .filter((segment) => segment.end > clip.startSeconds && segment.start < clip.endSeconds)
    .map((segment) => {
      const start = Math.max(0, segment.start - clip.startSeconds);
      const end = Math.min(clip.durationSeconds, segment.end - clip.startSeconds);
      return {
        start,
        end,
        text: cleanAssText(segment.text),
      };
    })
    .filter((segment) => segment.text && segment.end - segment.start > 0.08);
}

function buildAssContent(events) {
  const lines = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1080",
    "PlayResY: 1920",
    "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    "Style: PromptHub,Arial,24,&H00FFFFFF,&H000000FF,&H0012161D,&H66000000,-1,0,0,0,100,100,0,0,1,2.4,0.8,2,90,90,120,1",
    "",
    "[Events]",
    "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
  ];

  events.forEach((event) => {
    lines.push(
      `Dialogue: 0,${formatAssTimestamp(event.start)},${formatAssTimestamp(event.end)},PromptHub,,0,0,0,,${event.text}`
    );
  });

  return `${lines.join("\n")}\n`;
}

function resolveTranscriptPath(sourceVideoPath) {
  const baseStem = sourceVideoPath.replace(/\.[^.]+$/, "");
  return pickTranscriptFile(baseStem);
}

function renderClip(sourceVideoPath, clip, outputPath, subtitlePath = null, options = {}) {
  const filterParts = [
    "scale=1080:1920:force_original_aspect_ratio=decrease",
    "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
    "setsar=1",
    "fps=30",
  ];
  if (subtitlePath) {
    filterParts.push(`subtitles='${subtitlePath.replace(/\\/g, "/").replace(/'/g, "'\\\\''")}':fontsdir='/usr/share/fonts'`);
  }
  const filter = filterParts.join(",");
  runCommand(
    getFfmpegPath(),
    [
      "-y",
      "-ss",
      formatSecondsForFfmpeg(clip.startSeconds),
      "-i",
      sourceVideoPath,
      "-t",
      formatSecondsForFfmpeg(clip.durationSeconds),
      "-vf",
      filter,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      options.preset || "fast",
      "-crf",
      String(options.crf || "20"),
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    { stdio: "inherit" }
  );
}

function buildRenderReport(sourceVideoPath, createdClips) {
  const lines = [
    "## Render result",
    `- Source video: \`${relativeToRepo(sourceVideoPath)}\``,
    `- Clips generated: ${createdClips.length}`,
    "",
    "## Generated files",
  ];

  createdClips.forEach((clip, index) => {
    lines.push(
      `${index + 1}. \`${relativeToRepo(clip.outputPath)}\` — ${clip.startLabel} to ${clip.endLabel} (${clip.title})`
    );
    if (clip.subtitlePath) {
      lines.push(`- Legendas: \`${relativeToRepo(clip.subtitlePath)}\``);
    }
  });

  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    process.exit(0);
  }

  ensureBinary(
    getFfmpegPath(),
    "ffmpeg local indisponivel. Rode `npm install` para instalar a dependencia `ffmpeg-static`."
  );

  const squadDir = resolveSquadDir(options.squad);
  if (!fileExists(squadDir)) {
    throw new Error(`Squad nao encontrado: ${options.squad}`);
  }

  const specPath = options.spec
    ? path.resolve(options.spec)
    : path.join(squadDir, "output", "clip-pack-manifest.md");
  if (!fileExists(specPath)) {
    throw new Error(`Manifest nao encontrado: ${relativeToRepo(specPath)}`);
  }

  const spec = readRenderSpec(specPath);
  const sourceVideoPath = resolveSourceVideo(options, spec, squadDir);
  if (!fileExists(sourceVideoPath)) {
    throw new Error(`Video fonte nao encontrado: ${sourceVideoPath}`);
  }

  const clips = normalizeClips(spec.clips);
  const clipsDir = path.join(squadDir, "output", "clips");
  ensureDir(clipsDir);
  const transcriptPath = options.subtitles === "off" ? null : resolveTranscriptPath(sourceVideoPath);
  const transcriptSegments = transcriptPath ? parseTimedTextFile(transcriptPath) : [];

  const createdClips = clips.map((clip) => {
    const filename = `${slugify(clip.id) || slugify(clip.title) || "clip"}.mp4`;
    const outputPath = path.join(clipsDir, filename);
    let subtitlePath = null;
    if (clip.subtitles && transcriptSegments.length > 0) {
      const subtitleEvents = buildSubtitleEvents(transcriptSegments, clip);
      if (subtitleEvents.length > 0) {
        subtitlePath = path.join(clipsDir, `${slugify(clip.id) || "clip"}.ass`);
        writeText(subtitlePath, buildAssContent(subtitleEvents));
      }
    }
    if (!options.skipExisting || !fileExists(outputPath)) {
      renderClip(sourceVideoPath, clip, outputPath, subtitlePath, {
        preset: options.preset,
        crf: options.crf,
      });
    }
    return {
      ...clip,
      outputPath,
      subtitlePath,
    };
  });

  writeJson(
    path.join(squadDir, "output", "clip-render-result.json"),
    {
      sourceVideo: relativeToRepo(sourceVideoPath),
      clips: createdClips.map((clip) => ({
        id: clip.id,
        title: clip.title,
        start: clip.startLabel,
        end: clip.endLabel,
        output: relativeToRepo(clip.outputPath),
        subtitles: clip.subtitlePath ? relativeToRepo(clip.subtitlePath) : null,
      })),
    }
  );
  writeText(
    path.join(squadDir, "output", "clip-render-result.md"),
    buildRenderReport(sourceVideoPath, createdClips)
  );

  console.log(`Clips gerados: ${createdClips.length}`);
  createdClips.forEach((clip) => {
    console.log(`- ${relativeToRepo(clip.outputPath)} (${clip.startLabel} -> ${clip.endLabel})`);
  });
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
