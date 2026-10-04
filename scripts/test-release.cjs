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
assert.match(packageInfo.scripts.build, /--platform=windows/);
assert.equal(
  projectConfig.release.windowsStoreMsixAsset,
  "Aero-P2P-Chat-Microsoft-Store-x64.msix",
);
assert.equal(projectConfig.release.windowsStoreAppxAsset, undefined);
const workflow = fs.readFileSync(
  path.join(root, ".github", "workflows", "linux-release.yml"),
  "utf8",
);
assert.match(workflow, /--platform=linux/);
assert.match(workflow, /Aero-P2P-Chat-Linux-x64\.AppImage/);
assert.match(workflow, /Aero-P2P-Chat-Linux-x64\.rpm/);
assert.match(workflow, /Aero-P2P-Chat-Linux-x64\.deb/);

console.log("Release workflow tests passed.");
