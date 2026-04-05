#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_COUNT = 10;
const HISTORY_LIMIT = 60;
const DEFAULT_HISTORY_FILE = path.resolve(".context", "instagram-orchestrator", "history.json");
const BANNED_TEXT_LEAKAGE = [
  "prompt:",
  "negative prompt",
  "use style",
  "render",
  "cinematic lighting",
  "aspect ratio",
  "4k",
  "seed",
];

const POST_TYPES = [
  "noticia_analise",
  "tutorial_framework",
  "comparacao_opiniao",
  "erro_correcao",
  "bastidor_processo",
  "ferramenta_aplicacao",
  "tendencia_previsao",
  "checklist_execucao",
  "case_transformacao",
  "posicionamento_autoridade",
];

const CTA_ROTATION = [
  "salve este carrossel para revisar com o time",
  "envie para quem esta redesenhando workflow com IA",
  "guarde este mapa para a proxima priorizacao",
  "use este carrossel como checklist de execucao",
  "marque quem precisa sair do piloto e ir para operacao",
  "leve este framework para o proximo planning",
  "compare isso com o workflow que voce opera hoje",
  "use este post para auditar o processo atual",
];

const WEEKDAY_LABELS = {
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
  sun: "sunday",
};

const WEEKDAY_TO_FAMILY = {
  mon: "blue-cyan",
  tue: "green-cyan",
  wed: "purple-pink",
  thu: "orange-red",
  fri: "gold-luxe",
};

const GRADIENT_FAMILY_MAP = {
  "blue-cyan": ["neon-blue-cyan", "space-blue", "tech-navy"],
  "green-cyan": ["green-cyan-cyber", "cyber-green", "lime-electric"],
  "purple-pink": ["purple-pink-neon", "purple-void", "black-violet-cyan"],
  "orange-red": ["orange-pink-purple", "red-magenta-neon"],
  "gold-luxe": ["gold-orange-luxe"],
};

const FAMILY_TYPOGRAPHY_MAP = {
  "blue-cyan": ["executive-sans", "split-display"],
  "green-cyan": ["signal-condensed", "mono-signal"],
  "purple-pink": ["display-grotesk", "condensed-impact"],
  "orange-red": ["condensed-impact", "editorial-serif-dark"],
  "gold-luxe": ["luxury-serif", "editorial-serif-dark"],
};

const PALETTE_PRESETS = {
  "neon-blue-cyan": {
    name: "neon-blue-cyan",
    family: "blue-cyan",
    dominant: "blue-cyan",
    secondary: "cyan-ice",
    mood: "tecnologia, automacao e dashboard premium",
    gradient: "#050816 -> #00E5FF -> #1F6BFF",
    textRule: "titulo branco, subtitulo cinza-claro, neon limitado a borda, glow e underline",
    variants: ["neon-blue-cyan-v1", "neon-blue-cyan-v2", "neon-blue-cyan-v3"],
  },
  "space-blue": {
    name: "space-blue",
    family: "blue-cyan",
    dominant: "space-blue",
    secondary: "navy-cyan",
    mood: "galaxia profunda com leitura corporativa",
    gradient: "#050816 -> #0B1D3A -> #123C69",
    textRule: "texto principal neutro, cor forte so em trilhos, chips e brilho",
    variants: ["space-blue-v1", "space-blue-v2", "space-blue-v3"],
  },
  "tech-navy": {
    name: "tech-navy",
    family: "blue-cyan",
    dominant: "tech-navy",
    secondary: "dashboard-cyan",
    mood: "B2B tech, IA e sistema de decisao",
    gradient: "#07111F -> #0C2340 -> #123D6A",
    textRule: "texto branco/cinza claro, glow apenas em interfaces e rails",
    variants: ["tech-navy-v1", "tech-navy-v2", "tech-navy-v3"],
  },
  "green-cyan-cyber": {
    name: "green-cyan-cyber",
    family: "green-cyan",
    dominant: "green-cyan",
    secondary: "cyber-cyan",
    mood: "automacao, dados e performance hacker",
    gradient: "#06131A -> #00FF94 -> #00D9FF",
    textRule: "texto branco e cinza frio, verde e ciano reservados para detalhes",
    variants: ["green-cyan-cyber-v1", "green-cyan-cyber-v2", "green-cyan-cyber-v3"],
  },
  "cyber-green": {
    name: "cyber-green",
    family: "green-cyan",
    dominant: "cyber-green",
    secondary: "deep-teal",
    mood: "hacker controlado, operacao e automacao",
    gradient: "#03130F -> #062E25 -> #0A5C47",
    textRule: "titulo branco, apoio cinza frio, neon so em glow e prova",
    variants: ["cyber-green-v1", "cyber-green-v2", "cyber-green-v3"],
  },
  "lime-electric": {
    name: "lime-electric",
    family: "green-cyan",
    dominant: "lime-electric",
    secondary: "electric-green",
    mood: "velocidade, checklist e performance",
    gradient: "#06131A -> #D9FF00 -> #00FF85",
    textRule: "cor vibrante apenas em bullets, keylines e chips",
    variants: ["lime-electric-v1", "lime-electric-v2", "lime-electric-v3"],
  },
  "purple-pink-neon": {
    name: "purple-pink-neon",
    family: "purple-pink",
    dominant: "purple-pink",
    secondary: "neon-lavender",
    mood: "startup futurista com energia alta",
    gradient: "#140A20 -> #A855F7 -> #FF4FD8",
    textRule: "texto neutro, magenta e roxo so em impacto e marcação",
    variants: ["purple-pink-neon-v1", "purple-pink-neon-v2", "purple-pink-neon-v3"],
  },
  "purple-void": {
    name: "purple-void",
    family: "purple-pink",
    dominant: "purple-void",
    secondary: "void-magenta",
    mood: "sci-fi elegante e misterioso",
    gradient: "#050510 -> #1A0B2E -> #3B0764",
    textRule: "tipografia clara, glow concentrado em linhas e planos",
    variants: ["purple-void-v1", "purple-void-v2", "purple-void-v3"],
  },
  "black-violet-cyan": {
    name: "black-violet-cyan",
    family: "purple-pink",
    dominant: "black-violet",
    secondary: "violet-cyan",
    mood: "premium cyberpunk com profundidade",
    gradient: "#030303 -> #1B0F33 -> #0A4D68",
    textRule: "manter corpo neutro e usar cyan apenas como prova e rail",
    variants: ["black-violet-cyan-v1", "black-violet-cyan-v2", "black-violet-cyan-v3"],
  },
  "orange-pink-purple": {
    name: "orange-pink-purple",
    family: "orange-red",
    dominant: "orange-magenta",
    secondary: "warm-purple",
    mood: "growth, marketing e energia de feed",
    gradient: "#160A0A -> #FF6B2C -> #FF4D9D",
    textRule: "usar o quente no CTA e prova, nao no corpo do texto",
    variants: ["orange-pink-purple-v1", "orange-pink-purple-v2", "orange-pink-purple-v3"],
  },
  "red-magenta-neon": {
    name: "red-magenta-neon",
    family: "orange-red",
    dominant: "red-magenta",
    secondary: "alert-purple",
    mood: "urgencia, impacto e headlines agressivas",
    gradient: "#1A1212 -> #FF3B3B -> #8F00FF",
    textRule: "vermelho e magenta restritos a alertas, badges e divisores",
    variants: ["red-magenta-neon-v1", "red-magenta-neon-v2", "red-magenta-neon-v3"],
  },
  "gold-orange-luxe": {
    name: "gold-orange-luxe",
    family: "gold-luxe",
    dominant: "gold-premium",
    secondary: "warm-luxe",
    mood: "autoridade, monetizacao e premium dark",
    gradient: "#0A0A0A -> #5C3A00 -> #FFB800",
    textRule: "brilho dourado apenas em assinatura, underline e CTA visual",
    variants: ["gold-orange-luxe-v1", "gold-orange-luxe-v2", "gold-orange-luxe-v3"],
  },
  "acid-lime": {
    name: "acid-lime",
    dominant: "green-black",
    secondary: "acid-lime",
    mood: "dark cyberpunk operator",
    gradient: "deep green-black base with acid-lime neon glow",
    textRule: "headline white, support cool-white, accent only in underline and interface details",
  },
  "ice-blue": {
    name: "ice-blue",
    dominant: "navy-black",
    secondary: "ice-blue",
    mood: "cold systems dashboard",
    gradient: "navy-black base with ice-blue and cyan haze",
    textRule: "headline white, support pale blue-white, no saturated body text",
  },
  "electric-violet": {
    name: "electric-violet",
    dominant: "indigo-black",
    secondary: "electric-violet",
    mood: "futurist premium editorial",
    gradient: "indigo-black base with electric-violet and soft cyan spill",
    textRule: "headline white, support soft lavender-white, accent only in dividers and glows",
  },
  "graphite-cyan": {
    name: "graphite-cyan",
    dominant: "graphite-black",
    secondary: "cyan-glow",
    mood: "premium mission-control",
    gradient: "graphite-black base with cyan signal glow",
    textRule: "headline white, support silver-white, restrained cyan highlights",
  },
  "plasma-amber": {
    name: "plasma-amber",
    dominant: "charcoal-black",
    secondary: "amber-orange",
    mood: "alert-state premium ops",
    gradient: "charcoal-black base with amber plasma glow",
    textRule: "headline white, support warm-white, amber only in accents and proof areas",
  },
  "lunar-violet": {
    name: "lunar-violet",
    dominant: "slate-night",
    secondary: "violet-cyan",
    mood: "ledger / timeline sci-fi",
    gradient: "slate-night base with violet core and cyan edge glow",
    textRule: "headline white, support mist-white, neon limited to markers and rails",
  },
  "magenta-teal": {
    name: "magenta-teal",
    dominant: "space-black",
    secondary: "magenta-teal",
    mood: "editorial galaxy neon",
    gradient: "space-black base with magenta-to-teal chroma glow",
    textRule: "headline white, support cool-white, avoid colored body text",
  },
};

const TYPOGRAPHY_PRESETS = {
  "display-grotesk": {
    name: "display-grotesk",
    titleRole: "headline grotesk pesada com leitura premium",
    supportRole: "sans limpa para apoio e corpo",
    eyebrowRole: "sans compacta para sinalizacao tecnica",
  },
  "signal-condensed": {
    name: "signal-condensed",
    titleRole: "headline condensada para alta densidade e leitura rapida",
    supportRole: "sans neutra e objetiva",
    eyebrowRole: "condensed caps para chips e contadores",
  },
  "split-display": {
    name: "split-display",
    titleRole: "display forte para layouts com divisao visual",
    supportRole: "sans clara para contraste com a headline",
    eyebrowRole: "tech sans para HUD e labels editoriais",
  },
  "editorial-serif-dark": {
    name: "editorial-serif-dark",
    titleRole: "serif editorial controlada para posts mais premium",
    supportRole: "sans limpa para manter legibilidade em mobile",
    eyebrowRole: "sans pequena para nao competir com a headline",
  },
  "mono-signal": {
    name: "mono-signal",
    titleRole: "sans forte com apoio de mono-tech em sinais de sistema",
    supportRole: "sans funcional para explicacao",
    eyebrowRole: "mono-tech para ledger, timeline e rails",
  },
  "executive-sans": {
    name: "executive-sans",
    titleRole: "headline sans premium com leitura B2B e decisao executiva",
    supportRole: "sans editorial limpa para contexto e consequencia",
    eyebrowRole: "small caps de sistema para indicadores e eyebrow",
  },
  "condensed-impact": {
    name: "condensed-impact",
    titleRole: "headline condensada agressiva para comparacao e alerta",
    supportRole: "sans objetiva com ritmo rapido em mobile",
    eyebrowRole: "condensed caps para chips, rail e prova curta",
  },
  "luxury-serif": {
    name: "luxury-serif",
    titleRole: "serif premium para autoridade e oferta high-ticket",
    supportRole: "sans clara para segurar contraste e legibilidade",
    eyebrowRole: "sans refinada para etiqueta editorial discreta",
  },
};

const TEMPLATE_LIBRARY = [
  {
    id: "cyberpunk-green-core",
    palettePreset: "acid-lime",
    dominant: "green-black",
    secondary: "acid-lime",
    texture: "grid_hud",
    composition: "headline_center",
    layoutFamily: "center-manifesto",
    glowLevel: "medio",
    typography: "display-grotesk",
  },
  {
    id: "petroleum-radar",
    palettePreset: "ice-blue",
    dominant: "navy-black",
    secondary: "ice-blue",
    texture: "radar_lines",
    composition: "headline_left_card",
    layoutFamily: "left-signal-card",
    glowLevel: "baixo",
    typography: "signal-condensed",
  },
  {
    id: "violet-hologrid",
    palettePreset: "electric-violet",
    dominant: "indigo-black",
    secondary: "electric-violet",
    texture: "holographic_mesh",
    composition: "headline_with_mockup",
    layoutFamily: "split-panel",
    glowLevel: "medio",
    typography: "split-display",
  },
  {
    id: "graphite-hud",
    palettePreset: "graphite-cyan",
    dominant: "graphite-black",
    secondary: "cyan-glow",
    texture: "industrial_grid",
    composition: "headline_center_card",
    layoutFamily: "bottom-proof-panel",
    glowLevel: "baixo",
    typography: "display-grotesk",
  },
  {
    id: "alert-signal",
    palettePreset: "plasma-amber",
    dominant: "charcoal-black",
    secondary: "amber-orange",
    texture: "alert_interface",
    composition: "headline_tech_element",
    layoutFamily: "left-signal-card",
    glowLevel: "alto",
    typography: "signal-condensed",
  },
  {
    id: "ice-command",
    palettePreset: "ice-blue",
    dominant: "petroleum-night",
    secondary: "cyan-ice",
    texture: "glass_grid",
    composition: "headline_split_panel",
    layoutFamily: "split-panel",
    glowLevel: "medio",
    typography: "split-display",
  },
  {
    id: "ember-ops",
    palettePreset: "plasma-amber",
    dominant: "graphite-black",
    secondary: "amber-gold",
    texture: "ember_mesh",
    composition: "headline_bottom_panel",
    layoutFamily: "bottom-proof-panel",
    glowLevel: "medio",
    typography: "editorial-serif-dark",
  },
  {
    id: "lunar-ledger",
    palettePreset: "lunar-violet",
    dominant: "slate-night",
    secondary: "violet-cyan",
    texture: "ledger_lines",
    composition: "headline_timeline",
    layoutFamily: "timeline-stack",
    glowLevel: "baixo",
    typography: "mono-signal",
  },
  {
    id: "checklist-neon",
    palettePreset: "magenta-teal",
    dominant: "space-black",
    secondary: "teal-neon",
    texture: "module_matrix",
    composition: "headline_checklist_grid",
    layoutFamily: "checklist-grid",
    glowLevel: "medio",
    typography: "signal-condensed",
  },
];

const STORY_PATTERN_LIBRARY = [
  "signal-map",
  "diagnostic-teardown",
  "checklist-sprint",
  "before-after-stack",
  "battle-card",
  "operator-manifesto",
];

function getTemplateById(templateId) {
  return TEMPLATE_LIBRARY.find((template) => template.id === templateId) || null;
}

function getCompatibleStoryPatterns(postType) {
  const compatibleByType = {
    noticia_analise: ["signal-map", "diagnostic-teardown", "operator-manifesto"],
    tutorial_framework: ["signal-map", "checklist-sprint", "before-after-stack"],
    comparacao_opiniao: ["battle-card", "diagnostic-teardown", "signal-map"],
    erro_correcao: ["diagnostic-teardown", "signal-map", "before-after-stack"],
    bastidor_processo: ["before-after-stack", "signal-map", "operator-manifesto"],
    ferramenta_aplicacao: ["signal-map", "checklist-sprint", "diagnostic-teardown"],
    tendencia_previsao: ["operator-manifesto", "signal-map", "diagnostic-teardown"],
    checklist_execucao: ["checklist-sprint", "signal-map", "diagnostic-teardown"],
    case_transformacao: ["before-after-stack", "signal-map", "battle-card"],
    posicionamento_autoridade: ["operator-manifesto", "battle-card", "signal-map"],
  };
  return compatibleByType[postType] || STORY_PATTERN_LIBRARY;
}

function templateSupportsPostType(template, postType, storyPattern) {
  if (template.layoutFamily === "checklist-grid") {
    return postType === "checklist_execucao" || storyPattern === "checklist-sprint";
  }

  if (template.layoutFamily === "timeline-stack") {
    return (
      postType === "tutorial_framework" ||
      postType === "checklist_execucao" ||
      postType === "bastidor_processo" ||
      storyPattern === "before-after-stack"
    );
  }

  if (template.layoutFamily === "bottom-proof-panel") {
    return (
      postType === "case_transformacao" ||
      postType === "bastidor_processo" ||
      postType === "posicionamento_autoridade" ||
      storyPattern === "before-after-stack" ||
      storyPattern === "operator-manifesto"
    );
  }

  if (template.layoutFamily === "split-panel") {
    return (
      postType === "comparacao_opiniao" ||
      postType === "noticia_analise" ||
      postType === "tendencia_previsao" ||
      storyPattern === "battle-card" ||
      storyPattern === "diagnostic-teardown"
    );
  }

  if (template.layoutFamily === "left-signal-card") {
    return (
      postType === "tutorial_framework" ||
      postType === "ferramenta_aplicacao" ||
      postType === "erro_correcao" ||
      storyPattern === "signal-map" ||
      storyPattern === "diagnostic-teardown"
    );
  }

  return true;
}

function getPreferredTemplateIds(postType, storyPattern) {
  const preferredByType = {
    noticia_analise: ["cyberpunk-green-core", "ice-command"],
    tutorial_framework:
      storyPattern === "checklist-sprint"
        ? ["petroleum-radar", "lunar-ledger", "checklist-neon"]
        : ["petroleum-radar", "lunar-ledger"],
    comparacao_opiniao: ["violet-hologrid", "ice-command"],
    erro_correcao: ["petroleum-radar", "ice-command", "alert-signal"],
    bastidor_processo: ["graphite-hud", "ember-ops", "lunar-ledger"],
    ferramenta_aplicacao: ["petroleum-radar", "lunar-ledger", "ice-command"],
    tendencia_previsao: ["ice-command", "cyberpunk-green-core", "violet-hologrid"],
    checklist_execucao: ["checklist-neon", "lunar-ledger", "petroleum-radar"],
    case_transformacao: ["graphite-hud", "ember-ops", "violet-hologrid"],
    posicionamento_autoridade: ["graphite-hud", "cyberpunk-green-core", "ember-ops"],
  };

  return preferredByType[postType] || ["cyberpunk-green-core", "petroleum-radar", "ice-command"];
}

function resolveTemplateCandidates(postType, storyPattern) {
  const preferredIds = getPreferredTemplateIds(postType, storyPattern);
  const preferred = preferredIds.map((templateId) => getTemplateById(templateId)).filter(Boolean);
  const compatible = TEMPLATE_LIBRARY.filter(
    (template) => !preferredIds.includes(template.id) && templateSupportsPostType(template, postType, storyPattern)
  );
  return [...preferred, ...compatible];
}

function applyTemplateToItem(item, template) {
  if (!item.dominantColor) item.dominantColor = template.dominant;
  if (!item.secondaryColor) item.secondaryColor = template.secondary;
  item.texture = template.texture;
  item.composition = template.composition;
  item.layoutFamily = template.layoutFamily;
  item.templateId = template.id;
}

function pickAlternativeTemplate(item, blockedIds = new Set(), blockedDominants = new Set()) {
  const preferred = resolveTemplateCandidates(item.postType, item.storyPattern).find(
    (template) =>
      template.id !== item.templateId &&
      !blockedIds.has(template.id) &&
      !blockedDominants.has(template.dominant)
  );

  if (preferred) return preferred;

  return (
    TEMPLATE_LIBRARY.find(
      (template) =>
        template.id !== item.templateId &&
        !blockedIds.has(template.id) &&
        !blockedDominants.has(template.dominant)
    ) ||
    getTemplateById(item.templateId)
  );
}

function pickAlternativeStoryPattern(item, blockedPatterns = new Set()) {
  const compatible = getCompatibleStoryPatterns(item.postType);
  return (
    compatible.find((pattern) => pattern !== item.storyPattern && !blockedPatterns.has(pattern)) ||
    STORY_PATTERN_LIBRARY.find((pattern) => pattern !== item.storyPattern && !blockedPatterns.has(pattern)) ||
    item.storyPattern
  );
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

function normalizeWeekdayToken(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  const aliases = {
    monday: "mon",
    mon: "mon",
    segunda: "mon",
    tuesday: "tue",
    tue: "tue",
    tues: "tue",
    terca: "tue",
    terça: "tue",
    wednesday: "wed",
    wed: "wed",
    quarta: "wed",
    thursday: "thu",
    thu: "thu",
    thur: "thu",
    quinta: "thu",
    friday: "fri",
    fri: "fri",
    sexta: "fri",
    saturday: "sat",
    sat: "sat",
    sabado: "sat",
    sábado: "sat",
    sunday: "sun",
    sun: "sun",
    domingo: "sun",
  };
  return aliases[normalized] || null;
}

function getCurrentWeekdayToken() {
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
}

function inferFamilyFromPalettePreset(palettePreset) {
  const preset = String(palettePreset || "").trim();
  if (!preset) return null;
  if (PALETTE_PRESETS[preset]?.family) return PALETTE_PRESETS[preset].family;
  const legacyMap = {
    "acid-lime": "green-cyan",
    "ice-blue": "blue-cyan",
    "electric-violet": "purple-pink",
    "graphite-cyan": "blue-cyan",
    "plasma-amber": "orange-red",
    "lunar-violet": "purple-pink",
    "magenta-teal": "purple-pink",
  };
  return legacyMap[preset] || null;
}

function pickWeekendFamily(history, currentPlan = []) {
  const families = Object.values(WEEKDAY_TO_FAMILY);
  const recent = history
    .map((entry, index) => ({
      family: entry.weekdayFamily || inferFamilyFromPalettePreset(entry.palettePreset),
      index,
    }))
    .filter((entry) => families.includes(entry.family));

  const scores = families.map((family) => {
    const last = [...recent].reverse().find((entry) => entry.family === family);
    const currentBatchCount = currentPlan.filter((item) => item.weekdayFamily === family).length;
    return {
      family,
      currentBatchCount,
      distance: last ? recent.length - last.index : Number.MAX_SAFE_INTEGER,
    };
  });

  scores.sort((left, right) => {
    if (left.currentBatchCount !== right.currentBatchCount) return left.currentBatchCount - right.currentBatchCount;
    return right.distance - left.distance;
  });

  return scores[0]?.family || "blue-cyan";
}

function resolveWeekdayFamily(weekdayToken, history, currentPlan = []) {
  if (WEEKDAY_TO_FAMILY[weekdayToken]) return WEEKDAY_TO_FAMILY[weekdayToken];
  if (weekdayToken === "sat" || weekdayToken === "sun") {
    return pickWeekendFamily(history, currentPlan);
  }
  return "blue-cyan";
}

function pickGradientForFamily(family, index, history, currentPlan) {
  const candidates = GRADIENT_FAMILY_MAP[family] || GRADIENT_FAMILY_MAP["blue-cyan"];
  const recent = [
    ...history.slice(-10).map((entry) => entry.gradientId || entry.palettePreset).filter(Boolean),
    ...currentPlan.slice(-2).map((entry) => entry.gradientId).filter(Boolean),
  ];
  const blocked = new Set(recent);
  const available = candidates.filter((gradientId) => !blocked.has(gradientId));
  return available[0] || candidates[index % candidates.length] || candidates[0];
}

function pickTypographyPresetForFamily(family, index, history, currentPlan) {
  const candidates = FAMILY_TYPOGRAPHY_MAP[family] || ["display-grotesk"];
  const recent = [
    ...history.slice(-8).map((entry) => entry.typographyPreset).filter(Boolean),
    ...currentPlan.slice(-1).map((entry) => entry.typographyPreset).filter(Boolean),
  ];
  const blocked = new Set(recent);
  const available = candidates.filter((preset) => !blocked.has(preset));
  return available[0] || candidates[index % candidates.length] || candidates[0];
}

function pickPaletteVariantId(item, history, currentPlan) {
  const preset = PALETTE_PRESETS[item.gradientId] || PALETTE_PRESETS[item.palettePreset];
  const variants = preset?.variants || [`${item.gradientId || item.palettePreset || "palette"}-v1`];
  const recent = [
    ...history.slice(-8).map((entry) => entry.paletteVariantId).filter(Boolean),
    ...currentPlan.slice(-1).map((entry) => entry.paletteVariantId).filter(Boolean),
  ];
  const available = variants.filter((variant) => !recent.includes(variant));
  return available[stableIndex(`${item.id}|${item.theme}|${item.gradientId}`, available.length)] || variants[0];
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
  if (!fs.existsSync(filePath)) return fallback;
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
    .slice(0, 64) || "post";
}

function readBrief(args) {
  const briefFromFile = args["brief-file"]
    ? JSON.parse(fs.readFileSync(path.resolve(args["brief-file"]), "utf8"))
    : {};
  const weekdayOverride = normalizeWeekdayToken(args.weekday || briefFromFile.weekday);
  const weekdayToken = weekdayOverride || getCurrentWeekdayToken();

  const pillars = args.pillars
    ? args.pillars.split(",").map((item) => item.trim()).filter(Boolean)
    : briefFromFile.editorialPillars;

  return {
    batchObjective: args.objective || briefFromFile.batchObjective || "criar lote editorial de carrosseis para Instagram",
    numberOfPosts: Number(args.count || briefFromFile.numberOfPosts || DEFAULT_COUNT),
    channels: briefFromFile.channels || ["instagram"],
    niche: args.niche || briefFromFile.niche || "agentes de IA, automacao e produto",
    audience: args.audience || briefFromFile.audience || "founders, PMs, builders e operadores",
    editorialPillars: Array.isArray(pillars) && pillars.length
      ? pillars
      : [
          "automacao com agentes",
          "produtividade com IA",
          "workflow real",
          "ferramentas para devs",
          "bastidores de sistemas",
        ],
    baseVisualStyle: args.style || briefFromFile.baseVisualStyle || "cyberpunk dark tech com verde neon",
    restrictions: briefFromFile.restrictions || [
      "sem texto de prompt na copy ou arte",
      "variar alinhamento e familia de layout conforme o tipo do post",
      "nao repetir CTA em sequencia",
      "evitar repeticao de cor dominante",
    ],
    allowedCTA: args.cta || briefFromFile.allowedCTA || "salvar, compartilhar ou revisar com o time",
    language: args.language || briefFromFile.language || "pt-BR",
    copyAggressiveness: args.aggressiveness || briefFromFile.copyAggressiveness || "media",
    aspectRatio: briefFromFile.aspectRatio || "1080x1350",
    slideTextLimit: briefFromFile.slideTextLimit || { title: 92, support: 220 },
    weekday: weekdayToken,
    weekdayLabel: WEEKDAY_LABELS[weekdayToken] || weekdayToken,
    weekdayOverride: Boolean(weekdayOverride),
    allowMonochromeRun: args["allow-monochrome-run"] === true || briefFromFile.allowMonochromeRun === true,
  };
}

function readHistory(historyFile) {
  const history = readJsonIfExists(historyFile, { entries: [] });
  const entries = Array.isArray(history?.entries) ? history.entries : [];
  return entries.slice(-HISTORY_LIMIT);
}

function buildRecencySet(history, key) {
  return new Set(history.map((entry) => entry?.[key]).filter(Boolean));
}

function pickTemplate(index, history, currentBatch, postType, storyPattern) {
  const recentTemplateIds = history.slice(-8).map((entry) => entry.templateId).filter(Boolean);
  const recentBatchTemplates = currentBatch.slice(-2).map((entry) => entry.templateId).filter(Boolean);
  const blocked = new Set([...recentTemplateIds, ...recentBatchTemplates]);
  const candidates = resolveTemplateCandidates(postType, storyPattern);
  const candidate = candidates.find((template) => !blocked.has(template.id));
  return candidate || candidates[index % candidates.length] || TEMPLATE_LIBRARY[index % TEMPLATE_LIBRARY.length];
}

function pickStoryPattern(postType, index, history, currentBatch) {
  const preferredByType = {
    noticia_analise: "signal-map",
    tutorial_framework: "signal-map",
    comparacao_opiniao: "battle-card",
    erro_correcao: "diagnostic-teardown",
    bastidor_processo: "before-after-stack",
    ferramenta_aplicacao: "signal-map",
    tendencia_previsao: "operator-manifesto",
    checklist_execucao: "checklist-sprint",
    case_transformacao: "before-after-stack",
    posicionamento_autoridade: "operator-manifesto",
  };

  const recentPatterns = history.slice(-8).map((entry) => entry.storyPattern).filter(Boolean);
  const recentBatchPatterns = currentBatch.slice(-2).map((entry) => entry.storyPattern).filter(Boolean);
  const blocked = new Set([...recentPatterns, ...recentBatchPatterns]);
  const preferred = preferredByType[postType];
  const compatible = getCompatibleStoryPatterns(postType);

  if (preferred && compatible.includes(preferred) && !blocked.has(preferred)) {
    return preferred;
  }

  const fallback = compatible.find((pattern) => !blocked.has(pattern));
  return fallback || compatible[index % compatible.length] || STORY_PATTERN_LIBRARY[index % STORY_PATTERN_LIBRARY.length];
}

function buildStrategyPlan(brief, history) {
  const plan = [];
  const recentThemes = buildRecencySet(history.slice(-20), "theme");
  const recentCtas = buildRecencySet(history.slice(-10), "cta");
  const batchWeekdayFamily = resolveWeekdayFamily(brief.weekday, history, []);
  for (let index = 0; index < brief.numberOfPosts; index += 1) {
    const postType = POST_TYPES[index % POST_TYPES.length];
    const pillar = brief.editorialPillars[index % brief.editorialPillars.length];
    const storyPattern = pickStoryPattern(postType, index, history, plan);
    const template = pickTemplate(index, history, plan, postType, storyPattern);
    const weekdayFamily = batchWeekdayFamily;
    const gradientId = pickGradientForFamily(weekdayFamily, index, history, plan);
    const typographyPreset = pickTypographyPresetForFamily(weekdayFamily, index, history, plan);
    const gradientPreset = PALETTE_PRESETS[gradientId] || PALETTE_PRESETS[template.palettePreset];
    const rotationShift = history.length % CTA_ROTATION.length;
    let cta = CTA_ROTATION[(index + rotationShift) % CTA_ROTATION.length];
    if (recentCtas.has(cta) || plan.at(-1)?.cta === cta) {
      cta = CTA_ROTATION[(index + rotationShift + 2) % CTA_ROTATION.length];
    }
    let theme = `${pillar} | ${postType}`;
    if (recentThemes.has(theme)) {
      theme = `${pillar} | ${postType} | recorte ${history.length + index + 1}`;
    }
    plan.push({
      id: `post-${String(index + 1).padStart(2, "0")}`,
      postType,
      pillar,
      theme,
      objective: objectiveForType(postType),
      weekdayFamily,
      gradientId,
      palettePreset: gradientId,
      paletteVariantId: "",
      dominantColor: gradientPreset?.dominant || template.dominant,
      secondaryColor: gradientPreset?.secondary || template.secondary,
      composition: template.composition,
      texture: template.texture,
      layoutFamily: template.layoutFamily,
      storyPattern,
      cta,
      templateId: template.id,
      typographyPreset,
      allowMonochromeRun: brief.allowMonochromeRun || brief.weekdayOverride,
      weekdayAnchored: true,
    });
    plan[index].paletteVariantId = pickPaletteVariantId(plan[index], history, plan.slice(0, -1));
  }
  return plan;
}

function objectiveForType(postType) {
  const map = {
    noticia_analise: "explicar mudanca recente e porque importa agora",
    tutorial_framework: "ensinar um modelo pratico de execucao",
    comparacao_opiniao: "comparar abordagens e tomar posicao clara",
    erro_correcao: "mostrar erro comum e correcao objetiva",
    bastidor_processo: "abrir o processo por tras do sistema",
    ferramenta_aplicacao: "ligar ferramenta a uso real",
    tendencia_previsao: "interpretar a direcao do mercado",
    checklist_execucao: "transformar ideia em lista acionavel",
    case_transformacao: "mostrar antes e depois operacional",
    posicionamento_autoridade: "afirmar tese editorial da marca",
  };
  return map[postType] || "criar um carrossel com tese clara";
}

function enforceAntiRepetition(plan) {
  const seenThemes = new Set();
  let sameColorRun = 0;
  let lastDominant = null;
  let lastTemplateId = null;
  let lastStoryPattern = null;
  let lastGradientId = null;
  let lastTypographyPreset = null;
  let sameFamilyRun = 0;
  let lastWeekdayFamily = null;

  return plan.map((item, index) => {
    const theme = item.theme || `${item.pillar} | ${item.postType}`;
    if (seenThemes.has(theme)) {
      item.theme = `${item.pillar} com recorte ${index + 1}`;
    } else {
      item.theme = theme;
      seenThemes.add(theme);
    }

    if (item.dominantColor === lastDominant) {
      sameColorRun += 1;
    } else {
      sameColorRun = 1;
      lastDominant = item.dominantColor;
    }

    if (sameColorRun > 2) {
      const nextTemplate = pickAlternativeTemplate(item, new Set(), new Set([lastDominant]));
      applyTemplateToItem(item, nextTemplate);
      sameColorRun = 1;
      lastDominant = item.dominantColor;
    }

    if (item.gradientId === lastGradientId) {
      const candidates = (GRADIENT_FAMILY_MAP[item.weekdayFamily] || []).filter((gradientId) => gradientId !== lastGradientId);
      if (candidates.length) {
        item.gradientId = candidates[index % candidates.length];
        item.palettePreset = item.gradientId;
        item.paletteVariantId = pickPaletteVariantId(item, [], plan.slice(0, index));
        const gradientPreset = PALETTE_PRESETS[item.gradientId];
        item.dominantColor = gradientPreset?.dominant || item.dominantColor;
        item.secondaryColor = gradientPreset?.secondary || item.secondaryColor;
      }
    }
    lastGradientId = item.gradientId;

    if (item.templateId === lastTemplateId) {
      const nextTemplate = pickAlternativeTemplate(item, new Set([lastTemplateId]));
      applyTemplateToItem(item, nextTemplate);
    }
    lastTemplateId = item.templateId;

    if (item.storyPattern === lastStoryPattern) {
      item.storyPattern = pickAlternativeStoryPattern(item, new Set([lastStoryPattern]));
    }
    lastStoryPattern = item.storyPattern;

    if (item.typographyPreset === lastTypographyPreset) {
      const typographyChoices = (FAMILY_TYPOGRAPHY_MAP[item.weekdayFamily] || []).filter(
        (preset) => preset !== lastTypographyPreset
      );
      if (typographyChoices.length) {
        item.typographyPreset = typographyChoices[index % typographyChoices.length];
      }
    }
    lastTypographyPreset = item.typographyPreset;

    const activeTemplate = getTemplateById(item.templateId);
    if (activeTemplate && !templateSupportsPostType(activeTemplate, item.postType, item.storyPattern)) {
      const nextTemplate = pickAlternativeTemplate(item, new Set([item.templateId]));
      applyTemplateToItem(item, nextTemplate);
    }

    if (item.weekdayFamily === lastWeekdayFamily) {
      sameFamilyRun += 1;
    } else {
      sameFamilyRun = 1;
      lastWeekdayFamily = item.weekdayFamily;
    }
    if (sameFamilyRun >= 3 && !item.allowMonochromeRun) {
      const alternatives = Object.values(WEEKDAY_TO_FAMILY).filter((family) => family !== item.weekdayFamily);
      if (!item.weekdayAnchored && alternatives.length) {
        item.weekdayFamily = alternatives[index % alternatives.length];
      }
    }

    item.density = index % 3 === 0 ? "minimalista" : index % 3 === 1 ? "media" : "densa";
    item.weekdayAnchored = true;
    return item;
  });
}

function buildHookOptions(item) {
  const base = restoreTechCase(String(item.pillar || "IA").trim());
  const baseCap = capitalize(base);
  const objective = cleanObjectiveText(item.objective);
  const lens = buildOperationalLens(item);
  const bank = {
    noticia_analise: [
      `${baseCap}: o custo aparece quando backlog e latency sobem juntos`,
      `O mercado mudou. ${baseCap} agora responde por margem e ownership`,
      `${baseCap} quebra quando a aprovacao chega depois da fila`,
      `Sem governance, ${base} so redistribui retrabalho`,
      `${baseCap}: o ganho real vem do processo, nao do modelo`,
      `Onde ${base} perde dinheiro sem o time perceber`,
    ],
    tutorial_framework: [
      `${baseCap}: o framework minimo para reduzir retrabalho`,
      `Se ${base} nao tem handoff, nao tem escala`,
      `${baseCap}: checklist de contexto, gate e fallback`,
      `O jeito simples de tirar ${base} do piloto`,
      `${baseCap}: como fechar o loop antes de automatizar`,
      `O framework que impede ${base} de travar na aprovacao`,
    ],
    comparacao_opiniao: [
      `${baseCap}: efeito visual ou sistema que aguenta escala`,
      `Dois caminhos para ${base}: hype bonito ou operacao real`,
      `${baseCap}: o lado que segura margem nao e o mais chamativo`,
      `A diferenca entre ${base} de palco e ${base} de producao`,
      `${baseCap}: onde a opiniao vira decisao operacional`,
      `O comparativo que separa narrativa de throughput`,
    ],
    erro_correcao: [
      `${baseCap}: o erro que fabrica backlog invisivel`,
      `Seu fluxo com ${base} quebra antes do modelo`,
      `${baseCap}: a correcao que elimina retrabalho em cascata`,
      `O gargalo silencioso quando ${base} entra sem dono`,
      `${baseCap}: como parar de empilhar excecao`,
      `Sem retorno claro, ${base} vira fila parada`,
    ],
    case_transformacao: [
      `${baseCap}: antes era demo, depois virou throughput`,
      `O antes e depois de ${base} quando ownership fica claro`,
      `${baseCap}: a virada que reduziu atrito operacional`,
      `Como ${base} saiu do improviso e entrou em rotina`,
      `${baseCap}: o caso em que processo aumentou previsibilidade`,
      `O ajuste que fez ${base} parar de oscilar`,
    ],
    posicionamento_autoridade: [
      `${baseCap}: tese forte sem processo e marketing caro`,
      `A verdade operacional sobre ${base} que pouca gente publica`,
      `${baseCap}: autoridade nasce de governance, nao de hype`,
      `Se ${base} nao aguenta auditoria, nao aguenta escala`,
      `${baseCap}: a tese que protege margem e reputacao`,
      `O posicionamento serio sobre ${base} em 2026`,
    ],
  };

  const fallback = [
    `${baseCap}: processo forte segura ${lens.pressure}`,
    `${baseCap} melhora quando o fluxo define ${lens.mechanism}`,
    `${baseCap}: ${objective} exige trilho, nao improviso`,
    `Sem sistema, ${base} aumenta ${lens.pressure}`,
    `${baseCap}: o ganho vem quando ownership fica claro`,
    `${baseCap} quebra quando o workflow ignora ${objective}`,
  ];

  return (bank[item.postType] || fallback).map((text, index) => ({
    type: `${item.postType}-${index + 1}`,
    text,
  }));
}

function pickHook(hooks, item, history = [], currentBatch = []) {
  const priorityByType = {
    noticia_analise: [1, 0, 5, 2, 3, 4],
    tutorial_framework: [2, 0, 4, 1, 5, 3],
    comparacao_opiniao: [0, 1, 3, 2, 4, 5],
    erro_correcao: [0, 2, 5, 3, 1, 4],
    case_transformacao: [0, 1, 3, 4, 5, 2],
    posicionamento_autoridade: [2, 3, 4, 1, 0, 5],
  };
  const ordered = (priorityByType[item.postType] || hooks.map((_, index) => index))
    .map((index) => hooks[index])
    .filter(Boolean);
  const blocked = new Set([
    ...history.slice(-14).map((entry) => entry.hook).filter(Boolean),
    ...currentBatch.slice(-2).map((entry) => entry.selectedHook?.text).filter(Boolean),
  ]);
  return pickNonRepeatingOption(ordered, blocked, `${item.id}|${item.postType}|hook`);
}

function stableIndex(seed, size) {
  const source = String(seed || "");
  let value = 0;
  for (let index = 0; index < source.length; index += 1) {
    value = (value * 31 + source.charCodeAt(index)) % 2147483647;
  }
  return size ? value % size : 0;
}

function pickStableVariant(seed, variants) {
  return variants[stableIndex(seed, variants.length)];
}

function cleanObjectiveText(objective) {
  return String(objective || "o ponto critico")
    .replace(/^ensinar |^explicar |^comparar |^mostrar |^abrir |^ligar |^interpretar |^transformar |^afirmar /, "")
    .replace(/[.]+$/g, "")
    .trim();
}

function restoreTechCase(text) {
  return String(text || "")
    .replace(/\bia\b/g, "IA")
    .replace(/\bgpt\b/gi, "GPT")
    .replace(/\bapi\b/gi, "API")
    .replace(/\bllm\b/gi, "LLM")
    .replace(/\bux\b/gi, "UX")
    .replace(/\bui\b/gi, "UI");
}

function buildOperationalLens(item) {
  const byType = {
    noticia_analise: {
      pressure: "latencia, backlog e margem",
      mechanism: "ownership, aprovacao e contexto",
      consequence: "o custo sobe antes do time perceber",
      ctaTitle: "compare com o que voce opera hoje",
    },
    tutorial_framework: {
      pressure: "handoff, checklist e criterio de aceite",
      mechanism: "entrada limpa, gate visivel e fallback",
      consequence: "sem estrutura, cada entrega volta para retrabalho",
      ctaTitle: "leve para o proximo planning",
    },
    comparacao_opiniao: {
      pressure: "prioridade, governanca e velocidade",
      mechanism: "decisao clara entre efeito visual e operacao",
      consequence: "o time escolhe o caminho bonito e paga depois",
      ctaTitle: "escolha o lado que aguenta escala",
    },
    erro_correcao: {
      pressure: "erro, retrabalho e fila parada",
      mechanism: "aprovacao, excecao e retorno",
      consequence: "o gargalo vira rotina escondida",
      ctaTitle: "audite o fluxo antes do proximo deploy",
    },
    bastidor_processo: {
      pressure: "fila, prioridade e consistencia",
      mechanism: "handoff, logging e dono final",
      consequence: "o sistema parece rapido, mas sangra no backstage",
      ctaTitle: "reveja o processo inteiro",
    },
    ferramenta_aplicacao: {
      pressure: "uso real, integracao e ownership",
      mechanism: "entrada certa, limite de acao e revisao",
      consequence: "ferramenta sem processo vira mais uma aba aberta",
      ctaTitle: "use isso como criterio de escolha",
    },
    tendencia_previsao: {
      pressure: "margem, consolidacao e velocidade",
      mechanism: "processo confiavel, nao hype",
      consequence: "quem atrasar governance paga na execucao",
      ctaTitle: "salve para revisar a tese",
    },
    checklist_execucao: {
      pressure: "fila, auditoria e disciplina operacional",
      mechanism: "checklist, gate e dono",
      consequence: "sem checklist, o time repete excecao",
      ctaTitle: "use como checklist de auditoria",
    },
    case_transformacao: {
      pressure: "throughput, margem e previsibilidade",
      mechanism: "trilho, ownership e medicao",
      consequence: "o antes parecia rapido; o depois segura escala",
      ctaTitle: "use como benchmark operacional",
    },
    posicionamento_autoridade: {
      pressure: "governanca, margem e reputacao",
      mechanism: "criterio, processo e responsabilidade final",
      consequence: "sem tese operacional, o discurso envelhece rapido",
      ctaTitle: "guarde para alinhar o time",
    },
  };
  return byType[item.postType] || byType.noticia_analise;
}

function pickNonRepeatingOption(options, blockedValues = new Set(), seed = "") {
  const ordered = options.map((option, index) => ({
    option,
    weight: stableIndex(`${seed}:${index}:${option.text || option}`, 997),
  }));
  ordered.sort((left, right) => left.weight - right.weight);
  const preferred = ordered.find(({ option }) => !blockedValues.has(option.text || option));
  return preferred?.option || ordered[0]?.option || options[0];
}

function buildSharedCopy(item, selectedHook) {
  const theme = restoreTechCase(String(item.pillar || item.theme || "IA").trim().toLowerCase());
  const themeCap = capitalize(theme);
  const objectiveCore = cleanObjectiveText(item.objective);
  const seedBase = `${theme}|${item.storyPattern}|${selectedHook.type}|${item.postType}`;
  const lens = buildOperationalLens(item);
  const ctaAction =
    item.cta.includes("planning")
      ? "Leve estes criterios para o proximo planning"
      : item.cta.includes("checklist")
        ? "Passe isso no workflow antes da proxima execucao"
        : item.cta.includes("backlog")
          ? "Use isso para revisar o backlog com criterio"
          : item.cta.includes("revisar")
            ? "Guarde isso para revisar antes de publicar"
            : item.cta.includes("marque")
              ? "Envie para quem ainda confunde demo com operacao"
              : capitalize(item.cta);

  return {
    coverSupport: pickStableVariant(`${seedBase}:cover`, [
      `${themeCap} pesa no resultado quando o fluxo define ${lens.mechanism}.`,
      `Sem ${lens.mechanism}, ${theme} aumenta ${lens.pressure} em vez de throughput.`,
      `O ganho real em ${theme} aparece quando o time para de improvisar handoff.`,
    ]),
    marketShift: pickStableVariant(`${seedBase}:shift`, [
      `O mercado agora cobra ${lens.mechanism} com resposta previsivel em ${theme}.`,
      `${themeCap} saiu do palco de demo e entrou na fila real de aprovacao e backlog.`,
      `O jogo mudou: ${theme} agora responde por latencia, ownership e prioridade.`,
    ]),
    commonError: pickStableVariant(`${seedBase}:error`, [
      "O erro mais caro e ligar IA sem definir aprovacao, ownership e retorno.",
      "Quase sempre o problema nao esta no modelo. Esta no desenho operacional do handoff.",
      "O fluxo quebra quando cada excecao vira mensagem solta e ninguem assume o proximo passo.",
    ]),
    proof: pickStableVariant(`${seedBase}:proof`, [
      `Quando ${theme} entra com trilho e dono final, o resultado para de oscilar.`,
      `${themeCap} deixa de parecer hype quando aguenta backlog, aprovacao e excecao.`,
      `Com contexto confiavel e regra clara, ${theme} reduz retrabalho e estabiliza throughput.`,
    ]),
    application: pickStableVariant(`${seedBase}:application`, [
      "Comece por uma tarefa completa. Defina entrada, dono, limite de acao e criterio de aceite.",
      "Escolha um fluxo inteiro, desenhe handoff, aprovacao e rota de excecao antes da automacao.",
      `Pegue um processo real, corte ambiguidade e amarre ${theme} a uma etapa com owner claro.`,
    ]),
    summary: pickStableVariant(`${seedBase}:summary`, [
      "Produtividade sobe quando o workflow fica claro, auditavel e com ownership visivel.",
      "Resultado consistente nasce de trilho operacional, nao de interface bonita.",
      "O sistema melhora quando cada etapa sabe o que entra, o que sai e quem responde.",
    ]),
    ctaSupport: ctaAction,
    captionBridge: pickStableVariant(`${seedBase}:caption-bridge`, [
      `A discussao cara nao e sobre modelo. E sobre quem segura ${lens.mechanism} quando ${theme} entra na fila real.`,
      `${themeCap} nao compra margem por parecer avancado. Compra quando reduz ${lens.pressure} com processo claro.`,
      `O ponto nao e ter mais IA. E fazer ${theme} operar com menos excecao, menos atraso e mais previsibilidade.`,
    ]),
    captionAction: pickStableVariant(`${seedBase}:caption-action`, [
      `Audite contexto, gate, fallback e ownership antes de escalar ${theme}.`,
      `Use este carrossel para localizar o trecho do fluxo que ainda fabrica retrabalho.`,
      `Compare isso com a sua operacao atual e veja onde backlog e aprovacao ainda vazam.`,
    ]),
    thesis: pickStableVariant(`${seedBase}:caption-thesis`, [
      `${themeCap} com governance fraca vira custo escondido antes de virar vantagem.`,
      `Escala sem ownership so aumenta latencia, backlog e retrabalho.`,
      `${themeCap} so melhora margem quando entra em um fluxo auditavel.`,
    ]),
    operationalTakeaway: pickStableVariant(`${seedBase}:caption-takeaway`, [
      `Comece onde o impacto operacional e claro: ${lens.pressure}. Depois desenhe ${lens.mechanism}.`,
      `Se o time ainda discute prompt antes de discutir ownership, a fila ja esta invertida.`,
      `O proximo ganho nao vem de mais modelo. Vem de menos ambiguidade no processo.`,
    ]),
    objectiveCore,
    lens,
  };
}

function buildSlides(item, selectedHook) {
  const theme = restoreTechCase(String(item.pillar || item.theme || "IA").trim().toLowerCase());
  const themeCap = capitalize(theme);
  const shared = buildSharedCopy(item, selectedHook);

  switch (item.storyPattern) {
    case "diagnostic-teardown":
      return [
        { role: "hook", title: selectedHook.text, support: shared.coverSupport },
        { role: "sintoma", title: "O erro comeca cedo", support: `Sem trilho claro, ${theme} parece bom no teste e quebra quando entra volume.` },
        { role: "causa", title: "O gargalo real", support: "Raramente o modelo e o problema. Quase sempre faltam contexto, handoff e criterio." },
        { role: "quebra", title: "Onde a conta quebra", support: "Quebra na aprovacao, no ownership e na medicao. O resultado vira excecao." },
        { role: "correcao", title: "O ajuste que segura", support: shared.application },
        { role: "prova", title: "Quando vira operacao", support: shared.proof },
        { role: "cta", title: "Revise isso hoje", support: shared.ctaSupport },
      ];
    case "checklist-sprint":
      return [
        { role: "hook", title: selectedHook.text, support: shared.coverSupport },
        { role: "check-1", title: "1. Contexto limpo", support: "Sem contexto confiavel, qualquer ganho inicial vira ruido operacional." },
        { role: "check-2", title: "2. Gate visivel", support: "Toda etapa precisa de criterio claro antes de seguir para o proximo agente." },
        { role: "check-3", title: "3. Fallback claro", support: "Se der erro, o sistema precisa saber para onde volta e quem assume." },
        { role: "check-4", title: "4. Dono definido", support: "Sem dono explicito, a automacao escala confusao e nao resultado." },
        { role: "erro", title: "O erro que drena resultado", support: shared.commonError },
        { role: "resumo", title: "Resumo de operador", support: shared.summary },
        { role: "cta", title: "Leve para o planning", support: shared.ctaSupport },
      ];
    case "before-after-stack":
      return [
        { role: "hook", title: selectedHook.text, support: shared.coverSupport },
        { role: "antes", title: "Antes: fluxo solto", support: `${themeCap} rodava sem contexto confiavel, validacao clara ou rota de excecao.` },
        { role: "depois", title: "Depois: trilho claro", support: `${themeCap} entra em operacao com gate, ownership e fallback desenhado.` },
        { role: "mudanca", title: "O ponto de virada", support: "Sai o improviso. Entra um sistema com regra, etapa e medicao." },
        { role: "impacto", title: "O impacto no time", support: "A equipe para de depender de sorte e passa a repetir resultado com menos atrito." },
        { role: "aplicacao", title: "Como aplicar amanha", support: shared.application },
        { role: "cta", title: "Use como benchmark", support: shared.ctaSupport },
      ];
    case "battle-card":
      return [
        { role: "hook", title: selectedHook.text, support: shared.coverSupport },
        { role: "lado-a", title: "Piloto que impressiona", support: "Entrega demo, vende narrativa e quebra quando entra volume ou dependencia." },
        { role: "lado-b", title: "Sistema que entrega", support: "Tem contexto, gate, fallback e ownership. Parece menos magico, mas sustenta resultado." },
        { role: "diferenca", title: "A diferenca que importa", support: "Um lado vende efeito. O outro aguenta execucao." },
        { role: "escolha", title: "O lado que escala", support: `Escala o lado em que ${theme} vira sistema, e nao feature isolada.` },
        { role: "cta", title: "Escolha o lado", support: shared.ctaSupport },
      ];
    case "operator-manifesto":
      return [
        { role: "hook", title: selectedHook.text, support: shared.coverSupport },
        { role: "regra-1", title: "Nao chame de agente", support: "Se ainda depende de improviso humano escondido, ainda nao virou sistema." },
        { role: "regra-2", title: "Nao publique sem trilho", support: "Automacao sem criterio de qualidade e ponto de retorno vira risco." },
        { role: "regra-3", title: "Bonito nao basta", support: "Output forte nao compensa operacao fraca." },
        { role: "tese", title: "O que separa builder de operador", support: "Builder testa. Operador fecha loop, mede friccao e sustenta rotina." },
        { role: "cta", title: "Guarde esse manifesto", support: shared.ctaSupport },
      ];
    case "signal-map":
    default:
      return [
        { role: "hook", title: selectedHook.text, support: shared.coverSupport },
        { role: "contexto", title: "O mercado apertou", support: shared.marketShift },
        { role: "mudanca", title: "Onde o sistema vaza", support: shared.commonError },
        { role: "prova", title: "O que segura o resultado", support: shared.proof },
        { role: "aplicacao", title: "Ajuste de hoje", support: shared.application },
        { role: "cta", title: "Leve para o backlog", support: shared.ctaSupport },
      ];
  }
}

function buildCaption(item, selectedHook, history = [], currentBatch = []) {
  const shared = buildSharedCopy(item, selectedHook);
  const openers = [
    shared.thesis,
    `${capitalize(restoreTechCase(item.pillar))} nao protege margem sem ownership claro.`,
    `${capitalize(restoreTechCase(item.pillar))} melhora quando backlog, aprovacao e handoff entram na mesma conversa.`,
  ];
  const blockedOpeners = new Set(
    [
      ...history
        .slice(-14)
        .map((entry) => String(entry.caption || "").split(/\n+/)[0].trim())
        .filter(Boolean),
      ...currentBatch
        .slice(-2)
        .map((entry) => String(entry.caption || "").split(/\n+/)[0].trim())
        .filter(Boolean),
    ].filter(Boolean)
  );
  const opener = pickNonRepeatingOption(openers, blockedOpeners, `${item.id}|${item.postType}|caption-open`);
  return `${opener}\n\n${shared.captionBridge}\n\n${shared.operationalTakeaway}\n\n${shared.captionAction}\n\n${shared.ctaSupport}.`;
}

function buildHashtags(item) {
  const base = ["#AI", "#AIAgents", "#WorkflowAutomation"];
  const extraMap = {
    tutorial_framework: ["#Framework", "#ProductOps"],
    comparacao_opiniao: ["#ProductStrategy", "#Builders"],
    erro_correcao: ["#Execution", "#ProductManagement"],
    bastidor_processo: ["#Ops", "#Automation"],
    ferramenta_aplicacao: ["#Tooling", "#Developers"],
    tendencia_previsao: ["#AINews", "#TechStrategy"],
    checklist_execucao: ["#Checklist", "#Execution"],
    case_transformacao: ["#CaseStudy", "#BusinessOps"],
    posicionamento_autoridade: ["#FounderMode", "#Authority"],
    noticia_analise: ["#AINews", "#MarketAnalysis"],
  };
  return [...base, ...(extraMap[item.postType] || [])].slice(0, 6);
}

function runCopyQA(slides, caption) {
  const failures = [];
  const normalizedTitles = new Set();

  slides.forEach((slide, index) => {
    const key = slide.title.toLowerCase();
    if (normalizedTitles.has(key)) failures.push(`slide ${index + 1}: titulo repetido`);
    normalizedTitles.add(key);
    if (slide.title.length > 84) failures.push(`slide ${index + 1}: titulo acima do limite`);
    if (slide.support.length > 180) failures.push(`slide ${index + 1}: apoio acima do limite`);
    if (/^a tese aqui e direta/i.test(slide.support)) failures.push(`slide ${index + 1}: apoio com framing interno generico`);
    const merged = `${slide.title}\n${slide.support}`.toLowerCase();
    BANNED_TEXT_LEAKAGE.forEach((token) => {
      if (merged.includes(token)) failures.push(`slide ${index + 1}: vazamento (${token})`);
    });
  });

  BANNED_TEXT_LEAKAGE.forEach((token) => {
    if (caption.toLowerCase().includes(token)) failures.push(`legenda: vazamento (${token})`);
  });
  ["esse post faz parte de um lote", "estrutura usada:"].forEach((token) => {
    if (caption.toLowerCase().includes(token)) failures.push(`legenda: frase interna (${token})`);
  });

  return {
    status: failures.length ? "revisar" : "aprovado",
    failures,
    score: failures.length ? 72 : 91,
  };
}

function buildVisualDirection(item) {
  const template = TEMPLATE_LIBRARY.find((entry) => entry.id === item.templateId) || TEMPLATE_LIBRARY[0];
  const palettePreset =
    PALETTE_PRESETS[item.gradientId || item.palettePreset || template.palettePreset] || PALETTE_PRESETS["acid-lime"];
  const typographyPreset =
    TYPOGRAPHY_PRESETS[item.typographyPreset || template.typography] || TYPOGRAPHY_PRESETS["display-grotesk"];
  const isLeft =
    template.layoutFamily === "left-signal-card" ||
    template.layoutFamily === "timeline-stack" ||
    template.layoutFamily === "checklist-grid";
  const isSplit = template.layoutFamily === "split-panel";
  return {
    styleBase: "cyberpunk_dark_tech",
    palettePreset: palettePreset.name,
    gradientId: item.gradientId || palettePreset.name,
    paletteVariantId: item.paletteVariantId,
    weekdayFamily: item.weekdayFamily,
    paletteMood: palettePreset.mood,
    paletteGradient: palettePreset.gradient,
    paletteTextRule: palettePreset.textRule,
    typographyPreset: typographyPreset.name,
    titleFontRole: typographyPreset.titleRole,
    supportFontRole: typographyPreset.supportRole,
    eyebrowFontRole: typographyPreset.eyebrowRole,
    dominantColor: item.dominantColor,
    secondaryColor: item.secondaryColor,
    backgroundTexture: item.texture,
    composition: item.composition,
    layoutFamily: template.layoutFamily,
    glowLevel: template.glowLevel || (item.density === "minimalista" ? "baixo" : item.density === "media" ? "medio" : "alto"),
    elementDensity: item.density,
    typography: template.typography || "sans_heavy_centered",
    icons: item.postType === "tutorial_framework" || item.postType === "checklist_execucao",
    mockups: item.composition.includes("mockup") || isSplit,
    textAlignment: isLeft ? "left" : "center",
    supportAlignment: isLeft ? "left" : "center",
    templateId: item.templateId,
  };
}

function buildPromptBundle(item, slides, visualDirection) {
  return {
    copy_text: slides,
    visual_prompt: `Dark cyberpunk Instagram carousel for ${item.theme}. Weekday family: ${visualDirection.weekdayFamily}. Use gradient ${visualDirection.gradientId} with renderer variant ${visualDirection.paletteVariantId}: ${visualDirection.paletteGradient}. Mood: ${visualDirection.paletteMood}. Apply typography preset ${visualDirection.typographyPreset}: ${visualDirection.titleFontRole}; ${visualDirection.supportFontRole}; ${visualDirection.eyebrowFontRole}. Texture: ${visualDirection.backgroundTexture}. Layout family: ${visualDirection.layoutFamily}. Layer the palette inside the main frame, not only in the outer background. Keep the background deep, premium and varied, with readable gradients, glass depth and meaningful interface fragments. Headline in white, support text in cool neutral gray, accents only in rails, chips, borders and proof details, no empty decorative mockups, no placeholder panels.`,
    negative_prompt: "prompt text, UI garbage, watermark, random letters, distorted typography, extra paragraphs, meme style, pastel palette, bright background, low contrast text, colored body text, metadata chips, theme labels, tone labels, empty mockup, blank side panel, generic app placeholder",
    style_constraints: {
      brandDna: "PromptHub cyberpunk editorial",
      noEmbeddedLongCopy: true,
      contrast: "AAA",
      themeMode: "dark-only",
      palettePreset: visualDirection.palettePreset,
      paletteGradient: visualDirection.paletteGradient,
      paletteTextRule: visualDirection.paletteTextRule,
      typographyPreset: visualDirection.typographyPreset,
      titleFontRole: visualDirection.titleFontRole,
      supportFontRole: visualDirection.supportFontRole,
      eyebrowFontRole: visualDirection.eyebrowFontRole,
      designFlow: ["palette", "typography", "layout", "contrast", "render"],
    },
    text_overlay_spec: {
      headlineAlignment: visualDirection.textAlignment,
      bodyAlignment: visualDirection.supportAlignment,
      safeMargins: visualDirection.layoutFamily === "split-panel" ? 84 : 72,
      maxBlocks: 2,
      layoutFamily: visualDirection.layoutFamily,
    },
  };
}

function buildLayoutSpec(item) {
  const template = TEMPLATE_LIBRARY.find((entry) => entry.id === item.templateId) || TEMPLATE_LIBRARY[0];
  const isLeft =
    template.layoutFamily === "left-signal-card" ||
    template.layoutFamily === "timeline-stack" ||
    template.layoutFamily === "checklist-grid";
  const supportPosition =
    template.layoutFamily === "bottom-proof-panel"
      ? "bottom_panel"
      : template.layoutFamily === "split-panel"
        ? "split_panel"
        : isLeft
          ? "left_card"
          : "center_card";
  return {
    ratio: "1080x1350",
    maxTextBlocks: 2,
    headlinePosition: isLeft ? "left" : "center",
    supportPosition,
    footer: "discreet_brand_left_tag_right",
    safeMargins: template.layoutFamily === "split-panel" ? 84 : 72,
    contrastTarget: "AA/AAA",
    template: item.composition,
    templateId: item.templateId,
    layoutFamily: template.layoutFamily,
    storyPattern: item.storyPattern,
  };
}

function runLeakageValidation(post) {
  const raw = JSON.stringify({ slides: post.slides, caption: post.caption }).toLowerCase();
  const failures = [];
  BANNED_TEXT_LEAKAGE.forEach((token) => {
    if (raw.includes(token)) failures.push(`texto tecnico encontrado: ${token}`);
  });
  if (post.slides.some((slide) => slide.title.endsWith("...") || slide.support.endsWith("..."))) {
    failures.push("texto truncado detectado");
  }
  return {
    status: failures.length ? "rejeitado" : "aprovado",
    failures,
    score: failures.length ? 64 : 94,
  };
}

function runBrandConsistency(post, previousPost) {
  const failures = [];
  if (previousPost && previousPost.visualDirection.dominantColor === post.visualDirection.dominantColor) {
    failures.push("cor dominante repetida em sequencia");
  }
  if (previousPost && previousPost.visualDirection.gradientId === post.visualDirection.gradientId) {
    failures.push("gradientId repetido em sequencia");
  }
  if (previousPost && previousPost.visualDirection.typographyPreset === post.visualDirection.typographyPreset) {
    failures.push("tipografia repetida em sequencia");
  }
  if (previousPost && previousPost.visualDirection.composition === post.visualDirection.composition) {
    failures.push("composicao repetida em sequencia");
  }
  if (previousPost && previousPost.visualDirection.templateId === post.visualDirection.templateId) {
    failures.push("template repetido em sequencia");
  }
  if (previousPost && previousPost.storyPattern === post.storyPattern) {
    failures.push("estrutura narrativa repetida em sequencia");
  }
  return {
    status: failures.length > 1 ? "revisar" : "aprovado",
    failures,
    score: failures.length > 1 ? 74 : 89,
  };
}

function computeBatchMetrics(posts) {
  return {
    uniqueThemes: new Set(posts.map((post) => post.theme)).size,
    uniqueCtas: new Set(posts.map((post) => post.cta)).size,
    uniqueTemplates: new Set(posts.map((post) => post.templateId)).size,
    uniqueDominantColors: new Set(posts.map((post) => post.dominantColor)).size,
    uniqueStoryPatterns: new Set(posts.map((post) => post.storyPattern)).size,
    uniqueGradients: new Set(posts.map((post) => post.gradientId)).size,
    uniqueTypography: new Set(posts.map((post) => post.typographyPreset)).size,
  };
}

function persistHistory(historyFile, posts, summary) {
  const previous = readJsonIfExists(historyFile, { entries: [] });
  const entries = Array.isArray(previous?.entries) ? previous.entries : [];
  const nextEntries = [
    ...entries,
    ...posts.map((post) => ({
      id: post.id,
      theme: post.theme,
      cta: post.cta,
      dominantColor: post.visualDirection.dominantColor,
      composition: post.visualDirection.composition,
      layoutFamily: post.visualDirection.layoutFamily,
      templateId: post.templateId,
      storyPattern: post.storyPattern,
      weekdayFamily: post.weekdayFamily,
      gradientId: post.gradientId,
      palettePreset: post.palettePreset,
      paletteVariantId: post.paletteVariantId,
      typographyPreset: post.typographyPreset,
      hook: post.selectedHook.text,
      caption: post.caption,
      status: post.finalQa.status,
      createdAt: new Date().toISOString(),
      summaryStatus: summary.status,
    })),
  ].slice(-HISTORY_LIMIT);
  writeJson(historyFile, { entries: nextEntries });
}

function runFinalQA(post) {
  const failures = [];
  if (!post.copyQa || post.copyQa.status !== "aprovado") failures.push("copy QA nao aprovada");
  if (!post.leakageQa || post.leakageQa.status !== "aprovado") failures.push("OCR/leakage QA nao aprovada");
  if (!post.brandQa || post.brandQa.status === "revisar") failures.push("brand consistency pede ajuste");
  if (post.slides.length < 6 || post.slides.length > 10) failures.push("estrutura de slides fora do intervalo 6-10");

  return {
    status: failures.length ? "bloqueado" : "liberado",
    failures,
    score: failures.length ? 70 : 93,
  };
}

function buildPostPackage(item, previousPost, history = [], currentBatch = []) {
  const hookOptions = buildHookOptions(item);
  const selectedHook = pickHook(hookOptions, item, history, currentBatch);
  const slides = buildSlides(item, selectedHook);
  const caption = buildCaption(item, selectedHook, history, currentBatch);
  const hashtags = buildHashtags(item);
  const copyQa = runCopyQA(slides, caption);
  const visualDirection = buildVisualDirection(item);
  const promptBundle = buildPromptBundle(item, slides, visualDirection);
  const layoutSpec = buildLayoutSpec(item);
  const leakageQa = runLeakageValidation({ slides, caption });
  const brandQa = runBrandConsistency({ visualDirection }, previousPost);
  const finalQa = runFinalQA({ slides, copyQa, leakageQa, brandQa });

  return {
    ...item,
    hookOptions,
    selectedHook,
    slides,
    caption,
    hashtags,
    copyQa,
    visualDirection,
    promptBundle,
    layoutSpec,
    leakageQa,
    brandQa,
    finalQa,
  };
}

function buildMarkdownReport(brief, posts) {
  const metrics = computeBatchMetrics(posts);
  const lines = [
    "# Instagram Carousel Batch Orchestration",
    "",
    "## Briefing",
    `- objetivo: ${brief.batchObjective}`,
    `- quantidade: ${brief.numberOfPosts}`,
    `- audiencia: ${brief.audience}`,
    `- nicho: ${brief.niche}`,
    `- estilo base: ${brief.baseVisualStyle}`,
    `- weekday: ${brief.weekdayLabel}`,
    `- templates distintos: ${metrics.uniqueTemplates}`,
    `- temas distintos: ${metrics.uniqueThemes}`,
    `- CTAs distintos: ${metrics.uniqueCtas}`,
    `- estruturas distintas: ${metrics.uniqueStoryPatterns}`,
    `- gradients distintos: ${metrics.uniqueGradients}`,
    `- tipografias distintas: ${metrics.uniqueTypography}`,
    "",
    "## Lote",
  ];

  posts.forEach((post) => {
    lines.push(
      `### ${post.id}`,
      `- tipo: ${post.postType}`,
      `- pilar: ${post.pillar}`,
      `- hook: ${post.selectedHook.text}`,
      `- template: ${post.templateId}`,
      `- familia: ${post.visualDirection.layoutFamily}`,
      `- weekday family: ${post.weekdayFamily}`,
      `- gradient: ${post.gradientId}`,
      `- variante: ${post.paletteVariantId}`,
      `- paleta: ${post.visualDirection.palettePreset}`,
      `- tipografia: ${post.visualDirection.typographyPreset}`,
      `- cor: ${post.visualDirection.dominantColor} + ${post.visualDirection.secondaryColor}`,
      `- composicao: ${post.visualDirection.composition}`,
      `- estrutura: ${post.storyPattern}`,
      `- final QA: ${post.finalQa.status}`,
      `- CTA: ${post.cta}`,
      ""
    );
  });

  return lines.join("\n");
}

function capitalize(value) {
  const text = String(value || "");
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

function main() {
  const args = parseArgs(process.argv);
  const brief = readBrief(args);
  const outputDir = path.resolve(args["output-dir"] || path.join(".context", "instagram-orchestrator", new Date().toISOString().slice(0, 10)));
  const historyFile = path.resolve(args["history-file"] || DEFAULT_HISTORY_FILE);
  const history = readHistory(historyFile);

  const strategy = enforceAntiRepetition(buildStrategyPlan(brief, history));
  const posts = [];
  for (const item of strategy) {
    const built = buildPostPackage(item, posts.at(-1) || null, history, posts);
    posts.push(built);
  }

  const summary = {
    status: posts.every((post) => post.finalQa.status === "liberado") ? "ready" : "needs_revision",
    total: posts.length,
    approved: posts.filter((post) => post.finalQa.status === "liberado").length,
    blocked: posts.filter((post) => post.finalQa.status !== "liberado").length,
  };

  writeJson(path.join(outputDir, "briefing.json"), brief);
  writeJson(path.join(outputDir, "batch-plan.json"), { summary, strategy, posts });
  writeText(path.join(outputDir, "batch-report.md"), buildMarkdownReport(brief, posts));
  persistHistory(historyFile, posts, summary);

  posts.forEach((post) => {
    const postDir = path.join(outputDir, "posts", post.id);
    writeJson(path.join(postDir, "post.json"), post);
    writeText(
      path.join(postDir, "carousel-script.md"),
      [
        "## Tom recomendado",
        "",
        brief.copyAggressiveness,
        "",
        "## Estrutura",
        "",
        post.storyPattern,
        "",
        "## Legenda",
        "",
        post.caption,
        "",
        "## Hashtags",
        "",
        post.hashtags.join(" "),
        "",
        ...post.slides.flatMap((slide, index) => [
          `### Slide ${index + 1}`,
          `Titulo: ${slide.title}`,
          `Apoio: ${slide.support}`,
          "",
        ]),
      ].join("\n")
    );
  });

  console.log("✅ Instagram batch orchestrated");
  console.log(`   output: ${outputDir}`);
  console.log(`   status: ${summary.status}`);
  console.log(`   approved: ${summary.approved}/${summary.total}`);
}

main();
