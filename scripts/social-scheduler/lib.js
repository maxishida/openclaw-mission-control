#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const SCHEDULER_DIR = path.resolve(ROOT_DIR, ".context", "social-scheduler");
const JOBS_DIR = path.resolve(SCHEDULER_DIR, "jobs");
const RESULTS_DIR = path.resolve(SCHEDULER_DIR, "results");
const LOGS_DIR = path.resolve(SCHEDULER_DIR, "logs");
const LOCK_FILE = path.resolve(SCHEDULER_DIR, "worker.lock");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureSchedulerDirs() {
  ensureDir(SCHEDULER_DIR);
  ensureDir(JOBS_DIR);
  ensureDir(RESULTS_DIR);
  ensureDir(LOGS_DIR);
}

function sanitizeSegment(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function createJobId(platform, label = "") {
  const safePlatform = sanitizeSegment(platform) || "social";
  const safeLabel = sanitizeSegment(label) || "job";
  return `${timestampSlug()}-${safePlatform}-${safeLabel}`;
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeDateString(value) {
  const input = String(value || "").trim();
  if (!input) {
    throw new Error("publish_at/schedule_at is required");
  }
  const isoCandidate = /z$/i.test(input) || /[+-]\d{2}:\d{2}$/.test(input)
    ? input
    : `${input}Z`;
  const parsed = new Date(isoCandidate);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid datetime: ${value}`);
  }
  return parsed.toISOString();
}

function createScheduledJob({ platform, scheduleAt, command, args, cwd = ROOT_DIR, metadata = {} }) {
  ensureSchedulerDirs();
  const normalizedScheduleAt = normalizeDateString(scheduleAt);
  const jobId = createJobId(platform, metadata.title || metadata.id || metadata.mode || "publish");
  const job = {
    id: jobId,
    platform,
    status: "scheduled",
    schedule_at: normalizedScheduleAt,
    created_at: new Date().toISOString(),
    cwd: path.resolve(cwd),
    command,
    args,
    metadata,
    attempts: [],
  };
  const jobFile = path.resolve(JOBS_DIR, `${jobId}.json`);
  writeJson(jobFile, job);
  return { job, jobFile };
}

function listJobFiles() {
  ensureSchedulerDirs();
  return fs.readdirSync(JOBS_DIR)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => path.resolve(JOBS_DIR, entry))
    .sort();
}

function readJob(jobFile) {
  const job = readJson(jobFile, null);
  if (!job || typeof job !== "object") {
    throw new Error(`Invalid scheduled job file: ${jobFile}`);
  }
  return job;
}

function writeJob(jobFile, job) {
  writeJson(jobFile, job);
}

function appendLog(jobId, content) {
  ensureSchedulerDirs();
  const logFile = path.resolve(LOGS_DIR, `${jobId}.log`);
  fs.appendFileSync(logFile, content, "utf8");
  return logFile;
}

function acquireLock() {
  ensureSchedulerDirs();
  try {
    const fd = fs.openSync(LOCK_FILE, "wx");
    fs.writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch {
    // ignore cleanup failure
  }
}

function isDue(job, now = new Date()) {
  return new Date(job.schedule_at).getTime() <= now.getTime();
}

function spawnAndCapture(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell: false,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

module.exports = {
  JOBS_DIR,
  LOCK_FILE,
  LOGS_DIR,
  RESULTS_DIR,
  ROOT_DIR,
  SCHEDULER_DIR,
  acquireLock,
  appendLog,
  createScheduledJob,
  ensureSchedulerDirs,
  isDue,
  listJobFiles,
  normalizeDateString,
  readJob,
  readJson,
  releaseLock,
  spawnAndCapture,
  writeJob,
  writeJson,
};
