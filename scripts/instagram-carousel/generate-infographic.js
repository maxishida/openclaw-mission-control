#!/usr/bin/env node

const {
  parseArgs,
  generateInfographic,
} = require("./infographic-workflow");

async function main() {
  const args = parseArgs(process.argv);
  const result = await generateInfographic(args);

  console.log("✅ Instagram infographic processed");
  console.log(`   manifest: ${result.manifestPath}`);
  console.log(`   status: ${result.manifest.status}`);
  console.log(`   size: ${result.manifest.size.width}x${result.manifest.size.height}`);
  if (result.manifest.files?.finalPng) {
    console.log(`   final_png: ${result.manifest.files.finalPng}`);
  }
  if (result.manifest.files?.finalJpg) {
    console.log(`   final_jpg: ${result.manifest.files.finalJpg}`);
  }
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
