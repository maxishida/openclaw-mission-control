const path = require("node:path");
const {
  fileExists,
  findNewestSourceVideo,
  formatSecondsForHumans,
  parseTimedTextFile,
  pickTranscriptFile,
  readText,
  relativeToRepo,
  resolveSquadDir,
  slugify,
  writeJson,
  writeText,
} = require("./lib");

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "do",
  "for",
  "from",
  "how",
  "in",
  "into",
  "is",
  "it",
  "just",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "their",
  "this",
  "to",
  "we",
  "what",
  "when",
  "with",
  "you",
  "your",
]);

const FILLER_PATTERNS = [
  /\byou know\b/gi,
  /\bkind of\b/gi,
  /\bsort of\b/gi,
  /\bi mean\b/gi,
  /\buh+\b/gi,
  /\bum+\b/gi,
  /\blike\b/gi,
];

const TECH_HINTS = [
  "ai",
  "xai",
  "tesla",
  "spacex",
  "starlink",
  "robot",
  "robots",
  "consciousness",
  "future",
  "energy",
  "investing",
  "company",
  "companies",
  "technology",
  "engineering",
  "entrepreneur",
  "entrepreneurship",
  "india",
];

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/youtube-clips/auto-plan.js [--squad youtube-viral-clips] [--video-id YOUTUBE_ID] [--max-clips 24]",
      "",
      "Builds a full shorts manifest automatically from transcript + chapters.",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = [...argv];
  const config = {
    squad: "youtube-viral-clips",
    videoId: null,
    maxClips: 24,
    minDuration: 26,
    targetDuration: 42,
    maxDuration: 58,
    clipsPerChapter: 1,
    privacyStatus: process.env.YOUTUBE_PRIVACY_STATUS || "public",
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
    if (current === "--video-id") {
      config.videoId = args.shift() || config.videoId;
      continue;
    }
    if (current === "--max-clips") {
      config.maxClips = Number(args.shift() || config.maxClips);
      continue;
    }
    if (current === "--min-duration") {
      config.minDuration = Number(args.shift() || config.minDuration);
      continue;
    }
    if (current === "--target-duration") {
      config.targetDuration = Number(args.shift() || config.targetDuration);
      continue;
    }
    if (current === "--max-duration") {
      config.maxDuration = Number(args.shift() || config.maxDuration);
      continue;
    }
    if (current === "--clips-per-chapter") {
      config.clipsPerChapter = Math.max(1, Number(args.shift() || config.clipsPerChapter));
      continue;
    }
    if (current === "--privacy-status") {
      config.privacyStatus = args.shift() || config.privacyStatus;
    }
  }

  return config;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function truncate(value, maxLength) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && token.length > 2 && !STOPWORDS.has(token));
}

function sentenceFragments(value) {
  return String(value || "")
    .replace(/&gt;/g, " ")
    .replace(/\[[^\]]+\]/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((fragment) => fragment.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function toHook(text) {
  const sentence = sentenceFragments(text)[0] || String(text || "");
  const words = sentence.split(/\s+/).filter(Boolean).slice(0, 12);
  return truncate(words.join(" "), 68);
}

function detectLanguage(transcriptPath) {
  const base = path.basename(transcriptPath || "").toLowerCase();
  if (base.includes(".pt-br.") || base.includes(".pt.")) return "pt-BR";
  if (base.includes(".es.")) return "es";
  return "en";
}

function readSourceBundle(squadDir, options) {
  const sourceDir = path.join(squadDir, "output", "source");
  let sourceVideoPath = null;
  let infoPath = null;
  let transcriptPath = null;

  if (options.videoId) {
    sourceVideoPath = findNewestSourceVideo(sourceDir, path.join(sourceDir, options.videoId));
    infoPath = path.join(sourceDir, `${options.videoId}.info.json`);
    transcriptPath = pickTranscriptFile(path.join(sourceDir, options.videoId));
  } else {
    sourceVideoPath = findNewestSourceVideo(sourceDir);
    if (sourceVideoPath) {
      const baseStem = sourceVideoPath.replace(/\.[^.]+$/, "");
      infoPath = `${baseStem}.info.json`;
      transcriptPath = pickTranscriptFile(baseStem);
    }
  }

  if (!sourceVideoPath || !fileExists(sourceVideoPath)) {
    throw new Error("Nenhum source video encontrado. Rode a ingestao primeiro.");
  }
  if (!infoPath || !fileExists(infoPath)) {
    throw new Error(`Metadata nao encontrada para ${relativeToRepo(sourceVideoPath)}.`);
  }
  if (!transcriptPath || !fileExists(transcriptPath)) {
    throw new Error(`Transcript nao encontrado para ${relativeToRepo(sourceVideoPath)}.`);
  }

  return {
    sourceVideoPath,
    infoPath,
    transcriptPath,
    metadata: JSON.parse(readText(infoPath)),
    transcriptSegments: parseTimedTextFile(transcriptPath),
  };
}

function getChapterWindows(metadata, transcriptSegments) {
  const chapters = Array.isArray(metadata.chapters) && metadata.chapters.length > 0
    ? metadata.chapters
    : [
        {
          title: metadata.title || "Full episode",
          start_time: transcriptSegments[0]?.start || 0,
          end_time: metadata.duration || transcriptSegments[transcriptSegments.length - 1]?.end || 0,
        },
      ];

  return chapters
    .map((chapter, index) => ({
      index: index + 1,
      title: chapter.title || `Chapter ${index + 1}`,
      start: Number(chapter.start_time || 0),
      end: Number(chapter.end_time || metadata.duration || 0),
    }))
    .filter((chapter) => chapter.end - chapter.start >= 20);
}

function keywordsFor(metadata, chapterTitle) {
  const baseTokens = [
    ...tokenize(metadata.title),
    ...tokenize(metadata.description).slice(0, 20),
    ...tokenize(chapterTitle),
  ];
  const unique = [];
  for (const token of baseTokens) {
    if (!unique.includes(token)) unique.push(token);
  }
  return unique.slice(0, 12);
}

function chapterSegments(transcriptSegments, chapter) {
  return transcriptSegments.filter((segment) => segment.end > chapter.start && segment.start < chapter.end);
}

function scoreWindow(segments, metadata, chapter) {
  const text = segments.map((segment) => segment.text).join(" ").replace(/\s+/g, " ").trim();
  const start = segments[0].start;
  const end = segments[segments.length - 1].end;
  const duration = Math.max(1, end - start);
  const words = tokenize(text);
  const wordsPerSecond = words.length / duration;
  const density = clamp(32 - Math.abs(wordsPerSecond - 2.45) * 14, 8, 32);
  const keywordPool = keywordsFor(metadata, chapter.title);
  const matches = keywordPool.filter((token) => text.toLowerCase().includes(token)).length;
  const keywordScore = clamp(matches * 4, 8, 28);
  const curiosityTerms = ["why", "how", "future", "money", "work", "ai", "robot", "energy", "consciousness"];
  const curiosityMatches = curiosityTerms.filter((term) => text.toLowerCase().includes(term)).length;
  const curiosityScore = clamp(curiosityMatches * 4, 0, 18);
  const punctuationScore = /[.!?]/.test(text) ? 8 : 3;
  const fillerPenalty = FILLER_PATTERNS.reduce((sum, pattern) => {
    const hits = text.match(pattern);
    return sum + (hits ? hits.length : 0);
  }, 0);
  const durationPenalty = duration > 59 ? 10 : duration < 24 ? 12 : 0;
  const baseScore = 38 + density + keywordScore + curiosityScore + punctuationScore - fillerPenalty * 1.3 - durationPenalty;

  return {
    score: Math.round(clamp(baseScore, 55, 96)),
    text,
    start,
    end,
    duration,
  };
}

function pickWindowForChapter(metadata, transcriptSegments, chapter, options) {
  const chapterTranscript = chapterSegments(transcriptSegments, chapter)
    .filter((segment) => !/^\[music\]/i.test(segment.text));
  if (!chapterTranscript.length) return null;

  const candidates = [];
  const step = chapterTranscript.length > 80 ? 2 : 1;

  for (let startIndex = 0; startIndex < chapterTranscript.length; startIndex += step) {
    const start = chapterTranscript[startIndex].start;
    const bucket = [];

    for (let endIndex = startIndex; endIndex < chapterTranscript.length; endIndex += 1) {
      bucket.push(chapterTranscript[endIndex]);
      const duration = bucket[bucket.length - 1].end - start;
      if (duration >= options.minDuration) {
        candidates.push(scoreWindow(bucket, metadata, chapter));
      }
      if (duration >= options.targetDuration && /[.!?]$/.test(bucket[bucket.length - 1].text)) {
        break;
      }
      if (duration >= options.maxDuration) {
        break;
      }
    }
  }

  if (!candidates.length) {
    const fallback = chapterTranscript.filter(
      (segment) => segment.start < chapter.start + options.maxDuration
    );
    if (!fallback.length) return null;
    return scoreWindow(fallback, metadata, chapter);
  }

  candidates.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return Math.abs(left.duration - options.targetDuration) - Math.abs(right.duration - options.targetDuration);
  });
  return candidates[0];
}

function topicTag(token) {
  return token.replace(/[^a-z0-9]/g, "");
}

function buildTags(metadata, chapter) {
  const pool = [
    ...tokenize(chapter.title),
    ...TECH_HINTS.filter((token) => `${metadata.title} ${chapter.title}`.toLowerCase().includes(token)),
    metadata.title.toLowerCase().includes("elon musk") ? "elonmusk" : "",
    metadata.title.toLowerCase().includes("nikhil kamath") ? "nikhilkamath" : "",
    "podcastclips",
    "shorts",
  ];
  const tags = [];
  for (const token of pool) {
    const normalized = topicTag(token);
    if (!normalized || tags.includes(normalized)) continue;
    tags.push(normalized);
    if (tags.length >= 8) break;
  }
  if (!tags.includes("shorts")) tags.push("shorts");
  return tags.slice(0, 8);
}

function principalKeyword(metadata, chapter) {
  const title = `${chapter.title} ${metadata.title}`.toLowerCase();
  const preference = ["elon musk", "ai", "xai", "tesla", "spacex", "starlink", "future", "money", "consciousness"];
  const hit = preference.find((keyword) => title.includes(keyword));
  if (hit) return hit;
  return truncate(chapter.title, 42);
}

function buildTitle(metadata, chapter) {
  const keyword = principalKeyword(metadata, chapter);
  const prefix = keyword.replace(/\b\w/g, (char) => char.toUpperCase());
  if (metadata.title.toLowerCase().includes("elon musk") && !prefix.toLowerCase().includes("elon musk")) {
    return truncate(`Elon Musk on ${chapter.title}`, 58);
  }
  return truncate(`${prefix}: ${chapter.title}`, 58);
}

function buildDescription(metadata, chapter, hook, keyword, tags) {
  const hashtagLine = tags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ");
  const cleanChapterTitle = String(chapter.title || "").replace(/[“”]/g, "\"");
  return [
    `Elon Musk on ${cleanChapterTitle}.`,
    `${keyword} clip from ${metadata.title}.`,
    `Chapter: ${chapter.title}.`,
    "",
    hashtagLine,
  ].join("\n").trim();
}

function buildScriptLines(text, duration) {
  const parts = sentenceFragments(text);
  const fallback = truncate(text, 220);
  const first = parts[0] || fallback;
  const second = parts[1] || first;
  const third = parts[2] || second;
  const fourth = parts[3] || third;
  const thirdMark = Math.max(10, Math.min(30, Math.round(duration * 0.72)));

  return [
    { t: "0-2s", line: truncate(first, 120) },
    { t: "2-10s", line: truncate(second, 140) },
    { t: `10-${thirdMark}s`, line: truncate(third, 160) },
    { t: `${thirdMark}-${Math.min(60, Math.round(duration))}s`, line: truncate(fourth, 140) },
  ];
}

function buildHighlights(start, end) {
  const duration = end - start;
  const points = [0.18, 0.42, 0.7].map((ratio) => start + duration * ratio);
  return points.map((second, index) => ({
    t: `${Math.round(second - start)}s`,
    type: index === 1 ? "overlay" : "zoom",
    note: index === 0 ? "Reframe the hook" : index === 1 ? "Underline the key claim" : "Punch the closing beat",
  }));
}

function buildClipRecord(metadata, chapter, window, options) {
  const id = `${String(chapter.index).padStart(2, "0")}-${slugify(chapter.title).slice(0, 42) || "chapter"}`;
  const keyword = principalKeyword(metadata, chapter);
  const hook = toHook(window.text);
  const tags = buildTags(metadata, chapter);
  const title = buildTitle(metadata, chapter);
  const description = buildDescription(metadata, chapter, hook, keyword, tags);
  const categoryId = tags.some((tag) => ["ai", "tesla", "spacex", "starlink", "xai", "future", "energy"].includes(tag))
    ? "28"
    : process.env.YOUTUBE_CATEGORY_ID || "22";

  return {
    manifest: {
      id,
      title,
      description,
      start: formatSecondsForHumans(window.start),
      end: formatSecondsForHumans(window.end),
      notes: `Chapter ${chapter.index}: ${chapter.title}. Score ${window.score}.`,
      tags,
      playlist_id: "",
      privacy_status: options.privacyStatus,
      category_id: categoryId,
      score: window.score,
      chapter_title: chapter.title,
    },
    hook: {
      id,
      hook,
      script: buildScriptLines(window.text, window.duration),
      loop_end: truncate(`The next question is where ${keyword} goes from here.`, 96),
      score: clamp(window.score + 2, 0, 100),
    },
    seo: {
      id,
      keyword_main: keyword,
      title,
      description,
      hashtags: tags.map((tag) => `#${tag}`),
      score: clamp(window.score + 1, 0, 100),
    },
    strategy: {
      id,
      cuts: [
        {
          start: formatSecondsForHumans(window.start),
          end: formatSecondsForHumans(window.end),
          reason: `Best transcript window inside chapter "${chapter.title}" with retention score ${window.score}.`,
        },
      ],
      pacing: window.duration > 48 ? "medium" : "fast",
      highlights: buildHighlights(window.start, window.end),
      score: window.score,
    },
    review: {
      id,
      approved: window.score >= 80,
      fail_reasons: window.score >= 80 ? [] : ["score_below_threshold"],
      score: window.score,
    },
  };
}

function buildMarkdownSummary(metadata, sourceVideoPath, clips, nowLimit) {
  const lines = [
    "## Auto plan",
    `- Source: \`${relativeToRepo(sourceVideoPath)}\``,
    `- Title: ${metadata.title}`,
    `- Clips planned: ${clips.length}`,
    `- Recommended publish-now limit: ${nowLimit}`,
    "",
    "## Planned clips",
  ];

  clips.forEach((clip, index) => {
    lines.push(
      `${index + 1}. ${clip.title} (${clip.start} - ${clip.end})`
    );
    lines.push(`- Chapter: ${clip.chapter_title}`);
    lines.push(`- Score: ${clip.score}`);
    lines.push(`- Tags: ${clip.tags.join(", ")}`);
  });

  return `${lines.join("\n")}\n`;
}

function average(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const squadDir = resolveSquadDir(options.squad);
  const { sourceVideoPath, transcriptPath, metadata, transcriptSegments } = readSourceBundle(squadDir, options);
  const chapters = getChapterWindows(metadata, transcriptSegments);
  const language = detectLanguage(transcriptPath);
  const records = [];

  for (const chapter of chapters) {
    const window = pickWindowForChapter(metadata, transcriptSegments, chapter, options);
    if (!window) continue;
    records.push(buildClipRecord(metadata, chapter, window, options));
  }

  const clips = records.map((record) => record.manifest).slice(0, options.maxClips);
  const hooks = records.map((record) => record.hook).slice(0, options.maxClips);
  const seo = records.map((record) => record.seo).slice(0, options.maxClips);
  const strategies = records.map((record) => record.strategy).slice(0, options.maxClips);
  const reviews = records.map((record) => record.review).slice(0, options.maxClips);
  const recommendedPublishNow = Math.min(clips.length, Number(process.env.YOUTUBE_MAX_PUBLISH_PER_RUN || 4));

  const outputDir = path.join(squadDir, "output");
  writeJson(path.join(outputDir, "intake-analysis.json"), {
    status: "ok",
    data: {
      source_video: relativeToRepo(sourceVideoPath),
      title: metadata.title,
      channel: metadata.channel || metadata.uploader || "",
      duration_seconds: metadata.duration || null,
      transcript_segments: transcriptSegments.length,
      chapters: chapters.length,
      language,
      planned_clips: clips.length,
    },
    score: 100,
    notes: "Transcript and chapter map loaded successfully.",
  });

  writeJson(path.join(outputDir, "hook-script.json"), {
    status: "ok",
    data: { clips: hooks },
    score: average(hooks.map((item) => item.score)),
    notes: "Hooks generated automatically from the best transcript window of each chapter.",
  });

  writeJson(path.join(outputDir, "seo-package.json"), {
    status: "ok",
    data: { clips: seo },
    score: average(seo.map((item) => item.score)),
    notes: "SEO package generated for the full shorts batch.",
  });

  writeJson(path.join(outputDir, "clip-strategy.json"), {
    status: "ok",
    data: { clips: strategies },
    score: average(strategies.map((item) => item.score)),
    notes: "Retention pacing and highlights generated chapter by chapter.",
  });

  writeJson(path.join(outputDir, "review-result.json"), {
    status: reviews.every((item) => item.approved) ? "ok" : "retry",
    data: {
      approved: reviews.every((item) => item.approved),
      clips: reviews,
      fail_reasons: reviews.filter((item) => !item.approved).map((item) => item.id),
    },
    score: average(reviews.map((item) => item.score)),
    notes: "Pre-render quality gate based on transcript, duration and topic density.",
  });

  writeJson(path.join(outputDir, "clip-pack-manifest.json"), {
    source_video: relativeToRepo(sourceVideoPath),
    clips,
  });

  writeJson(path.join(outputDir, "clip-analysis.json"), {
    generated_at: new Date().toISOString(),
    source_video: relativeToRepo(sourceVideoPath),
    transcript: relativeToRepo(transcriptPath),
    recommended_publish_now: recommendedPublishNow,
    clips,
  });

  writeText(
    path.join(outputDir, "clip-analysis.md"),
    buildMarkdownSummary(metadata, sourceVideoPath, clips, recommendedPublishNow)
  );

  console.log(`Manifest pronto: ${relativeToRepo(path.join(outputDir, "clip-pack-manifest.json"))}`);
  console.log(`Clips planejados: ${clips.length}`);
  console.log(`Publish-now recomendado: ${recommendedPublishNow}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
