const fs = require("node:fs");
const path = require("node:path");
const {
  parsePartyCsv,
  parsePipelineSteps,
  buildIdleState,
  writeState,
  readSquadCode,
} = require("./squad-state-lib");

function main() {
  const squadArg = process.argv[2];
  const squadsRoot = path.resolve(process.cwd(), "squads");
  const squadDirs = squadArg
    ? [path.join(squadsRoot, squadArg)]
    : fs.readdirSync(squadsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => path.join(squadsRoot, entry.name));

  for (const squadDir of squadDirs) {
    if (!fs.existsSync(path.join(squadDir, "squad-party.csv"))) continue;
    const code = readSquadCode(squadDir);
    const agents = parsePartyCsv(squadDir);
    const steps = parsePipelineSteps(squadDir);
    writeState(squadDir, buildIdleState(code, agents, steps.length));
    console.log(`Reset state: ${code}`);
  }
}

main();
