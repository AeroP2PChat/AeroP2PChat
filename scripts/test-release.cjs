const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  bumpVersion,
  compareVersions,
  parseVersion,
  resolveMinimumVersion,
} = require("./release-help.cjs");

assert.deepEqual(parseVersion("26.52.1"), [26, 52, 1]);
assert.equal(parseVersion("v26.52.1"), null);
assert.equal(bumpVersion("26.52.1", "patch"), "26.52.2");
assert.equal(bumpVersion("26.52.1", "minor"), "26.53.0");
assert.equal(bumpVersion("26.52.1", "major"), "27.0.0");
assert.equal(compareVersions("26.52.2", "26.52.1"), 1);
assert.equal(compareVersions("26.52.1", "26.52.1"), 0);
assert.equal(compareVersions("26.51.9", "26.52.1"), -1);
assert.equal(
  resolveMinimumVersion("keep", "26.52.2", "26.40.0"),
  "26.40.0",
);
assert.equal(
  resolveMinimumVersion("important", "26.52.2", "26.40.0"),
  "26.52.2",
);
assert.equal(resolveMinimumVersion("clear", "26.52.2", "26.40.0"), "");

const root = path.resolve(__dirname, "..");
const packageInfo = require("../package.json");
const projectConfig = require("../config.json");
const builderConfig = require("../electron-builder.config.cjs");
assert.match(packageInfo.scripts.build, /--platform=windows/);
assert.match(packageInfo.scripts["build:linux:wsl"], /build-linux-wsl\.cjs/);
assert.deepEqual(builderConfig.win.target, ["msi"]);
assert.equal(builderConfig.msi.perMachine, true);
assert.equal(builderConfig.msi.createDesktopShortcut, "always");
assert.equal(builderConfig.msiProjectCreated, "scripts/customize-msi.cjs");
assert.equal(
  projectConfig.release.windowsSetupAsset,
  "Aero-P2P-Chat-Windows-x64-Setup.msi",
);
assert.equal(
  projectConfig.release.windowsStoreMsixAsset,
  "Aero-P2P-Chat-Microsoft-Store-x64.msix",
);
assert.equal(projectConfig.release.windowsStoreAppxAsset, undefined);
assert.ok(
  Number(builderConfig.appx.minVersion.split(".")[2]) > 17134,
  "Microsoft Store MSIX MinVersion must be newer than Windows build 17134",
);
assert.equal(builderConfig.appx.minVersion, "10.0.17763.0");
const wslBuild = fs.readFileSync(
  path.join(root, "scripts", "build-linux-wsl.sh"),
  "utf8",
);
assert.match(wslBuild, /npm ci --prefer-offline --no-audit --no-fund/);
assert.match(wslBuild, /ci-build-release\.cjs --platform=linux/);
assert.match(wslBuild, /aero-p2p-chat-release/);
assert.match(wslBuild, /Aero-P2P-Chat-Linux-x64\.AppImage/);
assert.match(wslBuild, /Aero-P2P-Chat-Linux-x64\.rpm/);
assert.match(wslBuild, /Aero-P2P-Chat-Linux-x64\.deb/);

const releaseSource = fs.readFileSync(
  path.join(root, "scripts", "release-help.cjs"),
  "utf8",
);
assert.match(releaseSource, /AERO_WSL_DISTRO \|\| "Debian"/);
assert.match(releaseSource, /build-linux-wsl\.sh/);
assert.match(releaseSource, /ensureLinuxBuildEnvironment\(\)/);
assert.doesNotMatch(releaseSource, /linux-release\.yml/);

const mainSource = fs.readFileSync(
  path.join(root, "src", "main", "index.js"),
  "utf8",
);
assert.match(
  mainSource,
  /app\.setPath\("userData", join\(app\.getPath\("appData"\), "AeroP2PChat"\)\)/,
);
assert.doesNotMatch(mainSource, /migratePackagedUserData/);

const windowsBuildSource = fs.readFileSync(
  path.join(root, "scripts", "ci-build-release.cjs"),
  "utf8",
);
assert.match(windowsBuildSource, /"--win", "msi", "appx"/);
assert.doesNotMatch(windowsBuildSource, /windows\/setup|windows\/store/);

console.log("Release workflow tests passed.");
