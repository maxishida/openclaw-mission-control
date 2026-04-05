#!/usr/bin/env node

const {
  parseArgs,
  runWorkflow,
} = require("./infographic-workflow");

async function main() {
  const args = parseArgs(process.argv);
  const result = await runWorkflow(args);

  console.log("✅ Instagram workflow executed");
  console.log(`   mode: ${result.mode}`);
  console.log(`   output: ${result.outputDir}`);
  if (result.manifestPath) {
    console.log(`   manifest: ${result.manifestPath}`);
  }
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
