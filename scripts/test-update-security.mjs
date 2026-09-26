import assert from "node:assert/strict";
import {
  hasValidUpdateChecksums,
  isValidReleaseAssetUrl,
} from "../src/renderer/update-security.mjs";

const repo = "Zorblock/AeroP2Pchat";
const asset = "Aero-P2P-Chat-Windows-x64-Setup.exe";
const validUrl =
  `https://github.com/${repo}/releases/download/v26.52.2/${asset}`;

assert.equal(isValidReleaseAssetUrl(validUrl, repo, asset), true);
assert.equal(isValidReleaseAssetUrl("", repo, asset), false);
assert.equal(isValidReleaseAssetUrl("not a URL", repo, asset), false);
assert.equal(
  isValidReleaseAssetUrl(
    `https://example.com/${repo}/releases/download/v26.52.2/${asset}`,
    repo,
    asset,
  ),
  false,
);
assert.equal(
  isValidReleaseAssetUrl(
    `https://github.com/SomeoneElse/AeroP2Pchat/releases/download/v26.52.2/${asset}`,
    repo,
    asset,
  ),
  false,
);
assert.equal(
  isValidReleaseAssetUrl(
    `https://github.com/${repo}/releases/download/v26.52.2/evil.exe`,
    repo,
    asset,
  ),
  false,
);

assert.equal(hasValidUpdateChecksums("a".repeat(64), "A".repeat(86) + "=="), true);
assert.equal(hasValidUpdateChecksums("a".repeat(63), "A".repeat(86) + "=="), false);
assert.equal(hasValidUpdateChecksums("a".repeat(64), "invalid"), false);

console.log("Update security tests passed.");
