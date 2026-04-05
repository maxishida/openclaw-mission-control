#!/usr/bin/env node

const {
  parseArgs,
  orchestrateInfographic,
} = require("./infographic-workflow");

function main() {
  const args = parseArgs(process.argv);
  const result = orchestrateInfographic(args);

  console.log("✅ Instagram infographic orchestrated");
  console.log(`   output: ${result.outputDir}`);
  console.log(`   topic: ${result.packageData.topic}`);
  console.log(`   content_type: ${result.packageData.contentType}`);
  console.log(`   primary_reference: ${result.referenceSelection.primary.file}`);
  if (result.referenceSelection.secondary.length > 0) {
    console.log(`   secondary_reference: ${result.referenceSelection.secondary.map((entity) => entity.file).join(", ")}`);
  }
}

main();
