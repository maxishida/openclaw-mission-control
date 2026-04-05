import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const backendDir = path.join(repoRoot, "backend");
const isWindows = process.platform === "win32";
const isWsl =
  process.platform === "linux" &&
  (os.release().toLowerCase().includes("microsoft") ||
    process.env.WSL_DISTRO_NAME !== undefined);

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: options.stdio ?? "inherit",
      shell: options.shell ?? false,
      env: options.env ?? process.env,
    });

    child.on("error", (error) => resolve({ ok: false, code: 1, error }));
    child.on("exit", (code) => resolve({ ok: code === 0, code: code ?? 1 }));
  });
}

async function canRun(command, args) {
  const result = await run(command, args, { stdio: "ignore", shell: isWindows });
  return result.ok;
}

async function findLocalBackendCommand() {
  const unixVenvPython = path.join(backendDir, ".venv", "bin", "python");
  if (fs.existsSync(unixVenvPython)) {
    return {
      command: unixVenvPython,
      args: [path.join("scripts", "run_uvicorn_dev.py")],
      cwd: backendDir,
      shell: false,
    };
  }

  if (!isWsl) {
    const winVenvPython = path.join(backendDir, ".venv", "Scripts", "python.exe");
    if (fs.existsSync(winVenvPython)) {
      return {
        command: winVenvPython,
        args: [path.join("scripts", "run_uvicorn_dev.py")],
        cwd: backendDir,
        shell: false,
      };
    }
  }

  const uvRunners = isWindows ? ["py", "python", "python3"] : ["python3", "python"];
  for (const runner of uvRunners) {
    const hasUv = await canRun(runner, ["-m", "uv", "--version"]);
    if (!hasUv) {
      continue;
    }
    return {
      command: runner,
      args: [
        "-m",
        "uv",
        "--directory",
        "backend",
        "run",
        "python",
        "scripts/run_uvicorn_dev.py",
      ],
      cwd: repoRoot,
      shell: isWindows,
    };
  }

  return null;
}

async function main() {
  const localBackend = await findLocalBackendCommand();
  if (localBackend) {
    const child = spawn(localBackend.command, localBackend.args, {
      cwd: localBackend.cwd,
      stdio: "inherit",
      shell: localBackend.shell,
      env: process.env,
    });
    child.on("exit", (code) => process.exit(code ?? 1));
    child.on("error", () => process.exit(1));
    return;
  }

  console.error(
    "Local Python/uv not available in this shell. Falling back to Docker backend."
  );
  const dockerArgs = ["compose", "-f", "compose.yml", "--env-file", ".env", "up", "backend"];
  const child = spawn("docker", dockerArgs, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: isWindows,
    env: process.env,
  });
  child.on("exit", (code) => process.exit(code ?? 1));
  child.on("error", () => process.exit(1));
}

main();
