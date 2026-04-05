import { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const isWindows = process.platform === "win32";
const backendRoot = path.join(repoRoot, "backend");
const frontendRoot = path.join(repoRoot, "frontend");
const backendPython = isWindows
  ? path.join(backendRoot, ".venv", "Scripts", "python.exe")
  : path.join(backendRoot, ".venv", "bin", "python");
const npmCommand = isWindows ? "npm.cmd" : "npm";
const frontendBuildId = path.join(frontendRoot, ".next", "BUILD_ID");
const require = createRequire(import.meta.url);
const { loadEnvFiles } = require("./shared/load-env.cjs");
loadEnvFiles([path.join(repoRoot, ".env.local"), path.join(repoRoot, ".env")]);

const children = new Map();
let shuttingDown = false;
let exitCode = 0;

function write(stream, prefix, message) {
  stream.write(`[${prefix}] ${message}\n`);
}

function requestUrl(url, options = {}) {
  return new Promise((resolve) => {
    const client = url.startsWith("https://") ? https : http;
    const request = client.get(
      url,
      {
        headers: options.headers ?? {},
      },
      (response) => {
        response.resume();
        resolve({
          ok: (response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 500,
          statusCode: response.statusCode ?? 500,
        });
      }
    );
    request.on("error", () => resolve({ ok: false, statusCode: 0 }));
    request.setTimeout(3000, () => {
      request.destroy();
      resolve({ ok: false, statusCode: 0 });
    });
  });
}

function pipeLines(name, stream, target) {
  if (!stream) {
    return;
  }
  const reader = createInterface({ input: stream });
  reader.on("line", (line) => write(target, name, line));
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      shell: options.shell ?? false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => resolve({ ok: false, code: 1, stdout, stderr, error }));
    child.on("exit", (code) =>
      resolve({
        ok: code === 0,
        code: code ?? 1,
        stdout,
        stderr,
      })
    );
  });
}

async function runAndReport(prefix, command, args, options = {}) {
  const result = await run(command, args, options);

  if (result.stdout.trim()) {
    process.stdout.write(result.stdout);
    if (!result.stdout.endsWith("\n")) {
      process.stdout.write("\n");
    }
  }
  if (result.stderr.trim()) {
    process.stderr.write(result.stderr);
    if (!result.stderr.endsWith("\n")) {
      process.stderr.write("\n");
    }
  }
  if (!result.ok) {
    throw new Error(`${prefix} exited with code ${result.code}`);
  }
}

async function startDatastores() {
  write(process.stdout, "start", "Starting db and redis...");
  await runAndReport(
    "docker compose",
    "docker",
    ["compose", "-f", "compose.yml", "--env-file", ".env", "up", "-d", "db", "redis"],
    { shell: false }
  );

  process.stdout.write(
    "DATABASE_URL=postgresql+psycopg://postgres:postgres@127.0.0.1:5432/mission_control\n"
  );
  process.stdout.write("REDIS_URL=redis://127.0.0.1:6379/0\n");
}

async function startDockerBackend() {
  write(process.stdout, "start", "Starting backend container...");
  await runAndReport(
    "docker compose backend",
    "docker",
    ["compose", "-f", "compose.yml", "--env-file", ".env", "up", "-d", "backend"],
    { shell: false }
  );
}

async function ensureFrontendBuild() {
  if (fs.existsSync(frontendBuildId)) {
    return;
  }

  write(process.stdout, "start", "No frontend build found. Building frontend...");
  await runAndReport("frontend build", npmCommand, ["run", "build"], {
    cwd: frontendRoot,
    shell: false,
  });
}

async function seedControlPlane() {
  if (!fs.existsSync(backendPython)) {
    write(
      process.stdout,
      "start",
      "Backend virtualenv not found. Skipping local OpenSquad seed bootstrap."
    );
    return;
  }

  write(process.stdout, "start", "Seeding local OpenSquad control plane...");
  await runAndReport(
    "seed_opensquad_control_plane.py",
    backendPython,
    [path.join("scripts", "seed_opensquad_control_plane.py")],
    {
      cwd: backendRoot,
      shell: false,
    }
  );
}

async function detectReusableServices() {
  const backend = await requestUrl("http://127.0.0.1:8000/healthz");
  const frontend = await requestUrl("http://127.0.0.1:3000");
  const backendAuthProbe = await probeBackendAuth();
  return {
    backendReady: backend.ok && backendAuthProbe.ok,
    backendAuthProbe,
    frontendReady: frontend.ok,
  };
}

async function probeBackendAuth() {
  const authMode = (process.env.AUTH_MODE ?? "").trim().toLowerCase();
  const localToken = (process.env.LOCAL_AUTH_TOKEN ?? "").trim();

  if (authMode !== "local" || !localToken) {
    return requestUrl("http://127.0.0.1:8000/openapi.json");
  }

  return requestUrl("http://127.0.0.1:8000/api/v1/users/me", {
    headers: {
      Authorization: `Bearer ${localToken}`,
    },
  });
}

async function findListeningPid(port) {
  if (isWindows) {
    const result = await run(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `$listener = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess; if ($listener) { Write-Output $listener }`,
      ],
      { shell: false }
    );
    const pidText = result.stdout.trim();
    const pid = Number.parseInt(pidText, 10);
    return Number.isFinite(pid) ? pid : null;
  }

  const result = await run("bash", ["-lc", `lsof -ti tcp:${port} -sTCP:LISTEN | head -n 1`], {
    shell: false,
  });
  const pidText = result.stdout.trim();
  const pid = Number.parseInt(pidText, 10);
  return Number.isFinite(pid) ? pid : null;
}

async function stopListener(port) {
  const pid = await findListeningPid(port);
  if (!pid) {
    return false;
  }

  if (isWindows) {
    await run("taskkill", ["/PID", String(pid), "/T", "/F"], { shell: false });
  } else {
    await run("kill", ["-TERM", String(pid)], { shell: false });
  }
  return true;
}

async function waitFor(check, attempts = 30, delayMs = 1000) {
  for (let index = 0; index < attempts; index += 1) {
    const result = await check();
    if (result.ok) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return { ok: false, statusCode: 0 };
}

function spawnManaged(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    shell: options.shell ?? false,
    stdio: ["inherit", "pipe", "pipe"],
    detached: !isWindows,
  });

  children.set(name, child);
  pipeLines(name, child.stdout, process.stdout);
  pipeLines(name, child.stderr, process.stderr);

  child.on("error", (error) => {
    write(process.stderr, name, `failed to start: ${error.message}`);
    if (!shuttingDown) {
      exitCode = 1;
      void shutdown();
    }
  });

  child.on("exit", (code, signal) => {
    children.delete(name);
    if (shuttingDown) {
      return;
    }

    const reason = signal ? `signal ${signal}` : `code ${code ?? 1}`;
    write(process.stdout, "start", `${name} exited with ${reason}`);
    if (options.required === false) {
      return;
    }
    if ((code ?? 0) !== 0) {
      exitCode = code ?? 1;
    }
    void shutdown();
  });

  return child;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  if (isWindows) {
    await run("taskkill", ["/PID", String(child.pid), "/T", "/F"], { shell: false });
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

async function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  const liveChildren = [...children.values()];
  await Promise.all(liveChildren.map((child) => stopChild(child)));
  process.exit(exitCode);
}

process.on("SIGINT", () => {
  write(process.stdout, "start", "Stopping services...");
  exitCode = 0;
  void shutdown();
});

process.on("SIGTERM", () => {
  exitCode = 0;
  void shutdown();
});

async function main() {
  await startDatastores();
  await ensureFrontendBuild();
  await seedControlPlane();
  const reusable = await detectReusableServices();

  if (fs.existsSync(backendPython)) {
    spawnManaged(
      "seed-heartbeat",
      backendPython,
      [path.join("scripts", "keep_seed_agents_alive.py")],
      {
        cwd: backendRoot,
        required: false,
        shell: false,
      }
    );
  }

  if (!reusable.backendReady && reusable.backendAuthProbe.statusCode !== 0) {
    write(
      process.stdout,
      "start",
      `Existing backend on :8000 failed auth/db probe with HTTP ${reusable.backendAuthProbe.statusCode}. Restarting it.`
    );
    await stopListener(8000);
  }

  if (reusable.backendReady) {
    write(process.stdout, "start", "Backend already responding on :8000, reusing existing process.");
  } else if (isWindows) {
    await stopListener(8000);
    await startDockerBackend();
    const dockerBackend = await waitFor(() => probeBackendAuth());
    if (!dockerBackend.ok) {
      throw new Error("Backend container did not become ready on http://127.0.0.1:8000.");
    }
  } else {
    spawnManaged("backend", process.execPath, [path.join(repoRoot, "scripts", "start-backend.mjs")], {
      shell: false,
    });
  }

  if (reusable.frontendReady) {
    write(process.stdout, "start", "Frontend already responding on :3000, reusing existing process.");
  } else {
    spawnManaged(
      "frontend",
      process.execPath,
      [path.join(repoRoot, "scripts", "start-frontend.mjs")],
      { shell: false }
    );
  }

  write(process.stdout, "start", "Frontend: http://localhost:3000");
  write(process.stdout, "start", "Backend: http://127.0.0.1:8000");
  write(process.stdout, "start", "Backend docs: http://127.0.0.1:8000/docs");
}

main().catch((error) => {
  write(process.stderr, "start", error.message);
  process.exit(1);
});
