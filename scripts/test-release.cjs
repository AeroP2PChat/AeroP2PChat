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
assert.equal(packageInfo.scripts["build:linux:wsl"], undefined);
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
assert.equal(projectConfig.release.wingetPackageIdentifier, undefined);
assert.equal(projectConfig.release.windowsStoreAppxAsset, undefined);
assert.ok(
  Number(builderConfig.appx.minVersion.split(".")[2]) > 17134,
  "Microsoft Store MSIX MinVersion must be newer than Windows build 17134",
);
assert.equal(builderConfig.appx.minVersion, "10.0.17763.0");
const workflow = fs.readFileSync(
  path.join(root, ".github", "workflows", "release.yml"),
  "utf8",
);
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /--platform=windows/);
assert.match(workflow, /--platform=linux/);
assert.match(workflow, /--platform=mac/);
assert.match(workflow, /Aero-P2P-Chat-Windows-x64-Setup\.msi/);
assert.match(workflow, /Aero-P2P-Chat-Linux-x64\.AppImage/);
assert.match(workflow, /Aero-P2P-Chat-Linux-x64\.rpm/);
assert.match(workflow, /Aero-P2P-Chat-Linux-x64\.deb/);
assert.match(workflow, /Aero-P2P-Chat-macOS-universal\.dmg/);
assert.match(workflow, /Aero-P2P-Chat-macOS-universal\.zip/);
assert.match(workflow, /~\/\.cache\/electron-builder/);
assert.match(workflow, /~\/Library\/Caches\/electron-builder/);
assert.match(workflow, /AppData\/Local\/electron-builder\/Cache/);
assert.match(workflow, /npm ci --prefer-offline --no-audit --no-fund/);
assert.match(workflow, /actions\/upload-artifact@v4/);
assert.doesNotMatch(workflow, /submit-winget:|WINGET_TOKEN|wingetcreate/i);

const releaseSource = fs.readFileSync(
  path.join(root, "scripts", "release-help.cjs"),
  "utf8",
);
assert.match(releaseSource, /release\.yml/);
assert.match(releaseSource, /"workflow",\s*"run"/);
assert.match(releaseSource, /findLinuxWorkflowRun/);
assert.match(releaseSource, /watchLinuxWorkflow/);
assert.doesNotMatch(releaseSource, /--platform=windows/);
assert.doesNotMatch(releaseSource, /AERO_WSL_DISTRO|build-linux-wsl|wsl\.exe/);
assert.doesNotMatch(releaseSource, /ensureWingetPackageExists|winget/i);

const releaseCliSource = fs.readFileSync(
  path.join(root, "scripts", "release.cjs"),
  "utf8",
);
assert.doesNotMatch(releaseCliSource, /submitWingetUpdate|winget/i);
assert.doesNotMatch(releaseCliSource, /watchLinuxWorkflow|watchWindowsWorkflow/);

const mainSource = fs.readFileSync(
  path.join(root, "src", "main", "index.js"),
  "utf8",
);
assert.match(
  mainSource,
  /app\.setPath\("userData", join\(app\.getPath\("appData"\), "AeroP2PChat"\)\)/,
);
assert.doesNotMatch(mainSource, /migratePackagedUserData/);

const { execFileSync } = require("node:child_process");
const os = require("node:os");
const { pathToFileURL } = require("node:url");

const windowsBuildSource = fs.readFileSync(
  path.join(root, "scripts", "ci-build-release.cjs"),
  "utf8",
);
assert.match(windowsBuildSource, /"--win", "msi", "appx"/);
assert.match(windowsBuildSource, /"--mac", "dmg", "zip", "--universal"/);
assert.doesNotMatch(windowsBuildSource, /windows\/setup|windows\/store/);

// Verify unified latest.yml generation across Windows, Linux, and macOS
(async () => {
  const { isValidReleaseAssetUrl, hasValidUpdateChecksums } = await import(
    pathToFileURL(path.join(root, "src", "renderer", "update-security.mjs")).href
  );
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aero-latest-test-"));
  const sha256 = "a".repeat(64);
  const sha512 = `${"A".repeat(86)}==`;
  const ver = "26.99.0";
  try {
    fs.writeFileSync(
      path.join(tmpDir, "update_manifest_windows.json"),
      JSON.stringify({
        version: ver,
        platform: "windows",
        asset: { name: projectConfig.release.windowsSetupAsset, size: 1234, sha256, sha512 },
      }),
    );
    fs.writeFileSync(
      path.join(tmpDir, "update_manifest_linux.json"),
      JSON.stringify({
        version: ver,
        platform: "linux",
        asset: { name: projectConfig.release.linuxAppImageAsset, size: 2345, sha256, sha512 },
        assets: [
          { name: projectConfig.release.linuxAppImageAsset, size: 2345, sha256, sha512 },
          { name: projectConfig.release.linuxRpmAsset, size: 3456, sha256, sha512 },
          { name: projectConfig.release.linuxDebAsset, size: 4567, sha256, sha512 },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(tmpDir, "update_manifest_mac.json"),
      JSON.stringify({
        version: ver,
        platform: "mac",
        asset: { name: projectConfig.release.macDmgAsset, size: 5678, sha256, sha512 },
        assets: [
          { name: projectConfig.release.macDmgAsset, size: 5678, sha256, sha512 },
          { name: projectConfig.release.macZipAsset, size: 6789, sha256, sha512 },
        ],
      }),
    );

    execFileSync(process.execPath, [path.join(root, "scripts", "ci-create-latest.cjs"), tmpDir]);
    execFileSync(process.execPath, [
      path.join(root, "scripts", "ci-append-linux-latest.cjs"),
      path.join(tmpDir, "latest.yml"),
      tmpDir,
    ]);
    execFileSync(process.execPath, [
      path.join(root, "scripts", "ci-append-mac-latest.cjs"),
      path.join(tmpDir, "latest.yml"),
      tmpDir,
    ]);

    const yml = fs.readFileSync(path.join(tmpDir, "latest.yml"), "utf8");
    const parsed = {};
    for (const line of yml.split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const rawVal = line.slice(idx + 1).trim();
      parsed[key] = rawVal.startsWith('"') ? JSON.parse(rawVal) : rawVal;
    }

    assert.equal(parsed.version, ver);
    assert.ok(isValidReleaseAssetUrl(parsed.url, projectConfig.repo, projectConfig.release.windowsSetupAsset));
    assert.ok(hasValidUpdateChecksums(parsed.sha256, parsed.sha512));
    assert.ok(isValidReleaseAssetUrl(parsed.linuxUrl, projectConfig.repo, projectConfig.release.linuxAppImageAsset));
    assert.ok(hasValidUpdateChecksums(parsed.linuxSha256, parsed.linuxSha512));
    assert.ok(isValidReleaseAssetUrl(parsed.linuxRpmUrl, projectConfig.repo, projectConfig.release.linuxRpmAsset));
    assert.ok(isValidReleaseAssetUrl(parsed.linuxDebUrl, projectConfig.repo, projectConfig.release.linuxDebAsset));
    assert.ok(isValidReleaseAssetUrl(parsed.macosUniversalDmgUrl, projectConfig.repo, projectConfig.release.macDmgAsset));
    assert.ok(isValidReleaseAssetUrl(parsed.macosUniversalZipUrl, projectConfig.repo, projectConfig.release.macZipAsset));
    console.log("Release workflow tests passed.");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})();
