import { existsSync, readFileSync } from "node:fs";

function stripWrappingQuotes(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};

  const raw = readFileSync(filePath, "utf8");
  const entries = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    if (!key) continue;

    const value = stripWrappingQuotes(trimmed.slice(equalsIndex + 1).trim());
    entries[key] = value;
  }

  return entries;
}

export function loadEnvFiles(filePaths) {
  for (const filePath of filePaths) {
    const parsed = parseEnvFile(filePath);
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}
