const fs = require("node:fs");
const path = require("node:path");

function isChiefAgent(agent) {
  const slug = `${agent.id} ${agent.name}`.toLowerCase();
  return slug.includes("chief") || slug.includes("orchestrator");
}

function parsePartyCsv(squadDir) {
  const csvPath = path.join(squadDir, "squad-party.csv");
  const raw = fs.readFileSync(csvPath, "utf8").trim();
  const lines = raw.split(/\r?\n/).slice(1).filter(Boolean);
  return lines.map((line, index) => {
    const [id, displayName, icon] = line.split(",");
    return {
      id,
      name: displayName,
      icon,
      status: "idle",
      deliverTo: null,
      desk: {
        col: (index % 3) + 1,
        row: Math.floor(index / 3) + 1,
      },
    };
  });
}

function parsePipelineSteps(squadDir) {
  const pipelinePath = path.join(squadDir, "pipeline", "pipeline.yaml");
  const raw = fs.readFileSync(pipelinePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const steps = [];
  let inSteps = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "steps:") {
      inSteps = true;
      continue;
    }
    if (inSteps && /^[a-zA-Z_]+:/.test(trimmed)) break;
    if (inSteps && trimmed.startsWith("- step-")) {
      steps.push(trimmed.replace(/^- /, "").trim());
    }
  }

  return steps;
}

function parseStepMeta(squadDir, stepFile) {
  const stepPath = path.join(squadDir, "pipeline", "steps", stepFile);
  const raw = fs.readFileSync(stepPath, "utf8");
  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = frontmatterMatch ? frontmatterMatch[1] : "";
  const typeMatch = frontmatter.match(/^type:\s*(.+)$/m);
  const agentMatch = frontmatter.match(/^agent:\s*(.+)$/m);
  return {
    type: typeMatch ? typeMatch[1].trim() : "agent",
    agent: agentMatch ? agentMatch[1].trim() : null,
  };
}

function statePathFor(squadDir) {
  return path.join(squadDir, "state.json");
}

function buildQualityChecklist() {
  return [
    { id: "hook-first-3s", label: "Hook forte nos primeiros 3 segundos", passed: false },
    { id: "captions-synced", label: "Legenda sincronizada", passed: false },
    { id: "keyword-title", label: "Titulo com palavra-chave", passed: false },
    { id: "relevant-hashtags", label: "Hashtags relevantes", passed: false },
    { id: "short-duration", label: "Duracao otimizada para shorts", passed: false },
  ];
}

function buildIdleState(squadCode, agents, totalSteps) {
  const baseState = {
    squad: squadCode,
    status: "idle",
    step: {
      current: 0,
      total: totalSteps,
      label: "",
    },
    agents,
    handoff: null,
    startedAt: null,
    updatedAt: new Date().toISOString(),
  };

  const chiefAgent = agents.find(isChiefAgent);
  if (!chiefAgent) {
    return baseState;
  }

  return {
    ...baseState,
    pipeline: {
      phase: "IDLE",
      loop: 0,
      retries: 0,
      maxRetries: 3,
      validationStatus: "pending",
      currentAgentId: null,
      lastCompletedPhase: null,
    },
    orchestrator: {
      agentId: chiefAgent.id,
      status: "idle",
      mode: "control-loop",
      lastDecision: "Waiting for the first video job.",
      decisionReason: "No active input has been scheduled yet.",
      nextAction: "Trigger Intake Analyst when the squad starts.",
      updatedAt: new Date().toISOString(),
    },
    job: {
      id: `${squadCode}-job-001`,
      status: "idle",
      source: "",
      format: "youtube_shorts",
      context: {
        topic: "",
        audience: "",
        platform: "youtube_shorts",
        language: "pt-BR",
      },
      language: "unknown",
      durationSeconds: null,
      clips: [],
      title: "",
      description: "",
      hashtags: [],
      score: null,
      attempts: 0,
      priority: "normal",
      published_url: null,
      outputs: {},
    },
    qualityGate: {
      status: "pending",
      thresholdPublish: 85,
      minimumScore: 80,
      average: null,
      scores: {
        hook: null,
        retention: null,
        seo: null,
        clarity: null,
        impact: null,
      },
      failedChecks: [],
      checklist: buildQualityChecklist(),
    },
    monitoring: {
      status: "idle",
      views: null,
      ctr: null,
      retention: null,
      lastCheckAt: null,
      nextAction: "Awaiting publication before monitoring starts.",
      learning: "No winning pattern recorded yet.",
      optimizationStatus: "idle",
    },
  };
}

function writeState(squadDir, state) {
  fs.writeFileSync(statePathFor(squadDir), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function readSquadCode(squadDir) {
  const squadYaml = fs.readFileSync(path.join(squadDir, "squad.yaml"), "utf8");
  const match = squadYaml.match(/^code:\s*(.+)$/m);
  return match ? match[1].trim() : path.basename(squadDir);
}

module.exports = {
  parsePartyCsv,
  parsePipelineSteps,
  parseStepMeta,
  statePathFor,
  buildIdleState,
  writeState,
  readSquadCode,
  isChiefAgent,
};
