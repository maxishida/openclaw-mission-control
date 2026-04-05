#!/usr/bin/env node

const path = require("node:path");
const {
  RESULTS_DIR,
  acquireLock,
  appendLog,
  ensureSchedulerDirs,
  isDue,
  listJobFiles,
  readJob,
  releaseLock,
  spawnAndCapture,
  writeJob,
  writeJson,
} = require("./lib.js");

async function executeJob(jobFile, job) {
  const now = new Date().toISOString();
  const attemptNumber = (job.attempts?.length || 0) + 1;
  const attempt = {
    started_at: now,
    command: job.command,
    args: job.args,
  };

  job.status = "running";
  job.last_started_at = now;
  job.attempts = [...(job.attempts || []), attempt];
  writeJob(jobFile, job);

  appendLog(job.id, `\n[${now}] starting attempt ${attemptNumber}\n`);
  const result = await spawnAndCapture(job.command, job.args, job.cwd);
  const finishedAt = new Date().toISOString();
  attempt.finished_at = finishedAt;
  attempt.exit_code = result.code;
  attempt.stdout = result.stdout;
  attempt.stderr = result.stderr;

  appendLog(
    job.id,
    `[${finishedAt}] exit=${result.code}\nSTDOUT:\n${result.stdout || "(empty)"}\nSTDERR:\n${result.stderr || "(empty)"}\n`
  );

  if (result.code === 0) {
    job.status = "published";
    job.completed_at = finishedAt;
    job.result_file = path.resolve(RESULTS_DIR, `${job.id}.json`);
    writeJson(job.result_file, {
      job_id: job.id,
      platform: job.platform,
      status: "published",
      completed_at: finishedAt,
      command: job.command,
      args: job.args,
      stdout: result.stdout,
      stderr: result.stderr,
      metadata: job.metadata,
    });
  } else {
    job.status = "failed";
    job.failed_at = finishedAt;
    job.last_error = (result.stderr || result.stdout || `exit ${result.code}`).trim();
  }

  writeJob(jobFile, job);
  return result.code === 0;
}

async function main() {
  ensureSchedulerDirs();

  if (!acquireLock()) {
    console.log("Scheduler worker already running. Exiting.");
    return;
  }

  try {
    const jobFiles = listJobFiles();
    const now = new Date();
    let processed = 0;
    let succeeded = 0;

    for (const jobFile of jobFiles) {
      const job = readJob(jobFile);
      if (job.status !== "scheduled") continue;
      if (!isDue(job, now)) continue;
      processed += 1;
      if (await executeJob(jobFile, job)) {
        succeeded += 1;
      }
    }

    console.log(`Scheduler run finished. processed=${processed} succeeded=${succeeded}`);
  } finally {
    releaseLock();
  }
}

main().catch((error) => {
  releaseLock();
  console.error(`Scheduler failed: ${error.message}`);
  process.exit(1);
});
