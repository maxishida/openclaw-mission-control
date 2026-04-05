#!/usr/bin/env node

const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const runnerPath = path.resolve(repoRoot, "scripts", "social-scheduler", "run-due.js");
const taskName = "PromptHubSocialScheduler";
const taskCommand = `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Set-Location '${repoRoot.replace(/'/g, "''")}'; node '${runnerPath.replace(/'/g, "''")}'"`;

function main() {
  execFileSync("schtasks", [
    "/Create",
    "/TN",
    taskName,
    "/SC",
    "MINUTE",
    "/MO",
    "15",
    "/TR",
    taskCommand,
    "/F",
  ], {
    stdio: "inherit",
    windowsHide: true,
  });

  console.log(`Installed Windows task: ${taskName}`);
}

main();
