#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { loadEnvFiles } = require("./shared/load-env.cjs");

const REPO_ROOT = process.cwd();
const OPS_ROOT = path.join(REPO_ROOT, ".context", "ops-runs");
const envFiles = [path.resolve(REPO_ROOT, ".env.local"), path.resolve(REPO_ROOT, ".env")];
loadEnvFiles(envFiles);

const contract = {
  version: "1.0.0",
  description: "Guarded automation lane for Prompthub hybrid squad operations.",
  modes: ["simulate", "dry-run", "live"],
  write_targets: [".context/**", "output/**", "squads/*/output/**", "squads/*/state.json"],
  read_targets: [".env", ".env.local", ".context/**", "output/**", "squads/**", "ai/ref/**"],
  actions: {
    simulate: {
      command: "node scripts/run-squad-virtual-office.js <squad> [step-ms] [checkpoint-ms]",
      outputs: ["squads/<slug>/state.json"],
    },
    reset: {
      command: "node scripts/reset-squad-state.js [squad]",
      outputs: ["squads/<slug>/state.json"],
    },
    "linkedin-publish": {
      command: "node skills/linkedin-publisher/scripts/publish.js --text-file <path> [--images <csv>] [--dry-run]",
      outputs: [".context/**/publish-result.txt", "squads/<slug>/output/**/publish-result-live.txt"],
    },
    "instagram-workflow": {
      command: "node scripts/instagram-carousel/run-workflow.js [workflow flags]",
      outputs: [".context/instagram-orchestrator/**", ".context/instagram-infographic/**"],
    },
    "instagram-publish": {
      command: "node skills/instagram-publisher/scripts/publish.js --images <csv> [--caption-file <path>] [--dry-run]",
      outputs: [".context/instagram-publisher/**", ".context/social-scheduler/**"],
    },
    "youtube-ingest": {
      command: "node scripts/youtube-clips/intake.js <youtube-url> [--squad <slug>]",
      outputs: ["squads/youtube-viral-clips/input/**", "squads/youtube-viral-clips/output/**"],
    },
    "youtube-auto-plan": {
      command: "node scripts/youtube-clips/auto-plan.js [--squad <slug>]",
      outputs: ["squads/youtube-viral-clips/output/**"],
    },
    "youtube-render": {
      command: "node scripts/youtube-clips/render-clips.js [--squad <slug>]",
      outputs: ["squads/youtube-viral-clips/output/**"],
    },
    "youtube-prepare-publish": {
      command: "node scripts/youtube-clips/build-publish-batch.js [--squad <slug>]",
      outputs: ["squads/youtube-viral-clips/output/**"],
    },
    "youtube-publish": {
      command: "node skills/youtube-publisher/scripts/publish.js --spec-file <path> [--dry-run] [--output-file <path>]",
      outputs: ["squads/youtube-viral-clips/output/**", ".context/social-scheduler/**"],
    },
  },
};

const ACTIONS = {
  simulate: {
    description: "Run the squad state simulation for Virtual Office.",
    pathFlags: [],
    run(args) {
      const squad = requireValue(args, "squad");
      ensureSquadExists(squad);
      const commandArgs = ["scripts/run-squad-virtual-office.js", squad];
      if (args["step-ms"]) commandArgs.push(String(args["step-ms"]));
      if (args["checkpoint-ms"]) commandArgs.push(String(args["checkpoint-ms"]));
      return buildExecution("node", commandArgs, {
        action: "simulate",
        channel: inferChannelFromSquad(squad),
        mode: "simulate",
        squad,
        syncHints: [`squads/${squad}/state.json`],
      });
    },
  },
  reset: {
    description: "Reset one squad or all squads back to idle state.",
    pathFlags: [],
    run(args) {
      const squad = args.squad ? String(args.squad) : null;
      if (squad) ensureSquadExists(squad);
      const commandArgs = ["scripts/reset-squad-state.js"];
      if (squad) commandArgs.push(squad);
      return buildExecution("node", commandArgs, {
        action: "reset",
        channel: squad ? inferChannelFromSquad(squad) : "ops",
        mode: "simulate",
        squad,
        syncHints: squad ? [`squads/${squad}/state.json`] : [],
      });
    },
  },
  "linkedin-publish": {
    description: "Publish or dry-run a LinkedIn post/carousel through the squad publisher.",
    pathFlags: {
      "alt-texts-file": "read",
      "output-file": "write",
      "text-file": "read",
      images: "read-csv",
    },
    run(args) {
      const mode = normalizeMode(args.mode);
      const commandArgs = ["skills/linkedin-publisher/scripts/publish.js"];
      appendValue(commandArgs, "--text-file", requireValue(args, "text-file"));
      appendValue(commandArgs, "--images", args.images);
      appendValue(commandArgs, "--alt-texts-file", args["alt-texts-file"]);
      if (mode === "dry-run") commandArgs.push("--dry-run");
      return buildExecution("node", commandArgs, {
        action: "linkedin-publish",
        channel: "linkedin",
        mode,
        squad: args.squad ? String(args.squad) : "linkedin-ai-trends-posts",
        syncHints: collectSyncHints(args, ["text-file", "output-file"]),
      });
    },
  },
  "instagram-workflow": {
    description: "Run the orchestrated Instagram workflow from the copied Prompthub scripts.",
    pathFlags: {
      "output-dir": "write",
      "package-file": "read",
      "prompt-file": "read",
      "ref-dir": "read",
    },
    run(args) {
      const mode = normalizeMode(args.mode);
      const commandArgs = ["scripts/instagram-carousel/run-workflow.js"];
      appendValue(commandArgs, "--mode", args["workflow-mode"] || args["asset-mode"]);
      appendFlag(commandArgs, "--dry-run", mode === "dry-run" || Boolean(args["dry-run"]));
      appendFlag(commandArgs, "--compose-only", Boolean(args["compose-only"]));
      appendValue(commandArgs, "--package-file", args["package-file"]);
      appendValue(commandArgs, "--prompt-file", args["prompt-file"]);
      appendValue(commandArgs, "--output-dir", args["output-dir"]);
      appendValue(commandArgs, "--ref-dir", args["ref-dir"]);
      return buildExecution("node", commandArgs, {
        action: "instagram-workflow",
        channel: "instagram",
        mode,
        squad: args.squad ? String(args.squad) : "instagram-hot-news-carousel",
        syncHints: collectSyncHints(args, ["output-dir"]),
      });
    },
  },
  "instagram-publish": {
    description: "Dry-run or live publish an Instagram carousel package.",
    pathFlags: {
      "caption-file": "read",
      images: "read-csv",
    },
    run(args) {
      const mode = normalizeMode(args.mode);
      const commandArgs = ["skills/instagram-publisher/scripts/publish.js"];
      appendValue(commandArgs, "--images", requireValue(args, "images"));
      appendValue(commandArgs, "--caption", args.caption);
      appendValue(commandArgs, "--caption-file", args["caption-file"]);
      appendFlag(commandArgs, "--force", Boolean(args.force));
      appendValue(commandArgs, "--publish-at", args["publish-at"] || args["schedule-at"]);
      if (mode === "dry-run") commandArgs.push("--dry-run");
      return buildExecution("node", commandArgs, {
        action: "instagram-publish",
        channel: "instagram",
        mode,
        squad: args.squad ? String(args.squad) : "instagram-hot-news-carousel",
        syncHints: collectSyncHints(args, ["caption-file"]),
      });
    },
  },
  "youtube-ingest": {
    description: "Ingest a YouTube source into the squad workspace.",
    pathFlags: {},
    run(args) {
      const commandArgs = [
        "scripts/youtube-clips/intake.js",
        requireValue(args, "youtube-url"),
      ];
      appendValue(commandArgs, "--squad", args.squad || "youtube-viral-clips");
      appendFlag(commandArgs, "--skip-video", Boolean(args["skip-video"]));
      return buildExecution("node", commandArgs, {
        action: "youtube-ingest",
        channel: "youtube",
        mode: "live",
        squad: String(args.squad || "youtube-viral-clips"),
        syncHints: [path.join("squads", String(args.squad || "youtube-viral-clips"), "output")],
      });
    },
  },
  "youtube-auto-plan": {
    description: "Generate a YouTube clip plan from the ingested source.",
    pathFlags: {},
    run(args) {
      const commandArgs = ["scripts/youtube-clips/auto-plan.js"];
      appendValue(commandArgs, "--squad", args.squad || "youtube-viral-clips");
      appendValue(commandArgs, "--video-id", args["video-id"]);
      appendValue(commandArgs, "--max-clips", args["max-clips"]);
      return buildExecution("node", commandArgs, {
        action: "youtube-auto-plan",
        channel: "youtube",
        mode: "live",
        squad: String(args.squad || "youtube-viral-clips"),
        syncHints: [path.join("squads", String(args.squad || "youtube-viral-clips"), "output")],
      });
    },
  },
  "youtube-render": {
    description: "Render clips for a YouTube squad package.",
    pathFlags: {
      source: "read",
      spec: "read",
    },
    run(args) {
      const commandArgs = ["scripts/youtube-clips/render-clips.js"];
      appendValue(commandArgs, "--squad", args.squad || "youtube-viral-clips");
      appendValue(commandArgs, "--spec", args.spec);
      appendValue(commandArgs, "--source", args.source);
      return buildExecution("node", commandArgs, {
        action: "youtube-render",
        channel: "youtube",
        mode: "live",
        squad: String(args.squad || "youtube-viral-clips"),
        syncHints: [path.join("squads", String(args.squad || "youtube-viral-clips"), "output")],
      });
    },
  },
  "youtube-prepare-publish": {
    description: "Build the publish batch for a YouTube squad.",
    pathFlags: {
      manifest: "read",
      "render-result": "read",
    },
    run(args) {
      const commandArgs = ["scripts/youtube-clips/build-publish-batch.js"];
      appendValue(commandArgs, "--squad", args.squad || "youtube-viral-clips");
      appendValue(commandArgs, "--manifest", args.manifest);
      appendValue(commandArgs, "--render-result", args["render-result"]);
      return buildExecution("node", commandArgs, {
        action: "youtube-prepare-publish",
        channel: "youtube",
        mode: "live",
        squad: String(args.squad || "youtube-viral-clips"),
        syncHints: [path.join("squads", String(args.squad || "youtube-viral-clips"), "output")],
      });
    },
  },
  "youtube-publish": {
    description: "Dry-run or live publish the YouTube batch.",
    pathFlags: {
      "description-file": "read",
      "output-file": "write",
      "spec-file": "read",
      "video-file": "read",
    },
    run(args) {
      const mode = normalizeMode(args.mode);
      const commandArgs = ["skills/youtube-publisher/scripts/publish.js"];
      appendValue(commandArgs, "--spec-file", args["spec-file"]);
      appendValue(commandArgs, "--video-file", args["video-file"]);
      appendValue(commandArgs, "--title", args.title);
      appendValue(commandArgs, "--description", args.description);
      appendValue(commandArgs, "--description-file", args["description-file"]);
      appendValue(commandArgs, "--tags", args.tags);
      appendValue(commandArgs, "--privacy-status", args["privacy-status"]);
      appendValue(commandArgs, "--category-id", args["category-id"]);
      appendValue(commandArgs, "--playlist-id", args["playlist-id"]);
      appendValue(commandArgs, "--output-file", args["output-file"]);
      appendValue(commandArgs, "--schedule-at", args["schedule-at"] || args["publish-at"]);
      appendFlag(commandArgs, "--notify-subscribers", Boolean(args["notify-subscribers"]));
      appendFlag(commandArgs, "--made-for-kids", Boolean(args["made-for-kids"]));
      if (mode === "dry-run") commandArgs.push("--dry-run");
      return buildExecution("node", commandArgs, {
        action: "youtube-publish",
        channel: "youtube",
        mode,
        squad: String(args.squad || "youtube-viral-clips"),
        syncHints: collectSyncHints(args, ["spec-file", "output-file"]),
      });
    },
  },
};

function printUsage() {
  console.log(JSON.stringify(contract, null, 2));
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

function requireValue(args, key) {
  const value = args[key];
  if (!value) {
    throw new Error(`Missing required argument --${key}`);
  }
  return String(value);
}

function normalizeMode(rawMode) {
  const normalized = String(rawMode || "live").trim().toLowerCase();
  if (!["dry-run", "live", "simulate"].includes(normalized)) {
    throw new Error(`Unsupported mode: ${rawMode}`);
  }
  return normalized;
}

function appendValue(target, flag, value) {
  if (value === undefined || value === null || value === "") return;
  target.push(flag, String(value));
}

function appendFlag(target, flag, enabled) {
  if (enabled) target.push(flag);
}

function inferChannelFromSquad(squad) {
  if (String(squad).includes("linkedin")) return "linkedin";
  if (String(squad).includes("instagram")) return "instagram";
  if (String(squad).includes("youtube")) return "youtube";
  return "ops";
}

function ensureSquadExists(squad) {
  const squadDir = path.join(REPO_ROOT, "squads", String(squad));
  if (!fs.existsSync(squadDir)) {
    throw new Error(`Squad not found: ${squad}`);
  }
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isSafeReadTarget(absolutePath) {
  return [
    path.join(REPO_ROOT, ".context"),
    path.join(REPO_ROOT, "output"),
    path.join(REPO_ROOT, "squads"),
    path.join(REPO_ROOT, "ai", "ref"),
    path.join(REPO_ROOT, ".env"),
    path.join(REPO_ROOT, ".env.local"),
  ].some((root) => isInside(root, absolutePath));
}

function isSafeWriteTarget(absolutePath) {
  const contextRoot = path.join(REPO_ROOT, ".context");
  const outputRoot = path.join(REPO_ROOT, "output");
  const squadsRoot = path.join(REPO_ROOT, "squads");
  if (isInside(contextRoot, absolutePath) || isInside(outputRoot, absolutePath)) return true;
  if (!isInside(squadsRoot, absolutePath)) return false;
  const relative = path.relative(squadsRoot, absolutePath).replace(/\\/g, "/");
  if (/^[^/]+\/state\.json$/u.test(relative)) return true;
  if (/^[^/]+\/output(\/|$)/u.test(relative)) return true;
  return false;
}

function validatePathValue(key, value, mode) {
  const entries = mode.endsWith("-csv") ? splitCsv(value) : [String(value)];
  for (const entry of entries) {
    const absolutePath = path.resolve(REPO_ROOT, entry);
    if (mode.startsWith("read") && !isSafeReadTarget(absolutePath)) {
      throw new Error(`Unsafe read target for --${key}: ${entry}`);
    }
    if (mode.startsWith("read") && !fs.existsSync(absolutePath)) {
      throw new Error(`Missing input for --${key}: ${entry}`);
    }
    if (mode === "write" && !isSafeWriteTarget(absolutePath)) {
      throw new Error(`Unsafe write target for --${key}: ${entry}`);
    }
  }
}

function validatePaths(args, definition) {
  for (const [key, mode] of Object.entries(definition.pathFlags || {})) {
    if (args[key] === undefined || args[key] === null || args[key] === "") continue;
    validatePathValue(key, args[key], mode);
  }
}

function collectSyncHints(args, keys) {
  return keys
    .map((key) => args[key])
    .filter(Boolean)
    .map((value) => path.relative(REPO_ROOT, path.resolve(REPO_ROOT, String(value))).replace(/\\/g, "/"));
}

function buildExecution(command, commandArgs, meta) {
  return { command, commandArgs, meta };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeSlug(value) {
  return String(value || "run")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "run";
}

function makeRunPaths(meta) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = sanitizeSlug(meta.action);
  const runDir = path.join(OPS_ROOT, `${timestamp}-${slug}`);
  ensureDir(runDir);
  return {
    outputFile: path.join(runDir, "stdout.log"),
    resultFile: path.join(runDir, "result.json"),
    runDir,
  };
}

function execute(execution) {
  const runPaths = makeRunPaths(execution.meta);
  const result = spawnSync(execution.command, execution.commandArgs, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 1024 * 1024 * 64,
  });

  const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join("");
  fs.writeFileSync(runPaths.outputFile, combinedOutput, "utf8");

  const payload = {
    status: result.status === 0 ? "ok" : "error",
    action: execution.meta.action,
    channel: execution.meta.channel,
    mode: execution.meta.mode,
    squad: execution.meta.squad,
    command: `${execution.command} ${execution.commandArgs.join(" ")}`.trim(),
    artifact_paths: [
      path.relative(REPO_ROOT, runPaths.outputFile).replace(/\\/g, "/"),
    ],
    publish_result_path:
      execution.meta.syncHints.find((value) => /publish-result|publish-dry-run/i.test(value)) ||
      execution.meta.syncHints.find((value) => /publish/i.test(value)) ||
      null,
    sync_hint_paths: execution.meta.syncHints,
    logs_path: path.relative(REPO_ROOT, runPaths.outputFile).replace(/\\/g, "/"),
    allowed_env_files: envFiles
      .filter((filePath) => fs.existsSync(filePath))
      .map((filePath) => path.relative(REPO_ROOT, filePath).replace(/\\/g, "/")),
    allowed_write_targets: contract.write_targets,
    allowed_read_targets: contract.read_targets,
    exit_code: result.status,
  };
  fs.writeFileSync(runPaths.resultFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  if (combinedOutput) {
    process.stdout.write(combinedOutput);
  }

  console.log(
    JSON.stringify(
      {
        ...payload,
        result_path: path.relative(REPO_ROOT, runPaths.resultFile).replace(/\\/g, "/"),
      },
      null,
      2,
    ),
  );

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function main() {
  const args = parseArgs(process.argv);
  const action = args.action ? String(args.action) : null;
  if (!action || action === "help") {
    printUsage();
    return;
  }

  const definition = ACTIONS[action];
  if (!definition) {
    throw new Error(`Unsupported action: ${action}`);
  }

  validatePaths(args, definition);
  execute(definition.run(args));
}

try {
  main();
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}
