import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const isWindows = process.platform === "win32";
const backendRoot = path.join(repoRoot, "backend");
const backendPython = isWindows
  ? path.join(backendRoot, ".venv", "Scripts", "python.exe")
  : path.join(backendRoot, ".venv", "bin", "python");

const children = new Map();
let shuttingDown = false;
let exitCode = 0;

function write(stream, prefix, message) {
  stream.write(`[${prefix}] ${message}\n`);
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

async function startDatastores() {
  write(process.stdout, "dev", "Starting db and redis...");
  const result = await run(
    "docker",
    ["compose", "-f", "compose.yml", "--env-file", ".env", "up", "-d", "db", "redis"],
    { shell: false }
  );

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
    throw new Error(`docker compose exited with code ${result.code}`);
  }

  process.stdout.write(
    "DATABASE_URL=postgresql+psycopg://postgres:postgres@127.0.0.1:5432/mission_control\n"
  );
  process.stdout.write("REDIS_URL=redis://127.0.0.1:6379/0\n");
}

async function seedControlPlane() {
  write(process.stdout, "dev", "Seeding local OpenSquad control plane...");
  const result = await run(backendPython, [path.join("scripts", "seed_opensquad_control_plane.py")], {
    cwd: backendRoot,
    shell: false,
  });

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
    throw new Error(`seed_opensquad_control_plane.py exited with code ${result.code}`);
  }
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
    write(process.stdout, "dev", `${name} exited with ${reason}`);
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
  write(process.stdout, "dev", "Stopping development services...");
  exitCode = 0;
  void shutdown();
});

process.on("SIGTERM", () => {
  exitCode = 0;
  void shutdown();
});

async function main() {
  await startDatastores();
  await seedControlPlane();

  spawnManaged(
    "seed-heartbeat",
    backendPython,
    [path.join("scripts", "keep_seed_agents_alive.py")],
    {
      cwd: backendRoot,
      shell: false,
    }
  );

  spawnManaged("backend", process.execPath, [path.join(repoRoot, "scripts", "dev-backend.mjs")], {
    shell: false,
  });
  spawnManaged(
    "frontend",
    process.execPath,
    [path.join(repoRoot, "scripts", "dev-frontend.mjs")],
    { shell: false }
  );
}

main().catch((error) => {
  write(process.stderr, "dev", error.message);
  process.exit(1);
});
