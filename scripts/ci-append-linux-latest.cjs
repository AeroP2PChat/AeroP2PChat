const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
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
  const latestYmlPath = process.argv[2]
    ? path.resolve(root, process.argv[2])
    : null;
  const buildDir = process.argv[3]
    ? path.resolve(root, process.argv[3])
    : path.join(root, "dist", "release");

  if (!latestYmlPath || !fs.existsSync(latestYmlPath)) {
    throw new Error(
      `latest.yml not found: ${
        latestYmlPath || "(no path given)"
      }. Usage: node ci-append-linux-latest.cjs <latest.yml> [build-dir]`,
    );
  }

  const manifestPath = path.join(buildDir, "update_manifest_linux.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Linux manifest not found: ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const version = manifest.version;
  if (!version) throw new Error("No version in Linux manifest.");

  const tag = `v${version}`;
  const asset = manifest.asset;
  if (!asset) throw new Error("No asset in Linux manifest.");

  const assets = Array.isArray(manifest.assets) ? manifest.assets : [asset];
  const assetFor = (extension) =>
    assets.find((entry) => entry.name.endsWith(extension));

  const lines = [
    `linuxPath: ${yamlQuote(asset.name)}`,
    `linuxUrl: ${yamlQuote(releaseUrl(tag, asset.name))}`,
    `linuxSha256: ${yamlQuote(asset.sha256)}`,
    `linuxSha512: ${yamlQuote(asset.sha512)}`,
    `linuxSize: ${asset.size}`,
  ];

  for (const [prefix, extension] of [["linuxRpm", ".rpm"], ["linuxDeb", ".deb"]]) {
    const packageAsset = assetFor(extension);
    if (!packageAsset) continue;
    lines.push(
      `${prefix}Path: ${yamlQuote(packageAsset.name)}`,
      `${prefix}Url: ${yamlQuote(releaseUrl(tag, packageAsset.name))}`,
      `${prefix}Sha256: ${yamlQuote(packageAsset.sha256)}`,
      `${prefix}Sha512: ${yamlQuote(packageAsset.sha512)}`,
      `${prefix}Size: ${packageAsset.size}`,
    );
  }

  let existing = fs.readFileSync(latestYmlPath, "utf8");
  const latestVersionLine = existing
    .split("\n")
    .find((line) => line.startsWith("version:"));
  const latestVersion = latestVersionLine
    ? JSON.parse(latestVersionLine.slice("version:".length).trim())
    : "";
  if (latestVersion !== version) {
    throw new Error(
      `Windows and Linux manifest versions differ: ${latestVersion || "missing"} vs ${version}`,
    );
  }

  // Insert Linux lines before the final productName line
  const productNameLine = existing
    .split("\n")
    .find((line) => line.startsWith("productName:"));

  if (productNameLine) {
    existing = existing.replace(
      productNameLine,
      `${lines.join("\n")}\n${productNameLine}`,
    );
  } else {
    existing = existing.trimEnd() + "\n" + lines.join("\n") + "\n";
  }

  fs.writeFileSync(latestYmlPath, existing, "utf8");
  console.log("Linux entries appended to latest.yml.");
}

main();
