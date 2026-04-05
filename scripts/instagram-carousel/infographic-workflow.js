#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const sharp = require("sharp");
const dotenv = require("dotenv");

const WIDTH = 1080;
const HEIGHT = 1350;
const DEFAULT_REF_DIR = path.resolve("ai", "ref");
const DEFAULT_OUTPUT_ROOT = path.resolve(".context", "instagram-infographic");
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_IMAGE_MODEL = "openai/gpt-5-image";
const FALLBACK_IMAGE_MODEL = "openai/gpt-5-image-mini";
const INFOGRAPHIC_THEMES = {
  "green-core": {
    themeName: "green-core",
    style: "dark tech editorial",
    visualDirection: "premium dark interface, black and graphite base, acid-lime and cyan accents, clear hierarchy, high contrast, polished lighting",
    palette: {
      bgTop: "#06120f",
      bgBottom: "#0b1915",
      accent: "#75ff63",
      accentAlt: "#00f5d4",
      surface: "rgba(10, 18, 16, 0.82)",
      surfaceSoft: "rgba(9, 17, 14, 0.56)",
      text: "#f4fff7",
      muted: "#bdd8c6",
      border: "rgba(117,255,99,0.26)",
    },
    typography: {
      headline: "Bahnschrift Condensed",
      body: "Segoe UI",
      eyebrow: "Bahnschrift",
    },
  },
  "cyber-blue": {
    themeName: "cyber-blue",
    style: "executive cyber editorial",
    visualDirection: "deep navy interface, steel blue shadows, electric-cyan highlights, crisp data-led composition, premium and precise",
    palette: {
      bgTop: "#081221",
      bgBottom: "#0d1c33",
      accent: "#00e5ff",
      accentAlt: "#6f86ff",
      surface: "rgba(11, 20, 37, 0.84)",
      surfaceSoft: "rgba(11, 22, 41, 0.58)",
      text: "#eef7ff",
      muted: "#afc4d9",
      border: "rgba(0,229,255,0.25)",
    },
    typography: {
      headline: "Bahnschrift Condensed",
      body: "Segoe UI",
      eyebrow: "Bahnschrift",
    },
  },
  "neon-pink": {
    themeName: "neon-pink",
    style: "bold neon editorial",
    visualDirection: "ink-black interface, magenta glow, cyan countersignal, strong typographic contrast, premium social-first infographic",
    palette: {
      bgTop: "#150814",
      bgBottom: "#2a0f24",
      accent: "#ff4fd8",
      accentAlt: "#6bf0ff",
      surface: "rgba(25, 10, 23, 0.84)",
      surfaceSoft: "rgba(31, 12, 28, 0.58)",
      text: "#fff0fb",
      muted: "#e7bfdc",
      border: "rgba(255,79,216,0.24)",
    },
    typography: {
      headline: "Arial Black",
      body: "Segoe UI",
      eyebrow: "Bahnschrift",
    },
  },
  "orange-grid": {
    themeName: "orange-grid",
    style: "strategic warm-tech editorial",
    visualDirection: "dark copper interface, amber and tangerine highlights, disciplined hierarchy, warm but sharp infographic finish",
    palette: {
      bgTop: "#1c1008",
      bgBottom: "#30180d",
      accent: "#ff9a3d",
      accentAlt: "#ffd166",
      surface: "rgba(29, 15, 9, 0.84)",
      surfaceSoft: "rgba(35, 19, 12, 0.58)",
      text: "#fff5ed",
      muted: "#e6c6b4",
      border: "rgba(255,154,61,0.24)",
    },
    typography: {
      headline: "Trebuchet MS",
      body: "Segoe UI",
      eyebrow: "Bahnschrift",
    },
  },
  "petroleum-gold": {
    themeName: "petroleum-gold",
    style: "luxury control-room editorial",
    visualDirection: "petroleum black base, muted teal shadows, gold signal lines, executive infographic mood with restrained premium contrast",
    palette: {
      bgTop: "#091516",
      bgBottom: "#122325",
      accent: "#f4c454",
      accentAlt: "#4fd1c5",
      surface: "rgba(10, 21, 22, 0.84)",
      surfaceSoft: "rgba(13, 27, 29, 0.58)",
      text: "#f7f6ef",
      muted: "#c8d1ca",
      border: "rgba(244,196,84,0.24)",
    },
    typography: {
      headline: "Franklin Gothic Medium",
      body: "Segoe UI",
      eyebrow: "Bahnschrift",
    },
  },
};

dotenv.config({ path: path.resolve(".env.local") });
dotenv.config({ path: path.resolve(".env") });

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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function readJsonIfExists(filePath, fallback = null) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "instagram-infographic";
}

function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function todaySlug() {
  return new Date().toISOString().slice(0, 10);
}

function titleCase(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function resolveInfographicTheme(themeName, contentType) {
  const requested = String(themeName || "").trim().toLowerCase();
  if (requested && INFOGRAPHIC_THEMES[requested]) {
    return INFOGRAPHIC_THEMES[requested];
  }
  if (contentType === "tutorial") {
    return INFOGRAPHIC_THEMES["cyber-blue"];
  }
  return INFOGRAPHIC_THEMES["green-core"];
}

function normalizeImageModel(model) {
  const raw = String(model || "").trim().toLowerCase();
  if (!raw) return DEFAULT_IMAGE_MODEL;

  const aliases = new Map([
    ["gpt-image-1", "openai/gpt-5-image"],
    ["openai/gpt-image-1", "openai/gpt-5-image"],
    ["gpt-image-1.5", "openai/gpt-5-image"],
    ["openai/gpt-image-1.5", "openai/gpt-5-image"],
    ["gpt-5-image", "openai/gpt-5-image"],
    ["gpt-5-image-mini", "openai/gpt-5-image-mini"],
  ]);

  return aliases.get(raw) || raw;
}

function inferTopic(request, explicitTopic) {
  if (explicitTopic) return String(explicitTopic).trim();

  const raw = String(request || "").trim();
  if (!raw) return "workflow de IA";

  const cleaned = raw
    .replace(/criar\s+(um\s+)?post\s+de\s+infograf(?:ico|ic)/i, "")
    .replace(/criar\s+(um\s+)?infograf(?:ico|ic)/i, "")
    .replace(/post\s+de\s+infograf(?:ico|ic)/i, "")
    .replace(/\b(news|tutorial)\b/i, "")
    .replace(/\bsobre\b/i, "")
    .replace(/\bpara\b/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "workflow de IA";
}

function inferContentType(args, request, topic) {
  if (args["content-type"]) return String(args["content-type"]).trim().toLowerCase();

  const combined = `${request || ""} ${topic || ""}`.toLowerCase();
  if (/(tutorial|guia|framework|checklist|passo a passo|como fazer|como montar)/i.test(combined)) {
    return "tutorial";
  }
  if (/(news|noticia|mercado|update|novidade|mudou|lancamento|tendencia)/i.test(combined)) {
    return "news";
  }
  return "news";
}

function buildHashtags(topic, contentType) {
  const normalizedTopic = slugify(topic).split("-").filter(Boolean);
  const topicToken = normalizedTopic.slice(0, 2).join("");
  const shared = ["#Prompthub", "#AI", "#AIAgents"];
  const extras = contentType === "tutorial"
    ? ["#WorkflowAutomation", "#Tutorial", "#Builders"]
    : ["#Infographic", "#AINews", "#ProductOps"];
  if (topicToken) {
    extras.push(`#${topicToken.charAt(0).toUpperCase()}${topicToken.slice(1)}`);
  }
  return [...new Set([...shared, ...extras])].slice(0, 6);
}

function buildTutorialSections(topic) {
  const subject = titleCase(topic);
  return [
    {
      label: "Diagnostico",
      title: "Onde o fluxo costuma travar",
      body: `Em ${subject}, o gargalo aparece antes da automacao: contexto fraco e handoff sem dono.`,
    },
    {
      label: "Estrutura",
      title: "O que precisa existir antes",
      body: `Defina fluxo, aprovacao e fallback. Sem isso, ${subject} acelera ruido.`,
    },
    {
      label: "Execucao",
      title: "Como colocar em operacao",
      body: `Escolha um workflow inteiro e conecte ${subject} a uma metrica clara de saida.`,
    },
  ];
}

function buildNewsSections(topic) {
  const subject = titleCase(topic);
  return [
    {
      label: "Sinal",
      title: "O sinal do mercado",
      body: `${subject} saiu da curiosidade e entrou na rotina de produto e operacao.`,
    },
    {
      label: "Impacto",
      title: "Onde o impacto bate primeiro",
      body: `Quem adapta ${subject} cedo reduz retrabalho, ganha velocidade e protege margem.`,
    },
    {
      label: "Acao",
      title: "O proximo passo da equipe",
      body: `Mapeie um fluxo inteiro, defina ownership e use ${subject} para fechar loop.`,
    },
  ];
}

function buildInfographicContent(args) {
  const request = String(args.request || "").trim();
  const topic = inferTopic(request, args.topic);
  const contentType = inferContentType(args, request, topic);
  const theme = resolveInfographicTheme(args["theme-name"], contentType);
  const sections = contentType === "tutorial" ? buildTutorialSections(topic) : buildNewsSections(topic);
  const headline =
    args.headline ||
    (contentType === "tutorial"
      ? `${titleCase(topic)} sem caos operacional`
      : `${titleCase(topic)} virou tema de operacao`);
  const subheadline =
    args.subheadline ||
    (contentType === "tutorial"
      ? "Use este mapa para sair da teoria e montar um fluxo legivel, forte e pronto para escalar."
      : "Resumo visual para entender o sinal do mercado, o impacto real e a resposta pratica do time.");
  const eyebrow = `PROMPTHUB | ${contentType.toUpperCase()} INFOGRAPHIC`;
  const cta =
    args.cta ||
    (contentType === "tutorial"
      ? "Salve para usar no proximo desenho de workflow."
      : "Envie para o time antes da proxima decisao de produto.");
  const hashtags = buildHashtags(topic, contentType);
  const caption = [headline, "", subheadline, "", cta, "", hashtags.join(" ")].join("\n");

  return {
    mode: "infographic",
    request,
    topic,
    contentType,
    size: { width: WIDTH, height: HEIGHT },
    brand: {
      name: "Prompthub",
      style: theme.style,
      themeName: theme.themeName,
      visualDirection: theme.visualDirection,
      palette: theme.palette,
      typography: theme.typography,
    },
    hierarchy: {
      eyebrow,
      headline,
      subheadline,
      sections,
      cta,
    },
    caption,
    hashtags,
  };
}

function loadReferenceManifest(refDir) {
  const manifestPath = path.join(refDir, "manifest.json");
  const manifest = readJsonIfExists(manifestPath, null);
  return { manifestPath, manifest };
}

function listReferenceFiles(refDir) {
  if (!fs.existsSync(refDir)) {
    throw new Error(`Pasta de referencia nao encontrada: ${refDir}`);
  }

  return fs
    .readdirSync(refDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /\.(png|jpe?g|webp)$/i.test(name));
}

function buildFallbackManifest(refDir) {
  const files = listReferenceFiles(refDir);
  const entities = files.map((fileName, index) => ({
    id: slugify(fileName),
    file: fileName,
    type: /logo/i.test(fileName) ? "brand" : "character",
    active: true,
    priority: 100 - index,
  }));

  const primaryCharacter = entities.find((entity) => entity.type === "character");
  return {
    default: primaryCharacter?.file || files[0] || null,
    content_rules: {},
    entities,
  };
}

function findEntityByToken(manifest, token) {
  if (!token) return null;
  const normalized = String(token).trim().toLowerCase();
  return (manifest.entities || []).find((entity) => {
    if (!entity || entity.active === false) return false;
    return String(entity.id || "").trim().toLowerCase() === normalized
      || String(entity.file || "").trim().toLowerCase() === normalized;
  }) || null;
}

function sortByPriority(entities) {
  return [...entities].sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0));
}

function resolveReferenceSelection({ refDir, contentType }) {
  const { manifestPath, manifest } = loadReferenceManifest(refDir);
  const referenceManifest = manifest || buildFallbackManifest(refDir);
  const entities = Array.isArray(referenceManifest.entities) ? referenceManifest.entities.filter((entity) => entity?.active !== false) : [];
  const rule = referenceManifest.content_rules?.[contentType] || {};

  const primaryEntity =
    findEntityByToken(referenceManifest, rule.primary)
    || findEntityByToken(referenceManifest, referenceManifest.default)
    || sortByPriority(entities.filter((entity) => entity.type === "character"))[0]
    || null;

  if (!primaryEntity) {
    throw new Error(`Nenhum avatar ativo foi encontrado em ${refDir}`);
  }

  const secondaryEntities = (rule.secondary_optional || [])
    .map((token) => findEntityByToken(referenceManifest, token))
    .filter(Boolean);

  const logoEntity =
    secondaryEntities.find((entity) => entity.type === "brand")
    || sortByPriority(entities.filter((entity) => entity.type === "brand"))[0]
    || null;

  const primaryPath = path.join(refDir, primaryEntity.file);
  if (!fs.existsSync(primaryPath)) {
    throw new Error(`Avatar de referencia ausente: ${primaryPath}`);
  }

  const logoPath = logoEntity ? path.join(refDir, logoEntity.file) : null;
  if (logoPath && !fs.existsSync(logoPath)) {
    throw new Error(`Logo de referencia ausente: ${logoPath}`);
  }

  return {
    refDir,
    manifestPath: fs.existsSync(manifestPath) ? manifestPath : null,
    manifest: referenceManifest,
    contentType,
    primary: {
      ...primaryEntity,
      path: primaryPath,
    },
    secondary: logoEntity
      ? [
          {
            ...logoEntity,
            path: logoPath,
          },
        ]
      : [],
  };
}

function fileToDataUrl(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mime = extension === ".png"
    ? "image/png"
    : extension === ".webp"
      ? "image/webp"
      : "image/jpeg";
  const base64 = fs.readFileSync(filePath).toString("base64");
  return `data:${mime};base64,${base64}`;
}

function buildOpenRouterPrompt(packageData, referenceSelection) {
  const sectionTitles = packageData.hierarchy.sections.map((section) => section.title).join("; ");
  return [
    `Create a single Instagram infographic visual plate for ${packageData.brand.name}.`,
    `Canvas size: ${WIDTH}x${HEIGHT}, portrait.`,
    `Use the attached primary avatar as the visual character reference.`,
    "Use the attached brand asset as a secondary reference when available.",
    `Visual direction: ${packageData.brand.style}. ${packageData.brand.visualDirection}.`,
    `Theme name: ${packageData.brand.themeName}.`,
    `Primary accent: ${packageData.brand.palette.accent}. Secondary accent: ${packageData.brand.palette.accentAlt}.`,
    `Topic: ${packageData.topic}.`,
    `Content type: ${packageData.contentType}.`,
    `Headline theme: ${packageData.hierarchy.headline}.`,
    `Support structure: ${sectionTitles}.`,
    "Composition rules: keep the avatar integrated on the right third, reserve a clean headline area on the upper-left, reserve three stacked card zones on the left and lower-middle for typography overlay, keep the background uncluttered behind those safe zones.",
    "Do not render readable words, letters, paragraphs, logos, numbers, watermarks, signatures, UI debug labels or fake lorem ipsum.",
    "The result must feel like a real premium infographic plate, not a movie poster, not splash art, and not a carousel slide.",
  ].join(" ");
}

function buildPromptBundle(packageData, referenceSelection) {
  const visualPrompt = buildOpenRouterPrompt(packageData, referenceSelection);
  const negativePrompt = [
    "readable text",
    "letters",
    "paragraphs",
    "watermark",
    "logo wall",
    "busy background behind text",
    "extra fingers",
    "extra limbs",
    "duplicate faces",
    "low contrast",
  ].join(", ");

  return {
    model: normalizeImageModel(process.env.OPENROUTER_IMAGE_MODEL || process.env.MODEL_IMAGE || DEFAULT_IMAGE_MODEL),
    baseUrl: process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL,
    visualPrompt,
    negativePrompt,
    size: packageData.size,
    imageConfig: {
      aspect_ratio: "4:5",
      image_size: "2K",
    },
    layoutPlan: {
      avatarAnchor: "right-third",
      headlineZone: "upper-left",
      sectionZone: "left-column cards",
      footerZone: "bottom-left",
    },
    references: {
      primary: referenceSelection.primary.file,
      secondary: referenceSelection.secondary.map((entity) => entity.file),
    },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wrapText(text, maxChars) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function renderTextLines(lines, options) {
  const {
    x,
    startY,
    lineHeight,
    fontSize,
    fontWeight,
    fill,
    fontFamily,
    letterSpacing,
  } = options;

  return lines
    .map((line, index) => (
      `<text x="${x}" y="${startY + index * lineHeight}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}" letter-spacing="${letterSpacing || 0}" font-family="${fontFamily}">${escapeXml(line)}</text>`
    ))
    .join("\n");
}

function buildOverlaySvg(packageData, referenceSelection) {
  const palette = packageData.brand.palette;
  const typography = packageData.brand.typography;
  const headlineLines = wrapText(packageData.hierarchy.headline, 18).slice(0, 3);
  const subheadlineLines = wrapText(packageData.hierarchy.subheadline, 34).slice(0, 3);
  const sections = packageData.hierarchy.sections.slice(0, 3);
  const logoEntity = referenceSelection.secondary.find((entity) => entity.type === "brand") || null;
  const logoMarkup = logoEntity
    ? `<image href="${fileToDataUrl(logoEntity.path)}" x="820" y="74" width="184" height="123" preserveAspectRatio="xMidYMid meet" opacity="0.92" />`
    : "";

  const cardsMarkup = sections.map((section, index) => {
    const top = 552 + index * 202;
    const titleLines = wrapText(section.title, 22).slice(0, 2);
    const bodyLines = wrapText(section.body, 42).slice(0, 3);
    const titleStartY = top + 92;
    const bodyStartY = titleStartY + titleLines.length * 36 + 10;
    return `
      <rect x="72" y="${top}" width="584" height="184" rx="30" fill="${palette.surface}" stroke="${palette.border}" />
      <rect x="98" y="${top + 24}" width="132" height="28" rx="14" fill="${palette.surfaceSoft}" />
      <text x="114" y="${top + 44}" font-size="15" font-weight="800" fill="${palette.accent}" font-family="${typography.eyebrow}" letter-spacing="1.4">${escapeXml(section.label.toUpperCase())}</text>
      ${renderTextLines(titleLines, {
        x: 98,
        startY: titleStartY,
        lineHeight: 36,
        fontSize: 30,
        fontWeight: 800,
        fill: palette.text,
        fontFamily: typography.headline,
        letterSpacing: -0.4,
      })}
      ${renderTextLines(bodyLines, {
        x: 98,
        startY: bodyStartY,
        lineHeight: 25,
        fontSize: 20,
        fontWeight: 600,
        fill: palette.muted,
        fontFamily: typography.body,
      })}
    `;
  }).join("\n");

  return `
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="overlay-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${palette.bgTop}" stop-opacity="0.22" />
          <stop offset="100%" stop-color="${palette.bgBottom}" stop-opacity="0.04" />
        </linearGradient>
      </defs>
      <rect x="34" y="34" width="${WIDTH - 68}" height="${HEIGHT - 68}" rx="34" fill="url(#overlay-bg)" stroke="${palette.border}" />
      <rect x="58" y="58" width="230" height="40" rx="20" fill="${palette.surface}" stroke="${palette.border}" />
      <circle cx="84" cy="78" r="5.5" fill="${palette.accent}" />
      <text x="98" y="84" font-size="15" font-weight="800" fill="${palette.text}" font-family="${typography.eyebrow}" letter-spacing="1.8">${escapeXml(packageData.hierarchy.eyebrow)}</text>
      ${logoMarkup}
      ${renderTextLines(headlineLines, {
        x: 72,
        startY: 188,
        lineHeight: 72,
        fontSize: 68,
        fontWeight: 800,
        fill: palette.text,
        fontFamily: typography.headline,
        letterSpacing: -1.4,
      })}
      <rect x="72" y="404" width="164" height="8" rx="4" fill="${palette.accent}" />
      ${renderTextLines(subheadlineLines, {
        x: 72,
        startY: 456,
        lineHeight: 36,
        fontSize: 28,
        fontWeight: 700,
        fill: palette.muted,
        fontFamily: typography.body,
      })}
      ${cardsMarkup}
      <rect x="72" y="1170" width="430" height="80" rx="24" fill="${palette.surface}" stroke="${palette.border}" />
      <text x="102" y="1216" font-size="28" font-weight="800" fill="${palette.text}" font-family="${typography.body}">${escapeXml(packageData.hierarchy.cta)}</text>
      <text x="72" y="1298" font-size="18" font-weight="700" fill="${palette.accent}" font-family="${typography.eyebrow}" letter-spacing="1.5">PROMPTHUB</text>
    </svg>
  `;
}

async function renderFinalOutputs({ manifest, packageData, referenceSelection }) {
  const overlaySvg = buildOverlaySvg(packageData, referenceSelection);
  const baseBuffer = await sharp(manifest.files.baseImage)
    .resize(WIDTH, HEIGHT, { fit: "cover" })
    .png()
    .toBuffer();

  await sharp(baseBuffer)
    .composite([{ input: Buffer.from(overlaySvg) }])
    .png()
    .toFile(manifest.files.finalPng);

  await sharp(manifest.files.finalPng).jpeg({ quality: 94 }).toFile(manifest.files.finalJpg);
}

function normalizeOpenRouterImagePayload(payload) {
  if (!payload) return null;
  if (typeof payload === "string" && payload.startsWith("data:image")) return payload;
  if (typeof payload === "string" && /^https?:\/\//i.test(payload)) return payload;
  return null;
}

function extractGeneratedImage(responseJson) {
  const message = responseJson?.choices?.[0]?.message || {};
  const fromImages = Array.isArray(message.images)
    ? message.images
        .map((entry) => normalizeOpenRouterImagePayload(entry?.image_url?.url || entry?.url || null))
        .find(Boolean)
    : null;
  if (fromImages) return fromImages;

  if (typeof message.content === "string") {
    const direct = normalizeOpenRouterImagePayload(message.content);
    if (direct) return direct;
  }

  if (Array.isArray(message.content)) {
    const contentImage = message.content
      .map((entry) => normalizeOpenRouterImagePayload(entry?.image_url?.url || entry?.url || null))
      .find(Boolean);
    if (contentImage) return contentImage;
  }

  return null;
}

async function writeImagePayload(imagePayload, outputPath) {
  if (imagePayload.startsWith("data:image")) {
    const encoded = imagePayload.slice(imagePayload.indexOf(",") + 1);
    fs.writeFileSync(outputPath, Buffer.from(encoded, "base64"));
    return;
  }

  const response = await fetch(imagePayload);
  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem gerada: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
}

async function callOpenRouterImage(promptBundle, referenceSelection) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY nao configurada");
  }

  const messagesContent = [
    {
      type: "text",
      text: `${promptBundle.visualPrompt} Avoid: ${promptBundle.negativePrompt}.`,
    },
    {
      type: "image_url",
      image_url: {
        url: fileToDataUrl(referenceSelection.primary.path),
      },
    },
    ...referenceSelection.secondary.map((entity) => ({
      type: "image_url",
      image_url: {
        url: fileToDataUrl(entity.path),
      },
    })),
  ];

  const requestBody = {
    model: promptBundle.model,
    messages: [
      {
        role: "user",
        content: messagesContent,
      },
    ],
    modalities: ["image", "text"],
    image_config: promptBundle.imageConfig,
  };

  const executeRequest = async (body) => {
    const maxAttempts = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetch(`${promptBundle.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
            "X-Title": "Prompthub Opensquad Infographic",
          },
          body: JSON.stringify(body),
        });

        const rawText = await response.text();
        if (!rawText.trim()) {
          throw new Error("Resposta vazia da API do OpenRouter");
        }

        let responseJson = null;
        try {
          responseJson = JSON.parse(rawText);
        } catch {
          throw new Error(`Resposta invalida da API do OpenRouter: ${rawText.slice(0, 240)}`);
        }

        return { response, rawText, responseJson };
      } catch (error) {
        lastError = error;
        if (attempt === maxAttempts) break;
        await sleep(1500 * attempt);
      }
    }

    throw lastError;
  };

  let finalRequestBody = requestBody;
  let { response, rawText, responseJson } = await executeRequest(finalRequestBody);

  if (!response.ok && /not a valid model id/i.test(rawText)) {
    finalRequestBody = {
      ...requestBody,
      model: DEFAULT_IMAGE_MODEL,
    };
    ({ response, rawText, responseJson } = await executeRequest(finalRequestBody));
  }

  if (!response.ok) {
    throw new Error(`Falha do OpenRouter [${response.status}]: ${rawText.slice(0, 240)}`);
  }

  let imagePayload = extractGeneratedImage(responseJson);
  if (!imagePayload) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await sleep(1400 * attempt);
      ({ response, rawText, responseJson } = await executeRequest(finalRequestBody));
      if (!response.ok) break;
      imagePayload = extractGeneratedImage(responseJson);
      if (imagePayload) break;
    }
  }

  if (!imagePayload && finalRequestBody.model !== FALLBACK_IMAGE_MODEL) {
    finalRequestBody = {
      ...finalRequestBody,
      model: FALLBACK_IMAGE_MODEL,
    };
    ({ response, rawText, responseJson } = await executeRequest(finalRequestBody));
    if (!response.ok) {
      throw new Error(`Falha do OpenRouter [${response.status}]: ${rawText.slice(0, 240)}`);
    }
    imagePayload = extractGeneratedImage(responseJson);
  }

  if (!imagePayload) {
    throw new Error("A resposta do OpenRouter nao trouxe uma imagem valida");
  }

  return {
    requestBody: finalRequestBody,
    responseJson,
    imagePayload,
  };
}

async function composeInfographicImage({ packageData, referenceSelection, outputDir, dryRun = false, composeOnly = false }) {
  const promptBundle = buildPromptBundle(packageData, referenceSelection);
  const manifestPath = path.join(outputDir, "infographic-manifest.json");
  const promptPath = path.join(outputDir, "visual-prompt.txt");
  const packagePath = path.join(outputDir, "infographic-package.json");
  const captionPath = path.join(outputDir, "caption.txt");
  const referencePath = path.join(outputDir, "reference-selection.json");

  ensureDir(outputDir);
  writeJson(packagePath, packageData);
  writeJson(referencePath, {
    contentType: referenceSelection.contentType,
    primary: referenceSelection.primary,
    secondary: referenceSelection.secondary,
    manifestPath: referenceSelection.manifestPath,
  });
  writeText(promptPath, `${promptBundle.visualPrompt}\n\nAvoid: ${promptBundle.negativePrompt}\n`);
  writeText(captionPath, `${packageData.caption}\n`);

  const manifest = {
    mode: "infographic",
    status: dryRun ? "dry-run" : "pending",
    size: packageData.size,
    topic: packageData.topic,
    contentType: packageData.contentType,
    themeName: packageData.brand?.themeName || "green-core",
    model: promptBundle.model,
    outputDir,
    files: {
      package: packagePath,
      prompt: promptPath,
      references: referencePath,
      caption: captionPath,
      baseImage: path.join(outputDir, "infographic-base.png"),
      finalPng: path.join(outputDir, "infographic-final.png"),
      finalJpg: path.join(outputDir, "infographic-final.jpg"),
    },
    references: {
      primary: referenceSelection.primary.file,
      secondary: referenceSelection.secondary.map((entity) => entity.file),
    },
  };

  if (dryRun) {
    writeJson(manifestPath, manifest);
    return { manifestPath, manifest };
  }

  let openRouterResult = null;
  if (!composeOnly) {
    openRouterResult = await callOpenRouterImage(promptBundle, referenceSelection);
    await writeImagePayload(openRouterResult.imagePayload, manifest.files.baseImage);
  } else if (!fs.existsSync(manifest.files.baseImage)) {
    throw new Error(`Base image ausente para compose-only: ${manifest.files.baseImage}`);
  }

  await renderFinalOutputs({
    manifest,
    packageData,
    referenceSelection,
  });

  manifest.status = "ready";
  manifest.generatedAt = new Date().toISOString();
  manifest.openRouter = {
    requestPreview: {
      model: openRouterResult?.requestBody?.model || promptBundle.model,
      messageCount: openRouterResult?.requestBody?.messages?.length || 0,
      references: 1 + referenceSelection.secondary.length,
      composeOnly,
    },
  };

  if (openRouterResult?.responseJson) {
    writeJson(path.join(outputDir, "openrouter-response.json"), openRouterResult.responseJson);
  }
  writeJson(manifestPath, manifest);
  return { manifestPath, manifest };
}

function buildOutputDir(args, packageData) {
  if (args["output-dir"]) return path.resolve(args["output-dir"]);
  return path.join(DEFAULT_OUTPUT_ROOT, `${todaySlug()}-${slugify(packageData.topic)}`);
}

function runCarouselWorkflow(args) {
  const scriptPath = path.resolve("scripts", "instagram-carousel", "orchestrate-batch.js");
  const passThroughArgs = [scriptPath];
  const allowedKeys = ["count", "output-dir", "brief-file", "objective", "pillars", "niche", "audience", "style", "language", "aggressiveness", "cta", "history-file"];

  allowedKeys.forEach((key) => {
    if (args[key] === undefined) return;
    passThroughArgs.push(`--${key}`);
    if (args[key] !== true) {
      passThroughArgs.push(String(args[key]));
    }
  });

  const result = spawnSync(process.execPath, passThroughArgs, {
    stdio: "inherit",
    cwd: process.cwd(),
  });

  if (result.status !== 0) {
    throw new Error(`Fluxo carousel falhou com exit code ${result.status}`);
  }
}

function detectWorkflowMode(args) {
  if (args.mode) return String(args.mode).trim().toLowerCase();
  const request = String(args.request || "").toLowerCase();
  if (/(infograf|imagem unica|single image|post unico)/i.test(request)) {
    return "infographic";
  }
  return "carousel";
}

function orchestrateInfographic(args) {
  const packageData = buildInfographicContent(args);
  const outputDir = buildOutputDir(args, packageData);
  const referenceSelection = resolveReferenceSelection({
    refDir: path.resolve(args["ref-dir"] || DEFAULT_REF_DIR),
    contentType: packageData.contentType,
  });
  const promptBundle = buildPromptBundle(packageData, referenceSelection);

  ensureDir(outputDir);
  writeJson(path.join(outputDir, "infographic-package.json"), packageData);
  writeJson(path.join(outputDir, "reference-selection.json"), {
    manifestPath: referenceSelection.manifestPath,
    contentType: referenceSelection.contentType,
    primary: referenceSelection.primary,
    secondary: referenceSelection.secondary,
  });
  writeJson(path.join(outputDir, "prompt-bundle.json"), promptBundle);
  writeText(path.join(outputDir, "visual-prompt.txt"), `${promptBundle.visualPrompt}\n\nAvoid: ${promptBundle.negativePrompt}\n`);
  writeText(path.join(outputDir, "caption.txt"), `${packageData.caption}\n`);

  return {
    outputDir,
    packageData,
    referenceSelection,
    promptBundle,
  };
}

async function generateInfographic(args) {
  let packageData = null;
  let outputDir = null;
  let referenceSelection = null;

  if (args["package-file"]) {
    const packagePath = path.resolve(args["package-file"]);
    packageData = readJsonIfExists(packagePath, null);
    if (!packageData) {
      throw new Error(`Pacote de infographic invalido: ${packagePath}`);
    }
    outputDir = path.dirname(packagePath);
    referenceSelection = resolveReferenceSelection({
      refDir: path.resolve(args["ref-dir"] || DEFAULT_REF_DIR),
      contentType: packageData.contentType || "news",
    });
  } else {
    const orchestrated = orchestrateInfographic(args);
    packageData = orchestrated.packageData;
    outputDir = orchestrated.outputDir;
    referenceSelection = orchestrated.referenceSelection;
  }

  return composeInfographicImage({
    packageData,
    referenceSelection,
    outputDir,
    dryRun: Boolean(args["dry-run"]),
    composeOnly: Boolean(args["compose-only"]),
  });
}

async function runWorkflow(args) {
  const mode = detectWorkflowMode(args);
  if (mode === "carousel") {
    runCarouselWorkflow(args);
    return {
      mode,
      outputDir: path.resolve(args["output-dir"] || ".context/instagram-orchestrator"),
    };
  }

  const orchestrated = orchestrateInfographic(args);
  const generated = await composeInfographicImage({
    packageData: orchestrated.packageData,
    referenceSelection: orchestrated.referenceSelection,
    outputDir: orchestrated.outputDir,
    dryRun: Boolean(args["dry-run"]),
  });

  return {
    mode,
    outputDir: orchestrated.outputDir,
    manifestPath: generated.manifestPath,
    manifest: generated.manifest,
  };
}

module.exports = {
  WIDTH,
  HEIGHT,
  parseArgs,
  buildInfographicContent,
  buildPromptBundle,
  resolveReferenceSelection,
  composeInfographicImage,
  orchestrateInfographic,
  generateInfographic,
  detectWorkflowMode,
  runWorkflow,
};
