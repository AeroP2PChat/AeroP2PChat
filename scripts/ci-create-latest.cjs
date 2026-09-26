const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const artifactsDir = process.argv[2]
  ? path.resolve(root, process.argv[2])
  : path.join(root, "artifacts");
const minimumVersionArg = process.argv
  .slice(3)
  .find((arg) => arg.startsWith("--minimum-version="));
const minimumVersion = minimumVersionArg
  ? minimumVersionArg.slice("--minimum-version=".length)
  : "";
const config = JSON.parse(
  fs.readFileSync(path.join(root, "config.json"), "utf8"),
);

function yamlQuote(value) {
  return JSON.stringify(String(value));
}

function releaseUrl(tag, assetName) {
  return `https://github.com/${
    config.repo
  }/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(
    assetName,
  )}`;
}

function main() {
  const manifestPath = path.join(artifactsDir, "update_manifest_windows.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Windows manifest not found: ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const version = manifest.version;
  if (!version) throw new Error("No version in Windows manifest.");
  if (minimumVersion && !/^\d+\.\d+\.\d+$/.test(minimumVersion)) {
    throw new Error("minimum version must be x.y.z or empty.");
  }

  const tag = `v${version}`;
  const asset = manifest.asset;
  if (!asset) throw new Error("No asset in Windows manifest.");
  const legacyPath = path.join(artifactsDir, config.release.windowsLegacyUpdateAsset);
  if (!fs.existsSync(legacyPath)) {
    throw new Error(`Legacy Windows update bridge not found: ${legacyPath}`);
  }
  const legacyData = fs.readFileSync(legacyPath);
  const legacy = {
    name: config.release.windowsLegacyUpdateAsset,
    size: legacyData.length,
    sha256: require("node:crypto").createHash("sha256").update(legacyData).digest("hex"),
    sha512: require("node:crypto").createHash("sha512").update(legacyData).digest("base64"),
  };
  const lines = [
    `version: ${yamlQuote(version)}`,
    ...(minimumVersion
      ? [`minimumVersion: ${yamlQuote(minimumVersion)}`]
      : []),
    `releaseDate: ${yamlQuote(new Date().toISOString())}`,
    `repo: ${yamlQuote(config.repo)}`,
    `path: ${yamlQuote(asset.name)}`,
    `url: ${yamlQuote(releaseUrl(tag, asset.name))}`,
    `sha256: ${yamlQuote(asset.sha256)}`,
    `sha512: ${yamlQuote(asset.sha512)}`,
    `size: ${asset.size}`,
    // Compatibility bridge for released clients that still expect the old
    // updater filename. This file is an identical copy of the normal setup.
    `onlineInstallerUrl: ${yamlQuote(releaseUrl(tag, legacy.name))}`,
    `onlineInstallerSha256: ${yamlQuote(legacy.sha256)}`,
    `onlineInstallerSha512: ${yamlQuote(legacy.sha512)}`,
    `onlineInstallerSize: ${legacy.size}`,
    `productName: ${yamlQuote(config.app.name)}`,
    "",
  ];

  fs.writeFileSync(
    path.join(artifactsDir, "latest.yml"),
    lines.join("\n"),
    "utf8",
  );
}

main();
