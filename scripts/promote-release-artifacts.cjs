const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const config = JSON.parse(
  fs.readFileSync(path.join(root, "config.json"), "utf8"),
);
const distDir = path.join(root, "dist");
const artifactsDir = path.join(distDir, "build", "artifacts");
const releaseDir = path.join(distDir, "release");
const nextReleaseDir = path.join(distDir, "release.next");
const previousReleaseDir = path.join(distDir, "release.previous");
const renameRetryDelayMs = 500;
const renameRetryAttempts = process.platform === "win32" ? 20 : 1;

const requiredFiles = [
  config.release.windowsSetupAsset,
  config.release.windowsStoreMsixAsset,
  config.release.linuxAppImageAsset,
  config.release.linuxRpmAsset,
  config.release.linuxDebAsset,
  "latest.yml",
  "update_manifest_windows.json",
  "update_manifest_linux.json",
];

function verifyArtifacts() {
  if (!fs.existsSync(artifactsDir)) {
    throw new Error(`Build artifacts directory not found: ${artifactsDir}`);
  }

  const missing = requiredFiles.filter(
    (name) => !fs.existsSync(path.join(artifactsDir, name)),
  );
  if (missing.length > 0) {
    throw new Error(
      `The release build is incomplete. Missing: ${missing.join(", ")}`,
    );
  }
}

function copyArtifacts() {
  fs.rmSync(nextReleaseDir, { recursive: true, force: true });
  fs.mkdirSync(nextReleaseDir, { recursive: true });

  for (const entry of fs.readdirSync(artifactsDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    fs.copyFileSync(
      path.join(artifactsDir, entry.name),
      path.join(nextReleaseDir, entry.name),
    );
  }
}

function waitForRetry(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function renameWithRetry(source, target) {
  let lastError;
  for (let attempt = 1; attempt <= renameRetryAttempts; attempt += 1) {
    try {
      fs.renameSync(source, target);
      return;
    } catch (error) {
      lastError = error;
      const canRetry =
        process.platform === "win32" &&
        ["EBUSY", "EPERM", "EACCES"].includes(error.code) &&
        attempt < renameRetryAttempts;
      if (!canRetry) throw error;
      waitForRetry(renameRetryDelayMs);
    }
  }
  throw lastError;
}

function isWindowsDirectoryLock(error) {
  return (
    process.platform === "win32" &&
    ["EBUSY", "EPERM", "EACCES"].includes(error.code)
  );
}

function replaceReleaseContents() {
  fs.rmSync(previousReleaseDir, { recursive: true, force: true });
  fs.cpSync(releaseDir, previousReleaseDir, { recursive: true, force: true });

  try {
    const nextFiles = new Set(
      fs
        .readdirSync(nextReleaseDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name),
    );

    for (const entry of fs.readdirSync(releaseDir, { withFileTypes: true })) {
      if (!nextFiles.has(entry.name)) {
        fs.rmSync(path.join(releaseDir, entry.name), {
          recursive: true,
          force: true,
        });
      }
    }

    for (const entry of fs.readdirSync(nextReleaseDir, {
      withFileTypes: true,
    })) {
      if (!entry.isFile()) continue;
      fs.copyFileSync(
        path.join(nextReleaseDir, entry.name),
        path.join(releaseDir, entry.name),
      );
    }

    fs.rmSync(nextReleaseDir, { recursive: true, force: true });
    fs.rmSync(previousReleaseDir, { recursive: true, force: true });
  } catch (error) {
    fs.cpSync(previousReleaseDir, releaseDir, { recursive: true, force: true });
    throw error;
  }
}

function replaceReleaseDirectory() {
  fs.rmSync(previousReleaseDir, { recursive: true, force: true });
  const hadPreviousRelease = fs.existsSync(releaseDir);

  try {
    if (hadPreviousRelease) renameWithRetry(releaseDir, previousReleaseDir);
    renameWithRetry(nextReleaseDir, releaseDir);
    fs.rmSync(previousReleaseDir, { recursive: true, force: true });
  } catch (error) {
    if (
      hadPreviousRelease &&
      fs.existsSync(releaseDir) &&
      isWindowsDirectoryLock(error)
    ) {
      replaceReleaseContents();
      return;
    }
    if (!fs.existsSync(releaseDir) && fs.existsSync(previousReleaseDir)) {
      renameWithRetry(previousReleaseDir, releaseDir);
    }
    throw error;
  }
}

verifyArtifacts();
copyArtifacts();
replaceReleaseDirectory();
console.log(`Release artifacts promoted: ${path.relative(root, releaseDir)}`);
