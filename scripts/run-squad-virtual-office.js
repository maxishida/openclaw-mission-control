const fs = require("node:fs");
const path = require("node:path");
const {
  parsePartyCsv,
  parsePipelineSteps,
  parseStepMeta,
  buildIdleState,
  writeState,
  readSquadCode,
  isChiefAgent,
} = require("./squad-state-lib");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function appendActivity(state, code, counterRef, kind, title, detail, timestamp = new Date().toISOString()) {
  const nextCounter = counterRef.value + 1;
  counterRef.value = nextCounter;
  const current = Array.isArray(state.activity) ? state.activity : [];
  const entry = {
    id: `${code}-${kind}-${String(nextCounter).padStart(5, "0")}`,
    squad: code,
    timestamp,
    kind,
    title,
    detail,
  };
  state.activity = [...current, entry].slice(-200);
}

function labelFromStepFile(stepFile) {
  return stepFile.replace(/^step-\d+-/, "").replace(/\.md$/, "");
}

function averageScores(scores) {
  const values = Object.values(scores).filter((value) => typeof value === "number");
  if (values.length === 0) return null;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(average);
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function extractHashtags(video) {
  if (Array.isArray(video?.tags) && video.tags.length > 0) {
    return video.tags.map((tag) => (String(tag).startsWith("#") ? String(tag) : `#${tag}`));
  }
  const matches = String(video?.description || "").match(/#[a-z0-9_]+/gi);
  return matches ? matches.slice(0, 8) : ["#youtubeautomationtips", "#viralclips", "#automation"];
}

function buildSeedData(squadDir) {
  const render = readJsonIfExists(path.join(squadDir, "output", "clip-render-result.json"));
  const batch = readJsonIfExists(path.join(squadDir, "output", "youtube-publish-batch.json"));
  const live = readJsonIfExists(path.join(squadDir, "output", "publish-result-live.json"));

  const firstClip = Array.isArray(render?.clips) ? render.clips[0] : null;
  const firstVideo = Array.isArray(batch?.videos) ? batch.videos[0] : null;
  const liveResult = Array.isArray(live?.results) ? live.results[0] : null;

  return {
    source: render?.sourceVideo || firstVideo?.video_file || "manual-input",
    format: "youtube_shorts",
    language: "pt-BR",
    durationSeconds: firstClip ? 58 : 45,
    priority: "trend",
    clips: firstClip
      ? [
          {
            id: firstClip.id || "clip-001",
            title: firstVideo?.title || firstClip.title || "AI workflow viral clip",
            status: "queued",
            format: "9:16 shorts",
            score: null,
          },
        ]
      : [
          {
            id: "clip-001",
            title: firstVideo?.title || "AI workflow viral clip",
            status: "queued",
            format: "9:16 shorts",
            score: null,
          },
        ],
    title: firstVideo?.title || "AI workflow clip",
    description:
      firstVideo?.description ||
      "Hook forte sobre agentes de IA, automacao de workflow e distribuicao em YouTube Shorts.",
    hashtags: extractHashtags(firstVideo),
    publishedUrl: liveResult?.url || null,
  };
}

function buildInstagramSeedData(squadDir) {
  const manifest = readJsonIfExists(path.join(squadDir, "output", "assets-manifest.json"));
  const captionPath = path.join(squadDir, "output", "caption.txt");
  const caption = fs.existsSync(captionPath) ? fs.readFileSync(captionPath, "utf8").trim() : "";
  const imageCount = Array.isArray(manifest?.images) ? manifest.images.length : 7;

  return {
    source: "instagram_batch_request",
    format: "instagram_carousel",
    language: "pt-BR",
    durationSeconds: null,
    priority: "high",
    clips: Array.from({ length: 10 }, (_, index) => ({
      id: `post-${String(index + 1).padStart(2, "0")}`,
      title: `Instagram carousel ${index + 1}`,
      status: "queued",
      format: "1080x1350",
      score: null,
    })),
    title: manifest?.title || "Instagram carousel batch",
    description: caption || "Lote editorial de carrosseis com IA, automacao e workflow real.",
    hashtags: ["#AI", "#AIAgents", "#WorkflowAutomation", "#ProductManagement"],
    publishedUrl: null,
    imageCount,
  };
}

function setStep(state, steps, stepNumber) {
  const stepFile = steps[stepNumber - 1];
  state.step.current = Math.min(Math.max(stepNumber, 0), steps.length);
  state.step.label = stepFile ? labelFromStepFile(stepFile) : state.step.label;
}

function updateOrchestrator(state, patch) {
  if (!state.orchestrator) return;
  state.orchestrator = {
    ...state.orchestrator,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

function updatePipeline(state, patch) {
  if (!state.pipeline) return;
  state.pipeline = {
    ...state.pipeline,
    ...patch,
  };
}

function updateJob(state, patch) {
  if (!state.job) return;
  state.job = {
    ...state.job,
    ...patch,
  };
}

function updateQualityGate(state, patch) {
  if (!state.qualityGate) return;
  state.qualityGate = {
    ...state.qualityGate,
    ...patch,
    scores: {
      ...state.qualityGate.scores,
      ...(patch.scores || {}),
    },
    checklist: patch.checklist || state.qualityGate.checklist,
  };
}

function updateMonitoring(state, patch) {
  if (!state.monitoring) return;
  state.monitoring = {
    ...state.monitoring,
    ...patch,
  };
}

function setStageOutput(state, stage, payload) {
  if (!state.job) return;
  updateJob(state, {
    outputs: {
      ...(state.job.outputs || {}),
      [stage]: payload,
    },
  });
}

function createChecklist(overrides) {
  const defaults = [
    { id: "hook-first-3s", label: "Hook forte nos primeiros 3 segundos", passed: true },
    { id: "captions-synced", label: "Legenda sincronizada", passed: true },
    { id: "keyword-title", label: "Titulo com palavra-chave", passed: true },
    { id: "relevant-hashtags", label: "Hashtags relevantes", passed: true },
    { id: "short-duration", label: "Duracao otimizada para shorts", passed: true },
  ];
  const overrideMap = new Map((overrides || []).map((item) => [item.id, item]));
  return defaults.map((item) => ({
    ...item,
    ...(overrideMap.get(item.id) || {}),
  }));
}

function createCarouselChecklist(overrides) {
  const defaults = [
    { id: "hook-strong", label: "Hook forte na capa", passed: true },
    { id: "no-prompt-leakage", label: "Sem prompt vazado na arte", passed: true },
    { id: "safe-layout", label: "Tipografia dentro da safe area", passed: true },
    { id: "brand-consistent", label: "Consistencia de marca preservada", passed: true },
    { id: "caption-aligned", label: "Legenda e CTA alinhados ao lote", passed: true },
  ];
  const overrideMap = new Map((overrides || []).map((item) => [item.id, item]));
  return defaults.map((item) => ({
    ...item,
    ...(overrideMap.get(item.id) || {}),
  }));
}

function setAgentStatuses(
  state,
  chiefId,
  completedIds,
  {
    chiefStatus = "idle",
    workingId = null,
    deliveringId = null,
    retryIds = [],
    monitoringIds = [],
    deliverToMap = {},
  } = {}
) {
  const completed = completedIds instanceof Set ? completedIds : new Set(completedIds);
  const retrySet = new Set(retryIds);
  const monitoringSet = new Set(monitoringIds);
  state.agents = state.agents.map((agent) => {
    let status = "idle";
    if (agent.id === chiefId) {
      status = chiefStatus;
    } else if (agent.id === workingId) {
      status = "working";
    } else if (agent.id === deliveringId) {
      status = "delivering";
    } else if (retrySet.has(agent.id)) {
      status = "retry";
    } else if (monitoringSet.has(agent.id)) {
      status = "monitoring";
    } else if (completed.has(agent.id)) {
      status = "done";
    }

    return {
      ...agent,
      status,
      deliverTo: deliverToMap[agent.id] || null,
    };
  });
}

function persistState(squadDir, state) {
  state.updatedAt = new Date().toISOString();
  if (state.orchestrator) {
    state.orchestrator.updatedAt = state.updatedAt;
  }
  writeState(squadDir, clone(state));
}

async function runDecisionStep({
  squadDir,
  code,
  state,
  eventCounter,
  steps,
  stepNumber,
  phase,
  chiefId,
  completedIds,
  title,
  detail,
  nextAction,
  decisionReason,
  validationStatus,
  checkpoint = false,
  waitMs,
}) {
  setStep(state, steps, stepNumber);
  state.status = checkpoint ? "checkpoint" : "running";
  updatePipeline(state, {
    phase,
    currentAgentId: chiefId,
    validationStatus,
  });
  updateOrchestrator(state, {
    status: checkpoint ? "evaluating" : "routing",
    lastDecision: title,
    decisionReason,
    nextAction,
  });
  setAgentStatuses(state, chiefId, completedIds, { chiefStatus: "working" });

  appendActivity(
    state,
    code,
    eventCounter,
    "step",
    `Step ${stepNumber}/${steps.length}`,
    state.step.label,
    state.updatedAt
  );
  appendActivity(state, code, eventCounter, "decision", title, detail, new Date().toISOString());

  if (checkpoint) {
    appendActivity(
      state,
      code,
      eventCounter,
      "status",
      "Checkpoint reached",
      `${state.step.label} aguardando validacao do Chief Agent.`,
      new Date().toISOString()
    );
  }

  persistState(squadDir, state);
  await sleep(waitMs);

  state.status = "running";
  setAgentStatuses(state, chiefId, completedIds, { chiefStatus: "idle" });
}

async function runAgentStep({
  squadDir,
  code,
  state,
  eventCounter,
  steps,
  chiefId,
  completedIds,
  stepNumber,
  phase,
  agentId,
  deliverTo,
  startDetail,
  finishDetail,
  workMs,
  onStart,
  onFinish,
}) {
  setStep(state, steps, stepNumber);
  state.status = "running";
  updatePipeline(state, {
    phase,
    currentAgentId: agentId,
  });
  updateOrchestrator(state, {
    status: "routing",
    nextAction: `Waiting for ${agentId} to finish ${state.step.label}.`,
  });
  setAgentStatuses(state, chiefId, completedIds, {
    chiefStatus: "idle",
    workingId: agentId,
  });

  if (typeof onStart === "function") {
    onStart();
  }

  appendActivity(
    state,
    code,
    eventCounter,
    "step",
    `Step ${stepNumber}/${steps.length}`,
    state.step.label,
    new Date().toISOString()
  );
  appendActivity(
    state,
    code,
    eventCounter,
    "agent",
    `${agentId} started`,
    startDetail,
    new Date().toISOString()
  );
  persistState(squadDir, state);
  await sleep(Math.round(workMs * 0.6));

  setAgentStatuses(state, chiefId, completedIds, {
    chiefStatus: "working",
    deliveringId: agentId,
    deliverToMap: deliverTo ? { [agentId]: deliverTo } : {},
  });
  if (typeof onFinish === "function") {
    onFinish();
  }
  appendActivity(
    state,
    code,
    eventCounter,
    "agent",
    `${agentId} delivering`,
    finishDetail,
    new Date().toISOString()
  );
  if (deliverTo) {
    state.handoff = {
      from: agentId,
      to: deliverTo,
      message: `Completed ${state.step.label}`,
      completedAt: new Date().toISOString(),
    };
    appendActivity(
      state,
      code,
      eventCounter,
      "handoff",
      `${agentId} -> ${deliverTo}`,
      state.handoff.message,
      state.handoff.completedAt
    );
  }
  persistState(squadDir, state);
  await sleep(Math.round(workMs * 0.4));

  completedIds.add(agentId);
  state.handoff = null;
  setAgentStatuses(state, chiefId, completedIds, { chiefStatus: "idle" });
}

async function runRetrySignal({
  squadDir,
  code,
  state,
  eventCounter,
  chiefId,
  completedIds,
  retryIds,
  detail,
  waitMs,
}) {
  state.status = "running";
  updateOrchestrator(state, {
    status: "evaluating",
    lastDecision: "Retry required",
    decisionReason: detail,
    nextAction: "Route the failed package back to the responsible specialists.",
  });
  setAgentStatuses(state, chiefId, completedIds, {
    chiefStatus: "working",
    retryIds,
  });
  appendActivity(state, code, eventCounter, "retry", "Chief Agent triggered retry", detail, new Date().toISOString());
  persistState(squadDir, state);
  await sleep(waitMs);
  setAgentStatuses(state, chiefId, completedIds, { chiefStatus: "idle" });
}

async function runInstagramOrchestratedSimulation({
  squadDir,
  code,
  agents,
  steps,
  stepMs,
  checkpointMs,
}) {
  const chiefAgent = agents.find(isChiefAgent);
  const chiefId = chiefAgent ? chiefAgent.id : null;
  const completedIds = new Set();
  const eventCounter = { value: 0 };
  const state = buildIdleState(code, agents, steps.length);
  const seed = buildInstagramSeedData(squadDir);

  state.startedAt = new Date().toISOString();
  state.status = "running";
  state.activity = [];
  updateJob(state, {
    source: seed.source,
    format: seed.format,
    language: seed.language,
    durationSeconds: seed.durationSeconds,
    priority: seed.priority,
    clips: seed.clips,
    title: seed.title,
    description: seed.description,
    hashtags: seed.hashtags,
    context: {
      topic: "Carrosseis editoriais sobre agentes de IA e workflow real",
      audience: "founders, PMs, builders e operadores",
      platform: "instagram_carousel",
      language: seed.language || "pt-BR",
    },
    outputs: {},
  });
  updatePipeline(state, {
    phase: "IDLE",
    loop: 1,
    retries: 0,
    validationStatus: "pending",
    currentAgentId: chiefId,
  });
  updateQualityGate(state, {
    status: "pending",
    average: null,
    scores: { hook: null, retention: null, seo: null, clarity: null, impact: null },
    failedChecks: [],
    checklist: createCarouselChecklist(),
  });
  updateOrchestrator(state, {
    agentId: chiefId,
    status: "evaluating",
    mode: "editorial-control-loop",
    lastDecision: "Chief Orchestrator online",
    decisionReason: "Batch pipeline started with briefing, diversity planning, leakage control and publishing gates.",
    nextAction: "Trigger Intake Briefing and structure the batch request.",
  });
  setAgentStatuses(state, chiefId, completedIds, { chiefStatus: "working" });
  appendActivity(
    state,
    code,
    eventCounter,
    "status",
    "Squad started",
    `Chief Orchestrator activated ${agents.length} specialists for the editorial batch.`,
    state.startedAt
  );
  persistState(squadDir, state);
  await sleep(Math.round(stepMs * 0.3));

  await runAgentStep({
    squadDir, code, state, eventCounter, steps, chiefId, completedIds,
    stepNumber: 1, phase: "BRIEFING", agentId: "intake-briefing", deliverTo: "content-strategy",
    startDetail: "Structuring batch objective, audience, pillars and hard visual restrictions.",
    finishDetail: "Briefing locked with slide text limits, CTA rules and base style.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger Intake Briefing",
        decisionReason: "The batch needs a normalized brief before strategy and diversity planning.",
        nextAction: "Wait for the structured JSON brief.",
      });
      updateJob(state, { status: "briefing" });
    },
    onFinish: () => {
      setStageOutput(state, "briefing", {
        status: "ok",
        data: {
          batch_objective: "criar 10 carrosseis para Instagram",
          audience: "founders, PMs, builders e operadores",
          pillars: ["automacao com agentes", "produtividade com IA", "workflow real", "ferramentas para devs", "bastidores de sistemas"],
          visual_style: "cyberpunk dark tech com verde neon",
          restrictions: ["sem prompt vazado", "texto centralizado", "limite de texto por slide"],
        },
        score: 95,
        notes: "Brief estruturado e pronto para planejamento do lote.",
      });
      updateJob(state, { status: "briefing_ready" });
      updatePipeline(state, { lastCompletedPhase: "BRIEFING" });
    },
  });

  await runAgentStep({
    squadDir, code, state, eventCounter, steps, chiefId, completedIds,
    stepNumber: 2, phase: "STRATEGY", agentId: "content-strategy", deliverTo: "anti-repetition-planner",
    startDetail: "Planning the editorial matrix for the full batch before any copy is written.",
    finishDetail: "Batch matrix delivered with 10 post types and unique editorial goals.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger Content Strategy",
        decisionReason: "The brief is valid and the batch now needs themes, angles and objectives.",
        nextAction: "Wait for the 10-post editorial matrix.",
      });
      updateJob(state, { status: "strategy" });
    },
    onFinish: () => {
      setStageOutput(state, "strategy", {
        status: "ok",
        data: {
          batch_matrix: ["noticia", "tutorial", "comparacao", "erro", "bastidor", "ferramenta", "tendencia", "checklist", "case", "autoridade"],
          duplicate_themes: 0,
          duplicate_ctas: 0,
        },
        score: 91,
        notes: "Lote planejado com amplitude editorial suficiente.",
      });
      updateJob(state, { status: "strategy_ready" });
      updatePipeline(state, { lastCompletedPhase: "STRATEGY" });
    },
  });

  await runAgentStep({
    squadDir, code, state, eventCounter, steps, chiefId, completedIds,
    stepNumber: 3, phase: "VARIETY", agentId: "anti-repetition-planner", deliverTo: "hook-agent",
    startDetail: "Distributing themes, colors, CTA rotation and composition rules across the batch.",
    finishDetail: "Diversity plan delivered with no monotony flags.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger Anti-Repetition Planner",
        decisionReason: "The batch needs controlled variation before hooks and copy begin.",
        nextAction: "Wait for distribution of color, composition, density and CTA.",
      });
    },
    onFinish: () => {
      setStageOutput(state, "anti_repetition", {
        status: "ok",
        data: {
          dominant_colors: ["verde_escuro", "azul_petroleo", "roxo_escuro", "preto_grafite"],
          repeated_color_runs: 0,
          composition_rotation: ["headline_center", "headline_left_card", "headline_with_mockup"],
        },
        score: 94,
        notes: "Variação controlada preserva marca sem gerar clones.",
      });
      updatePipeline(state, { lastCompletedPhase: "VARIETY" });
    },
  });

  await runAgentStep({
    squadDir, code, state, eventCounter, steps, chiefId, completedIds,
    stepNumber: 4, phase: "HOOK", agentId: "hook-agent", deliverTo: "carousel-writer",
    startDetail: "Generating multiple hook options for each approved theme.",
    finishDetail: "Hooks selected and routed to copy.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger Hook Agent",
        decisionReason: "The batch matrix and variety plan are locked, so each post needs its opening angle.",
        nextAction: "Wait for the selected hooks before slide writing.",
      });
    },
    onFinish: () => {
      setStageOutput(state, "hook", {
        status: "ok",
        data: {
          selected_hook: "IA saiu do chat e entrou no workflow",
          options_count: 5,
        },
        score: 89,
        notes: "Hooks fortes com boa variação de cadência.",
      });
      updatePipeline(state, { lastCompletedPhase: "HOOK" });
    },
  });

  await runAgentStep({
    squadDir, code, state, eventCounter, steps, chiefId, completedIds,
    stepNumber: 5, phase: "CONTENT", agentId: "carousel-writer", deliverTo: "copy-qa",
    startDetail: "Writing slide structures from the approved hooks and batch objectives.",
    finishDetail: "Carousel scripts delivered for QA.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger Carousel Writer",
        decisionReason: "Hooks are approved and can now be expanded into slide structure.",
        nextAction: "Wait for slide scripts, caption and hashtags.",
      });
      updateJob(state, { status: "content" });
    },
    onFinish: () => {
      setStageOutput(state, "content", {
        status: "ok",
        data: {
          slide_count: 6,
          caption_ready: true,
          hashtags_ready: true,
          cta: "salve este carrossel para revisar com o time",
        },
        score: 87,
        notes: "Copy pronta para o primeiro gate editorial.",
      });
      updateJob(state, {
        status: "content_ready",
        clips: state.job.clips.map((clip, index) => ({
          ...clip,
          status: index === 0 ? "scripted" : clip.status,
        })),
      });
      updatePipeline(state, { lastCompletedPhase: "CONTENT" });
    },
  });

  await runAgentStep({
    squadDir, code, state, eventCounter, steps, chiefId, completedIds,
    stepNumber: 6, phase: "COPY_QA", agentId: "copy-qa", deliverTo: "visual-direction",
    startDetail: "Checking natural Portuguese, leakage tokens, slide limits and CTA quality.",
    finishDetail: "Copy QA passed without editorial blockers.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger Copy QA",
        decisionReason: "No visual work should start before the copy clears the editorial gate.",
        nextAction: "Wait for copy QA status and failures list.",
      });
      updateJob(state, { status: "copy_qa" });
    },
    onFinish: () => {
      setStageOutput(state, "copy_qa", {
        status: "ok",
        data: { approved: true, blockers: [], banned_terms_found: 0 },
        score: 90,
        notes: "Copy natural, limpa e sem vazamento tecnico.",
      });
      updatePipeline(state, { lastCompletedPhase: "COPY_QA" });
    },
  });

  await runAgentStep({
    squadDir, code, state, eventCounter, steps, chiefId, completedIds,
    stepNumber: 7, phase: "VISUAL_DIRECTION", agentId: "visual-direction", deliverTo: "design-prompt-builder",
    startDetail: "Defining color system, texture, composition and typography for the selected post.",
    finishDetail: "Visual direction approved for prompt packaging.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger Visual Direction",
        decisionReason: "Copy cleared QA and now needs a controlled art direction before prompting.",
        nextAction: "Wait for color, composition and density rules.",
      });
    },
    onFinish: () => {
      setStageOutput(state, "visual_direction", {
        status: "ok",
        data: {
          dominant_color: "verde_escuro",
          secondary_color: "verde_neon",
          composition: "headline_center",
          typography: "sans_heavy_centered",
        },
        score: 92,
        notes: "Direção visual consistente com o DNA aprovado.",
      });
      updatePipeline(state, { lastCompletedPhase: "VISUAL_DIRECTION" });
    },
  });

  await runAgentStep({
    squadDir, code, state, eventCounter, steps, chiefId, completedIds,
    stepNumber: 8, phase: "PROMPT_BUILD", agentId: "design-prompt-builder", deliverTo: "visual-designer",
    startDetail: "Separating copy text from visual prompt and layout instructions.",
    finishDetail: "Prompt bundle delivered with negative prompt and text overlay spec.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger Design Prompt Builder",
        decisionReason: "The visual prompt must stay separate from copy to avoid leakage in the art.",
        nextAction: "Wait for the prompt bundle and hard style constraints.",
      });
    },
    onFinish: () => {
      setStageOutput(state, "prompt_build", {
        status: "ok",
        data: {
          prompt_clean: true,
          negative_prompt: "prompt text, random letters, distorted typography",
          text_overlay_spec: "headline centered, support centered card, safe margins 72px",
        },
        score: 93,
        notes: "Prompt bundle limpo e seguro para a camada visual.",
      });
      updatePipeline(state, { lastCompletedPhase: "PROMPT_BUILD" });
    },
  });

  await runAgentStep({
    squadDir, code, state, eventCounter, steps, chiefId, completedIds,
    stepNumber: 9, phase: "IMAGE", agentId: "visual-designer", deliverTo: "layout-composer",
    startDetail: "Generating background assets and visual components for the selected carousel.",
    finishDetail: "Image assets delivered to layout.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger Image Generator",
        decisionReason: "Prompt bundle is approved and assets can now be generated.",
        nextAction: "Wait for the asset package before composing the final slides.",
      });
    },
    onFinish: () => {
      setStageOutput(state, "image", {
        status: "ok",
        data: {
          assets_ready: true,
          image_count: seed.imageCount,
          format: "jpeg",
        },
        score: 88,
        notes: "Assets prontos para a montagem final dos slides.",
      });
      updatePipeline(state, { lastCompletedPhase: "IMAGE" });
    },
  });

  await runAgentStep({
    squadDir, code, state, eventCounter, steps, chiefId, completedIds,
    stepNumber: 10, phase: "LAYOUT", agentId: "layout-composer", deliverTo: "ocr-leakage-validator",
    startDetail: "Composing the final slides with safe margins and centered text.",
    finishDetail: "Layout package delivered to leakage validation.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger Layout Composer",
        decisionReason: "Assets are ready and the text now needs controlled placement.",
        nextAction: "Wait for the final slide deck before OCR and leakage checks.",
      });
      updateJob(state, { status: "layout" });
    },
    onFinish: () => {
      setStageOutput(state, "layout", {
        status: "ok",
        data: {
          safe_margins: true,
          centered_text: true,
          text_blocks_per_slide: 2,
        },
        score: 90,
        notes: "Layout dentro da safe area e pronto para validacao automatica.",
      });
      updatePipeline(state, { lastCompletedPhase: "LAYOUT" });
    },
  });

  await runAgentStep({
    squadDir, code, state, eventCounter, steps, chiefId, completedIds,
    stepNumber: 11, phase: "OCR", agentId: "ocr-leakage-validator", deliverTo: "brand-consistency",
    startDetail: "Checking prompt leakage, truncation and text fidelity on the composed slides.",
    finishDetail: "Leakage validation passed.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger OCR Leakage Validator",
        decisionReason: "The composed deck must clear prompt leakage and truncation gates before brand QA.",
        nextAction: "Wait for leakage and truncation status.",
      });
    },
    onFinish: () => {
      setStageOutput(state, "ocr", {
        status: "ok",
        data: {
          prompt_leakage: false,
          truncation: false,
          illegible_text: false,
        },
        score: 94,
        notes: "Sem texto tecnico vazado e sem truncamento detectado.",
      });
      updatePipeline(state, { lastCompletedPhase: "OCR" });
    },
  });

  await runAgentStep({
    squadDir, code, state, eventCounter, steps, chiefId, completedIds,
    stepNumber: 12, phase: "BRAND_QA", agentId: "brand-consistency", deliverTo: "final-publishing-qa",
    startDetail: "Comparing the carousel against the batch to preserve brand without monotony.",
    finishDetail: "Brand consistency approved.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger Brand Consistency",
        decisionReason: "Leakage cleared and the batch now needs a consistency pass.",
        nextAction: "Wait for brand and monotony status.",
      });
    },
    onFinish: () => {
      setStageOutput(state, "brand", {
        status: "ok",
        data: {
          dominant_color_ok: true,
          composition_ok: true,
          monotony_flag: false,
        },
        score: 88,
        notes: "DNA da marca preservado com variacao suficiente no lote.",
      });
      updatePipeline(state, { lastCompletedPhase: "BRAND_QA" });
    },
  });

  await runAgentStep({
    squadDir, code, state, eventCounter, steps, chiefId, completedIds,
    stepNumber: 13, phase: "FINAL_QA", agentId: "final-publishing-qa", deliverTo: "chief-orchestrator",
    startDetail: "Running the final editorial and packaging gate before user approval.",
    finishDetail: "Final QA approved the package for dry run.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger Final Publishing QA",
        decisionReason: "All specialized validations are complete and the package needs one final release gate.",
        nextAction: "If approved, move to package checkpoint and dry run.",
      });
      updateJob(state, { status: "final_qa" });
    },
    onFinish: () => {
      const scores = { hook: 90, retention: 91, seo: 87, clarity: 92, impact: 89 };
      const average = averageScores(scores);
      setStageOutput(state, "final_qa", {
        status: "ok",
        data: { approved: true, fail_reasons: [] },
        score: average,
        notes: "Pacote editorial pronto para dry run e liberacao final.",
      });
      updateQualityGate(state, {
        status: "approved",
        average,
        scores,
        failedChecks: [],
        checklist: createCarouselChecklist(),
      });
      updateJob(state, {
        status: "package_ready",
        score: average,
        clips: state.job.clips.map((clip, index) => ({
          ...clip,
          status: index === 0 ? "qa_approved" : clip.status,
          score: index === 0 ? average : clip.score,
        })),
      });
      updatePipeline(state, { validationStatus: "approved", lastCompletedPhase: "FINAL_QA" });
    },
  });

  await runDecisionStep({
    squadDir, code, state, eventCounter, steps,
    stepNumber: 14, phase: "FINAL_QA", chiefId, completedIds,
    title: "Package checkpoint reached",
    detail: "The Chief Orchestrator is holding the package for explicit approval before dry run.",
    nextAction: "Approve package, request edits or block publication.",
    decisionReason: "No publish step should start before the package is approved end-to-end.",
    validationStatus: "approved",
    checkpoint: true,
    waitMs: checkpointMs,
  });

  await runAgentStep({
    squadDir, code, state, eventCounter, steps, chiefId, completedIds,
    stepNumber: 15, phase: "PUBLISH", agentId: "instagram-publisher", deliverTo: "chief-orchestrator",
    startDetail: "Running dry-run publish with the approved package and caption.",
    finishDetail: "Dry-run passed and the package is ready for explicit live publish confirmation.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger Instagram Publisher dry run",
        decisionReason: "The package was approved and now needs operational validation.",
        nextAction: "Wait for dry-run result before live publish confirmation.",
      });
      updateJob(state, { status: "dry_run" });
    },
    onFinish: () => {
      setStageOutput(state, "publish", {
        status: "ok",
        data: {
          mode: "dry_run",
          images: seed.imageCount,
          caption_ready: true,
          containers_ready: true,
        },
        score: 95,
        notes: "Dry-run operacional aprovado sem erro.",
      });
      updateJob(state, { status: "dry_run_ready" });
      updatePipeline(state, { lastCompletedPhase: "PUBLISH" });
    },
  });

  await runDecisionStep({
    squadDir, code, state, eventCounter, steps,
    stepNumber: 16, phase: "PUBLISH", chiefId, completedIds,
    title: "Live publish checkpoint",
    detail: "The Chief Orchestrator is waiting for explicit publish approval after the dry run.",
    nextAction: "Publish now or hold the package.",
    decisionReason: "Live publish remains blocked until dry run clears and approval exists.",
    validationStatus: "approved",
    checkpoint: true,
    waitMs: checkpointMs,
  });

  await runAgentStep({
    squadDir, code, state, eventCounter, steps, chiefId, completedIds,
    stepNumber: 17, phase: "PUBLISH", agentId: "instagram-publisher", deliverTo: null,
    startDetail: "Publishing the approved carousel package to Instagram.",
    finishDetail: "Instagram publish completed and the batch is ready for monitoring.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger Instagram Publisher live publish",
        decisionReason: "Dry run and live approval are both in place.",
        nextAction: "Record permalink and transition the batch to completed.",
      });
      updateJob(state, { status: "publishing" });
    },
    onFinish: () => {
      setStageOutput(state, "publish_live", {
        status: "ok",
        data: {
          status: "success",
          permalink: "https://www.instagram.com/p/example/",
          image_count: seed.imageCount,
        },
        score: 100,
        notes: "Publicacao concluida com o pacote aprovado.",
      });
      updateJob(state, {
        status: "published",
        published_url: "https://www.instagram.com/p/example/",
        clips: state.job.clips.map((clip, index) => ({
          ...clip,
          status: index === 0 ? "published" : clip.status,
        })),
      });
      updateMonitoring(state, {
        status: "watching",
        nextAction: "Observe save rate, share rate and comments for replication patterns.",
        learning: "Awaiting first performance signal to refine future carousel lots.",
      });
      updatePipeline(state, { phase: "MONITOR", lastCompletedPhase: "PUBLISH" });
      updateOrchestrator(state, {
        status: "monitoring",
        lastDecision: "Package published",
        decisionReason: "All gates passed and the live publish finished successfully.",
        nextAction: "Monitor post performance and feed the next batch with winning patterns.",
      });
    },
  });

  const completed = clone(state);
  completed.status = "completed";
  completed.step.current = steps.length;
  completed.step.label = "complete";
  completed.updatedAt = new Date().toISOString();
  appendActivity(
    completed,
    code,
    eventCounter,
    "status",
    "Squad completed",
    "Instagram editorial batch finished with gated publication flow.",
    completed.updatedAt
  );
  writeState(squadDir, completed);
  console.log(`Completed squad simulation: ${code}`);
}

async function runOrchestratedSimulation({
  squadDir,
  code,
  agents,
  steps,
  stepMs,
  checkpointMs,
}) {
  const chiefAgent = agents.find(isChiefAgent);
  const chiefId = chiefAgent ? chiefAgent.id : null;
  const completedIds = new Set();
  const eventCounter = { value: 0 };
  const state = buildIdleState(code, agents, steps.length);
  const seed = buildSeedData(squadDir);

  state.startedAt = new Date().toISOString();
  state.status = "running";
  state.activity = [];
  updateJob(state, {
    source: seed.source,
    format: seed.format,
    language: seed.language,
    durationSeconds: seed.durationSeconds,
    priority: seed.priority,
    clips: seed.clips,
    title: seed.title,
    description: seed.description,
    hashtags: seed.hashtags,
    context: {
      topic: "AI workflows e automacao de conteudo",
      audience: "founders e lideres de produto",
      platform: "youtube_shorts",
      language: seed.language || "pt-BR",
    },
    outputs: {},
  });
  updatePipeline(state, {
    phase: "IDLE",
    loop: 1,
    retries: 0,
    validationStatus: "pending",
    currentAgentId: chiefId,
  });
  updateOrchestrator(state, {
    agentId: chiefId,
    status: "evaluating",
    mode: "control-loop",
    lastDecision: "Chief Agent online",
    decisionReason: "Pipeline started with structured JSON contracts and score-based validation.",
    nextAction: "Trigger Intake Analyst and seed the first video job.",
  });
  setAgentStatuses(state, chiefId, completedIds, { chiefStatus: "working" });
  appendActivity(
    state,
    code,
    eventCounter,
    "status",
    "Squad started",
    `Chief Agent activated structured control for ${agents.length} specialists.`,
    state.startedAt
  );
  persistState(squadDir, state);
  await sleep(Math.round(stepMs * 0.3));

  await runAgentStep({
    squadDir,
    code,
    state,
    eventCounter,
    steps,
    chiefId,
    completedIds,
    stepNumber: 1,
    phase: "INTAKE",
    agentId: "video-intake-analyst",
    deliverTo: "hook-writer",
    startDetail: "Selecting the source video, validating metadata and extracting structured context.",
    finishDetail: "Structured intake package delivered with theme, audience and key moments.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger Intake Analyst",
        decisionReason: "No validated source video was loaded at the beginning of the run.",
        nextAction: "Wait for metadata and initial context before scripting the hook.",
      });
      updateJob(state, { status: "intake", attempts: 1 });
    },
    onFinish: () => {
      setStageOutput(state, "intake", {
        status: "ok",
        data: {
          source_url: seed.source,
          theme: "Automacao com agentes de IA",
          audience: "founders e PMs",
          duration_seconds: seed.durationSeconds,
          language: seed.language,
          key_moments: ["problema operacional", "ganho de velocidade", "padrao replicavel"],
        },
        score: 91,
        notes: "Tema e contexto inicial claros para o resto do pipeline.",
      });
      updateJob(state, { status: "intake_ready" });
      updatePipeline(state, { lastCompletedPhase: "INTAKE" });
    },
  });

  await runAgentStep({
    squadDir,
    code,
    state,
    eventCounter,
    steps,
    chiefId,
    completedIds,
    stepNumber: 2,
    phase: "HOOK",
    agentId: "hook-writer",
    deliverTo: "seo-strategist",
    startDetail: "Writing a structured hook and 40-second micro-script for retention.",
    finishDetail: "Hook package delivered with timeline and loop ending.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger Hook Writer",
        decisionReason: "The intake contract is valid and the video needs a strong opening before SEO packaging.",
        nextAction: "Wait for a hook, short script and loop ending.",
      });
      updateJob(state, { status: "hook" });
    },
    onFinish: () => {
      setStageOutput(state, "hook", {
        status: "ok",
        data: {
          hook: "Essa IA corta semanas do seu workflow",
          script: [
            { t: "0-2s", line: "Essa IA corta semanas do seu workflow." },
            { t: "2-10s", line: "Nao e hype. E um sistema que remove gargalos reais." },
            { t: "10-30s", line: "Ele pega contexto, decide o proximo passo e entrega saida pronta para publicar." },
            { t: "30-40s", line: "O segredo nao e volume. E score, gate e repeticao do padrao certo." },
          ],
          loop_end: "E isso muda completamente o jeito que founders operam.",
        },
        score: 86,
        notes: "Bom impacto inicial, mas ainda depende de reforco de CTR no pacote SEO.",
      });
      updateJob(state, {
        status: "hook_ready",
        clips: state.job.clips.map((clip) => ({ ...clip, status: "hooked" })),
      });
      updatePipeline(state, { lastCompletedPhase: "HOOK" });
    },
  });

  await runAgentStep({
    squadDir,
    code,
    state,
    eventCounter,
    steps,
    chiefId,
    completedIds,
    stepNumber: 3,
    phase: "SEO",
    agentId: "seo-strategist",
    deliverTo: "clip-strategist",
    startDetail: "Generating title, description and layered hashtags for CTR and discovery.",
    finishDetail: "SEO package delivered with keyword-first metadata.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger SEO Strategist",
        decisionReason: "The hook exists and now needs a CTR-oriented packaging layer.",
        nextAction: "Validate title, keywords and hashtag coverage before cut planning.",
      });
      updateJob(state, { status: "seo" });
    },
    onFinish: () => {
      setStageOutput(state, "seo", {
        status: "ok",
        data: {
          keyword_main: "IA para founders",
          title: "IA para founders: o workflow que corta semanas",
          description:
            "IA para founders nao e brinquedo. Ela corta semanas de operacao quando voce controla o fluxo certo.\nVeja como esse workflow de IA acelera decisao, execucao e distribuicao.\n\nEsse workflow de IA combina contexto, validacao e publish em uma unica esteira.\n\n#ai #automation #founders #shorts #viral #aiworkflow #youtubeautomationtips",
          hashtags: ["#ai", "#automation", "#founders", "#shorts", "#viral", "#aiworkflow", "#youtubeautomationtips"],
        },
        score: 83,
        notes: "Pacote SEO suficiente para prosseguir, mas ainda pode subir com um titulo mais agressivo.",
      });
      updateJob(state, {
        status: "seo_ready",
        title: "IA para founders: o workflow que corta semanas",
        description:
          "IA para founders nao e brinquedo. Ela corta semanas de operacao quando voce controla o fluxo certo.\nVeja como esse workflow de IA acelera decisao, execucao e distribuicao.\n\nEsse workflow de IA combina contexto, validacao e publish em uma unica esteira.\n\n#ai #automation #founders #shorts #viral #aiworkflow #youtubeautomationtips",
        hashtags: ["#ai", "#automation", "#founders", "#shorts", "#viral", "#aiworkflow", "#youtubeautomationtips"],
      });
      updatePipeline(state, { lastCompletedPhase: "SEO" });
    },
  });

  await runAgentStep({
    squadDir,
    code,
    state,
    eventCounter,
    steps,
    chiefId,
    completedIds,
    stepNumber: 4,
    phase: "STRATEGY",
    agentId: "clip-strategist",
    deliverTo: "clip-editor",
    startDetail: "Defining cuts, pacing and highlight events for the approved narrative.",
    finishDetail: "Clip strategy delivered with cuts and pacing instructions.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger Clip Strategist",
        decisionReason: "Hook and SEO are valid, so the next gate is pacing and cut design.",
        nextAction: "Wait for cut windows, pacing and highlight markers.",
      });
      updateJob(state, { status: "strategy" });
    },
    onFinish: () => {
      setStageOutput(state, "strategy", {
        status: "ok",
        data: {
          cuts: [{ start: "0", end: "38", reason: "Single high-density segment with fast payoff." }],
          pacing: "aggressive",
          highlights: [
            { t: "1", type: "zoom", note: "Hit on the hook keyword." },
            { t: "7", type: "cut", note: "Remove pause before proof point." },
            { t: "18", type: "overlay", note: "Show the workflow stages visually." },
          ],
        },
        score: 88,
        notes: "Pacing and cut plan are strong enough for editing.",
      });
      updateJob(state, {
        status: "strategy_ready",
        clips: state.job.clips.map((clip) => ({ ...clip, status: "strategized" })),
      });
      updatePipeline(state, { lastCompletedPhase: "STRATEGY" });
    },
  });

  await runAgentStep({
    squadDir,
    code,
    state,
    eventCounter,
    steps,
    chiefId,
    completedIds,
    stepNumber: 5,
    phase: "EDIT",
    agentId: "clip-editor",
    deliverTo: "quality-reviewer",
    startDetail: "Applying cuts, subtitles and keyword emphasis for the first edit pass.",
    finishDetail: "Draft 1 delivered to the mandatory quality gate.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger Clip Editor",
        decisionReason: "Strategy is defined and can now be turned into an edited short.",
        nextAction: "Wait for the first edit output and validate it against the score gate.",
      });
      updateJob(state, { status: "edit" });
    },
    onFinish: () => {
      setStageOutput(state, "edit", {
        status: "ok",
        data: {
          edited_video_path: "squads/youtube-viral-clips/output/clips/smoke-test-clip.mp4",
          duration_seconds: 38,
          subtitle_style: "bold_dynamic",
          issues: ["pacing still has one slow segment near 10s"],
        },
        score: 77,
        notes: "Legendas boas, mas o ritmo ainda precisa ficar mais seco.",
      });
      updateJob(state, {
        status: "edit_ready",
        clips: state.job.clips.map((clip) => ({ ...clip, status: "edited-draft-1" })),
      });
      updatePipeline(state, { lastCompletedPhase: "EDIT" });
    },
  });

  await runAgentStep({
    squadDir,
    code,
    state,
    eventCounter,
    steps,
    chiefId,
    completedIds,
    stepNumber: 6,
    phase: "REVIEW",
    agentId: "quality-reviewer",
    deliverTo: "chief-agent",
    startDetail: "Running the mandatory publish gate across hook, edit and SEO outputs.",
    finishDetail: "Draft 1 review failed and requires retry.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger Quality Reviewer",
        decisionReason: "Every structured output exists, so the Chief Agent can request a hard quality gate.",
        nextAction: "If the score drops below 80, reroute the corresponding stage.",
      });
      updateJob(state, { status: "review" });
    },
    onFinish: () => {
      const scores = { hook: 78, retention: 76, seo: 82, clarity: 84, impact: 79 };
      const checklist = createChecklist([{ id: "hook-first-3s", passed: false }]);
      const average = averageScores(scores);
      setStageOutput(state, "review", {
        status: "retry",
        data: {
          approved: false,
          fail_reasons: ["Hook abaixo de 80", "Retencao abaixo de 80", "Hook inicial pouco agressivo"],
        },
        score: average,
        notes: "Retry obrigatorio em hook e edicao.",
      });
      updateQualityGate(state, {
        status: "retry_required",
        average,
        scores,
        failedChecks: ["Hook below minimum threshold", "Retention pacing below minimum threshold"],
        checklist,
      });
      updatePipeline(state, { validationStatus: "retry_required", retries: 1 });
      updateJob(state, {
        status: "retry_required",
        score: average,
        clips: state.job.clips.map((clip) => ({ ...clip, status: "needs_retry", score: average })),
      });
      appendActivity(
        state,
        code,
        eventCounter,
        "validation",
        "Quality gate failed",
        `Draft 1 scored ${average}/100. Chief Agent must reroute Hook Writer and Clip Editor.`,
        new Date().toISOString()
      );
    },
  });

  await runRetrySignal({
    squadDir,
    code,
    state,
    eventCounter,
    chiefId,
    completedIds,
    retryIds: ["hook-writer", "clip-editor"],
    detail: "Hook and edit outputs are below 80. Reroute Hook Writer first, then Clip Editor.",
    waitMs: Math.round(stepMs * 0.55),
  });

  updatePipeline(state, { loop: 2, retries: 1 });

  await runAgentStep({
    squadDir,
    code,
    state,
    eventCounter,
    steps,
    chiefId,
    completedIds,
    stepNumber: 2,
    phase: "HOOK",
    agentId: "hook-writer",
    deliverTo: "seo-strategist",
    startDetail: "Rewriting the hook for stronger shock in the first 2 seconds.",
    finishDetail: "Draft 2 hook delivered with better impact and cleaner loop ending.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Retry Hook Writer",
        decisionReason: "Hook scored below 80 in the first review cycle.",
        nextAction: "Refresh the title package after the new opening is ready.",
      });
      updateJob(state, { status: "hook-retry", attempts: 2 });
    },
    onFinish: () => {
      setStageOutput(state, "hook", {
        status: "ok",
        data: {
          hook: "Founders perdem semanas por ignorar isso",
          script: [
            { t: "0-2s", line: "Founders perdem semanas por ignorar isso." },
            { t: "2-10s", line: "Nao falta ferramenta. Falta um fluxo que decide o proximo passo." },
            { t: "10-30s", line: "Quando agentes recebem contexto, validam e entregam saida, a operacao acelera de verdade." },
            { t: "30-40s", line: "E esse padrao ainda vira conteudo que se distribui sozinho." },
          ],
          loop_end: "Agora olha como isso muda o jogo no proximo corte.",
        },
        score: 91,
        notes: "Hook refeito com impacto mais alto e mais clareza para founders.",
      });
    },
  });

  await runAgentStep({
    squadDir,
    code,
    state,
    eventCounter,
    steps,
    chiefId,
    completedIds,
    stepNumber: 3,
    phase: "SEO",
    agentId: "seo-strategist",
    deliverTo: "clip-strategist",
    startDetail: "Refreshing the metadata to match the stronger founder-centric hook.",
    finishDetail: "SEO package updated after hook retry.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Refresh SEO package",
        decisionReason: "The new hook changes the CTR angle and needs aligned metadata.",
        nextAction: "Pass the refreshed package back to strategy and edit.",
      });
      updateJob(state, { status: "seo-retry" });
    },
    onFinish: () => {
      setStageOutput(state, "seo", {
        status: "ok",
        data: {
          keyword_main: "Founders IA",
          title: "Founders + IA: o fluxo que corta semanas",
          description:
            "Founders com IA ganham velocidade quando o workflow decide e publica com criterio.\nEsse fluxo de founders com IA tira gargalos e transforma execucao em distribuicao.\n\nSe voce quer founders com IA operando melhor, comece pelo fluxo, nao pela ferramenta.\n\n#ai #automation #founders #shorts #viral #aiworkflow #youtubeautomationtips",
          hashtags: ["#ai", "#automation", "#founders", "#shorts", "#viral", "#aiworkflow", "#youtubeautomationtips"],
        },
        score: 89,
        notes: "Titulo mais agressivo e keyword mais alinhada ao novo hook.",
      });
      updateJob(state, {
        title: "Founders + IA: o fluxo que corta semanas",
        description:
          "Founders com IA ganham velocidade quando o workflow decide e publica com criterio.\nEsse fluxo de founders com IA tira gargalos e transforma execucao em distribuicao.\n\nSe voce quer founders com IA operando melhor, comece pelo fluxo, nao pela ferramenta.\n\n#ai #automation #founders #shorts #viral #aiworkflow #youtubeautomationtips",
        hashtags: ["#ai", "#automation", "#founders", "#shorts", "#viral", "#aiworkflow", "#youtubeautomationtips"],
      });
    },
  });

  await runAgentStep({
    squadDir,
    code,
    state,
    eventCounter,
    steps,
    chiefId,
    completedIds,
    stepNumber: 5,
    phase: "EDIT",
    agentId: "clip-editor",
    deliverTo: "quality-reviewer",
    startDetail: "Re-editing with tighter pacing and stronger caption emphasis.",
    finishDetail: "Draft 2 delivered for final quality validation.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Retry Clip Editor",
        decisionReason: "The first edit scored below 80 on pacing and retention.",
        nextAction: "Run a second quality gate after the revised cut.",
      });
      updateJob(state, { status: "edit-retry" });
    },
    onFinish: () => {
      setStageOutput(state, "edit", {
        status: "ok",
        data: {
          edited_video_path: "squads/youtube-viral-clips/output/clips/smoke-test-clip.mp4",
          duration_seconds: 35,
          subtitle_style: "bold_dynamic",
          issues: [],
        },
        score: 88,
        notes: "Pacing tightened and no visible production issue remains.",
      });
      updateJob(state, {
        status: "edit_ready",
        clips: state.job.clips.map((clip) => ({ ...clip, status: "edited-draft-2" })),
      });
    },
  });

  await runAgentStep({
    squadDir,
    code,
    state,
    eventCounter,
    steps,
    chiefId,
    completedIds,
    stepNumber: 6,
    phase: "REVIEW",
    agentId: "quality-reviewer",
    deliverTo: "chief-agent",
    startDetail: "Running the second mandatory publish gate.",
    finishDetail: "Draft 2 review approved the package for publishing.",
    workMs: stepMs,
    onFinish: () => {
      const scores = { hook: 91, retention: 88, seo: 89, clarity: 87, impact: 90 };
      const checklist = createChecklist();
      const average = averageScores(scores);
      setStageOutput(state, "review", {
        status: "ok",
        data: {
          approved: true,
          fail_reasons: [],
        },
        score: average,
        notes: "Publish gate cleared on the second pass.",
      });
      updateQualityGate(state, {
        status: "approved",
        average,
        scores,
        failedChecks: [],
        checklist,
      });
      updatePipeline(state, { validationStatus: "approved" });
      updateJob(state, {
        status: "approved",
        score: average,
        clips: state.job.clips.map((clip) => ({ ...clip, status: "approved", score: average })),
      });
      appendActivity(
        state,
        code,
        eventCounter,
        "validation",
        "Quality gate approved",
        `Draft 2 scored ${average}/100 and passed every publish checklist item.`,
        new Date().toISOString()
      );
    },
  });

  await runDecisionStep({
    squadDir,
    code,
    state,
    eventCounter,
    steps,
    stepNumber: 7,
    phase: "REVIEW",
    chiefId,
    completedIds,
    title: "Chief Agent approved the clip pack",
    detail: "The package cleared the 85+ publish threshold and can move into distribution prep.",
    nextAction: "Trigger Clip Publisher for dry-run preview.",
    decisionReason: "Hook, edit and SEO outputs are all above the minimum publish score.",
    validationStatus: "approved",
    checkpoint: true,
    waitMs: checkpointMs,
  });

  await runAgentStep({
    squadDir,
    code,
    state,
    eventCounter,
    steps,
    chiefId,
    completedIds,
    stepNumber: 8,
    phase: "PUBLISH",
    agentId: "clip-publisher",
    deliverTo: "chief-agent",
    startDetail: "Preparing the YouTube publish batch and validating metadata in dry-run mode.",
    finishDetail: "Dry-run publish preview completed with no blocking API issue.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger Publisher dry-run",
        decisionReason: "The approved package needs a final technical preview before live publish.",
        nextAction: "Verify batch integrity and prepare the live confirmation gate.",
      });
      updateJob(state, { status: "publishing-preview" });
    },
    onFinish: () => {
      setStageOutput(state, "publish", {
        status: "ok",
        data: {
          youtube_url: "",
          video_id: "",
        },
        score: 100,
        notes: "Dry-run validated payload structure and metadata.",
      });
      updateJob(state, {
        status: "dry-run-ready",
        clips: state.job.clips.map((clip) => ({ ...clip, status: "dry-run-passed" })),
      });
    },
  });

  await runDecisionStep({
    squadDir,
    code,
    state,
    eventCounter,
    steps,
    stepNumber: 9,
    phase: "PUBLISH",
    chiefId,
    completedIds,
    title: "Chief Agent unlocked live publish",
    detail: "Dry-run and quality gate are green. Live publish can proceed.",
    nextAction: "Trigger Clip Publisher for live publication.",
    decisionReason: "The package is approved, technically valid and already has the right metadata.",
    validationStatus: "approved",
    checkpoint: true,
    waitMs: checkpointMs,
  });

  await runAgentStep({
    squadDir,
    code,
    state,
    eventCounter,
    steps,
    chiefId,
    completedIds,
    stepNumber: 10,
    phase: "PUBLISH",
    agentId: "clip-publisher",
    deliverTo: "chief-agent",
    startDetail: "Publishing the approved clip package to YouTube via API.",
    finishDetail: "Live publish completed and post URL delivered to the Chief Agent.",
    workMs: stepMs,
    onStart: () => {
      updateOrchestrator(state, {
        lastDecision: "Trigger live publish",
        decisionReason: "Dry-run succeeded and the user approval gate has been satisfied.",
        nextAction: "Switch to monitoring as soon as the publish URL is registered.",
      });
      updateJob(state, { status: "publishing-live" });
    },
    onFinish: () => {
      const liveUrl = seed.publishedUrl || "https://www.youtube.com/watch?v=published-clip";
      setStageOutput(state, "publish", {
        status: "ok",
        data: {
          youtube_url: liveUrl,
          video_id: liveUrl.split("v=")[1] || "",
        },
        score: 100,
        notes: "Live publish succeeded.",
      });
      updateJob(state, {
        status: "published",
        published_url: liveUrl,
        clips: state.job.clips.map((clip) => ({ ...clip, status: "published" })),
      });
      updatePipeline(state, { lastCompletedPhase: "PUBLISH" });
      appendActivity(
        state,
        code,
        eventCounter,
        "status",
        "Video published",
        `Published clip is live at ${liveUrl}`,
        new Date().toISOString()
      );
    },
  });

  setStep(state, steps, 11);
  state.status = "running";
  updatePipeline(state, {
    phase: "MONITOR",
    loop: 2,
    currentAgentId: chiefId,
    lastCompletedPhase: "MONITOR",
  });
  updateOrchestrator(state, {
    status: "monitoring",
    lastDecision: "Start post-publish monitoring",
    decisionReason: "The clip is live and now needs early performance feedback.",
    nextAction: "Watch CTR and retention for 30 to 60 minutes, then decide whether to replicate or optimize.",
  });
  setAgentStatuses(state, chiefId, completedIds, {
    chiefStatus: "monitoring",
    monitoringIds: ["clip-publisher"],
  });
  appendActivity(
    state,
    code,
    eventCounter,
    "step",
    `Step 11/${steps.length}`,
    state.step.label,
    new Date().toISOString()
  );
  appendActivity(
    state,
    code,
    eventCounter,
    "monitor",
    "Monitoring started",
    "Chief Agent is tracking views, CTR and retention for the published clip.",
    new Date().toISOString()
  );
  updateMonitoring(state, {
    status: "optimizing",
    views: 1840,
    ctr: 4.2,
    retention: 67,
    lastCheckAt: new Date().toISOString(),
    nextAction: "CTR is below the target. Swap to a more aggressive title and keep the same clip asset.",
    learning: "Founder-first hooks outperformed the generic automation angle. Reuse this template for future clips.",
    optimizationStatus: "queued",
  });
  persistState(squadDir, state);
  await sleep(stepMs);

  state.status = "completed";
  state.step.current = steps.length;
  state.step.label = "monitor-performance";
  updateJob(state, { status: "monitoring" });
  updateOrchestrator(state, {
    status: "monitoring",
    lastDecision: "Pipeline completed in adaptive mode",
    decisionReason: "The clip was published and moved into monitored optimization.",
    nextAction: "Keep monitoring and push a metadata iteration if CTR stays below target.",
  });
  appendActivity(
    state,
    code,
    eventCounter,
    "status",
    "Squad completed",
    "Adaptive pipeline finished with publish, monitoring and queued optimization.",
    new Date().toISOString()
  );
  persistState(squadDir, state);
  console.log(`Completed orchestrated squad simulation: ${code}`);
}

async function runLinearSimulation({
  squadDir,
  code,
  agents,
  steps,
  stepMs,
  checkpointMs,
}) {
  const eventCounter = { value: 0 };
  const initialState = buildIdleState(code, agents, steps.length);
  initialState.startedAt = new Date().toISOString();
  initialState.status = "running";
  initialState.activity = [];
  appendActivity(
    initialState,
    code,
    eventCounter,
    "status",
    "Squad started",
    `Simulation started with ${agents.length} agents and ${steps.length} steps.`,
    initialState.startedAt
  );
  writeState(squadDir, initialState);

  for (let index = 0; index < steps.length; index += 1) {
    const stepFile = steps[index];
    const stepMeta = parseStepMeta(squadDir, stepFile);
    const label = labelFromStepFile(stepFile);
    const state = clone(initialState);
    state.step.current = index + 1;
    state.step.label = label;
    state.updatedAt = new Date().toISOString();
    appendActivity(
      state,
      code,
      eventCounter,
      "step",
      `Step ${index + 1}/${steps.length}`,
      label,
      state.updatedAt
    );

    if (stepMeta.type === "checkpoint") {
      state.status = "checkpoint";
      state.handoff = {
        from: "system",
        to: "user",
        message: `Checkpoint: ${label}`,
        completedAt: new Date().toISOString(),
      };
      state.agents = state.agents.map((agent) => ({
        ...agent,
        status: agent.status === "done" ? "done" : "checkpoint",
        deliverTo: null,
      }));
      appendActivity(
        state,
        code,
        eventCounter,
        "status",
        "Checkpoint reached",
        `Checkpoint "${label}" requires confirmation.`,
        state.updatedAt
      );
      writeState(squadDir, state);
      initialState.status = state.status;
      initialState.step.current = state.step.current;
      initialState.step.label = state.step.label;
      initialState.updatedAt = state.updatedAt;
      initialState.activity = state.activity;
      await sleep(checkpointMs);

      initialState.agents = state.agents.map((agent) => ({
        ...agent,
        status: agent.status === "done" ? "done" : "idle",
        deliverTo: null,
      }));
      initialState.handoff = null;
      initialState.status = "running";
      continue;
    }

    const activeId = stepMeta.agent;
    state.status = "running";
    state.agents = state.agents.map((agent) => ({
      ...agent,
      status: agent.id === activeId ? "working" : agent.status === "done" ? "done" : "idle",
      deliverTo: null,
    }));
    const activeAgent = state.agents.find((agent) => agent.id === activeId);
    if (activeAgent) {
      appendActivity(
        state,
        code,
        eventCounter,
        "agent",
        `${activeAgent.name} started`,
        `Working on "${label}".`,
        state.updatedAt
      );
    }
    writeState(squadDir, state);
    initialState.status = state.status;
    initialState.step.current = state.step.current;
    initialState.step.label = state.step.label;
    initialState.updatedAt = state.updatedAt;
    initialState.activity = state.activity;
    await sleep(Math.round(stepMs * 0.6));

    const activeIndex = state.agents.findIndex((agent) => agent.id === activeId);
    const nextAgent = steps
      .slice(index + 1)
      .map((futureStep) => parseStepMeta(squadDir, futureStep).agent)
      .find(Boolean);

    const deliveringState = clone(state);
    deliveringState.updatedAt = new Date().toISOString();
    if (activeIndex >= 0) {
      deliveringState.agents[activeIndex].status = "delivering";
      deliveringState.agents[activeIndex].deliverTo = nextAgent || null;
      appendActivity(
        deliveringState,
        code,
        eventCounter,
        "agent",
        `${deliveringState.agents[activeIndex].name} delivering`,
        nextAgent ? `Delivering output to ${nextAgent}.` : "Delivering final output.",
        deliveringState.updatedAt
      );
    }
    deliveringState.handoff = nextAgent
      ? {
          from: activeId,
          to: nextAgent,
          message: `Completed ${label}`,
          completedAt: new Date().toISOString(),
        }
      : null;
    if (deliveringState.handoff) {
      appendActivity(
        deliveringState,
        code,
        eventCounter,
        "handoff",
        `${deliveringState.handoff.from} -> ${deliveringState.handoff.to}`,
        deliveringState.handoff.message,
        deliveringState.handoff.completedAt
      );
    }
    writeState(squadDir, deliveringState);
    initialState.status = deliveringState.status;
    initialState.step.current = deliveringState.step.current;
    initialState.step.label = deliveringState.step.label;
    initialState.updatedAt = deliveringState.updatedAt;
    initialState.activity = deliveringState.activity;
    await sleep(Math.round(stepMs * 0.4));

    initialState.agents = deliveringState.agents.map((agent) => ({
      ...agent,
      status: agent.id === activeId ? "done" : agent.status === "done" ? "done" : "idle",
      deliverTo: null,
    }));
    initialState.handoff = null;
  }

  const completed = clone(initialState);
  completed.status = "completed";
  completed.step.current = steps.length;
  completed.step.label = "complete";
  completed.updatedAt = new Date().toISOString();
  appendActivity(
    completed,
    code,
    eventCounter,
    "status",
    "Squad completed",
    "All steps finished successfully.",
    completed.updatedAt
  );
  writeState(squadDir, completed);
  console.log(`Completed squad simulation: ${code}`);
}

async function main() {
  const squadName = process.argv[2];
  if (!squadName) {
    console.error("Usage: npm run squad:run -- <squad-name> [step-ms] [checkpoint-ms]");
    process.exit(1);
  }

  const stepMs = Number(process.argv[3] || 1800);
  const checkpointMs = Number(process.argv[4] || 2400);
  const squadsRoot = path.resolve(process.cwd(), "squads");
  const squadDir = path.join(squadsRoot, squadName);
  const code = readSquadCode(squadDir);
  const agents = parsePartyCsv(squadDir);
  const steps = parsePipelineSteps(squadDir);

  if (agents.some(isChiefAgent)) {
    if (code === "instagram-hot-news-carousel") {
      await runInstagramOrchestratedSimulation({
        squadDir,
        code,
        agents,
        steps,
        stepMs,
        checkpointMs,
      });
      return;
    }
    await runOrchestratedSimulation({
      squadDir,
      code,
      agents,
      steps,
      stepMs,
      checkpointMs,
    });
    return;
  }

  await runLinearSimulation({
    squadDir,
    code,
    agents,
    steps,
    stepMs,
    checkpointMs,
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
