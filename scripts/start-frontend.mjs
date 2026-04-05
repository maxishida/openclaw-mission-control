import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const frontendDir = path.join(repoRoot, "frontend");
const nextBin = path.join(frontendDir, "node_modules", "next", "dist", "bin", "next");
const buildIdPath = path.join(frontendDir, ".next", "BUILD_ID");

if (!fs.existsSync(nextBin)) {
  console.error(
    "Next.js CLI not found at frontend/node_modules. Run `npm install` in `frontend` first."
  );
  process.exit(1);
}

if (!fs.existsSync(buildIdPath)) {
  console.error(
    "Next.js production build not found at frontend/.next. Run `npm --prefix frontend run build` or `npm run start` from the repo root first."
  );
  process.exit(1);
}

const child = spawn(process.execPath, [nextBin, "start", "--hostname", "0.0.0.0", "--port", "3000"], {
  cwd: frontendDir,
  stdio: "inherit",
  shell: false,
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", () => process.exit(1));
