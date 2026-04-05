const {
  ensureDir,
  ensureBinary,
  getLocalYtDlpPath,
  relativeToRepo,
  resolveToolsDir,
} = require("./lib");

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/youtube-clips/setup-tools.js [--force]",
      "",
      "Downloads a local yt-dlp binary into .context/tools/youtube-clips/",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = new Set(argv);
  return {
    help: args.has("--help") || args.has("-h"),
    force: args.has("--force"),
  };
}

function resolveDownloadAssetName() {
  if (process.platform === "win32") {
    return "yt-dlp.exe";
  }

  if (process.platform === "darwin") {
    return process.arch === "x64" ? "yt-dlp_macos_legacy" : "yt-dlp_macos";
  }

  if (process.platform === "linux") {
    if (process.arch === "arm64") return "yt-dlp_linux_aarch64";
    if (process.arch === "arm") return "yt-dlp_linux_armv7l";
    return "yt-dlp_linux";
  }

  return process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
}

async function downloadStandaloneBinary(targetPath) {
  const assetName = resolveDownloadAssetName();
  const downloadUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${assetName}`;
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Falha ao baixar ${assetName}: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  require("node:fs").writeFileSync(targetPath, buffer);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const toolsDir = resolveToolsDir();
  const ytDlpPath = getLocalYtDlpPath();
  ensureDir(toolsDir);

  if (options.force) {
    console.log(`Baixando nova copia do yt-dlp em ${relativeToRepo(ytDlpPath)}...`);
  } else {
    try {
      ensureBinary(ytDlpPath, "Rode `npm run youtube:setup-tools -- --force` para baixar novamente.");
      console.log(`yt-dlp ja esta pronto em ${relativeToRepo(ytDlpPath)}`);
      return;
    } catch {
      console.log(`Baixando yt-dlp em ${relativeToRepo(ytDlpPath)}...`);
    }
  }

  await downloadStandaloneBinary(ytDlpPath);
  ensureBinary(ytDlpPath, "Falha ao validar o binario baixado.");

  console.log(`yt-dlp instalado com sucesso em ${relativeToRepo(ytDlpPath)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
