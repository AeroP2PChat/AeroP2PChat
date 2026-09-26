const assert = require("node:assert/strict");
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

console.log("Release workflow tests passed.");
