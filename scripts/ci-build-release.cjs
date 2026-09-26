const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const buildDir = path.join(root, "dist", "build");
const artifactsDir = path.join(buildDir, "artifacts");
const config = require("../config.json");
const packageInfo = require("../package.json");

function parseArgs() {
  const options = { platform: "", version: packageInfo.version };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--platform=")) options.platform = arg.slice(11);
    else if (arg.startsWith("--version=")) options.version = arg.slice(10).replace(/^v/, "");
    else if (arg !== "--preserve-build") throw new Error(`Unknown option: ${arg}`);
  }
  if (!["linux", "windows"].includes(options.platform)) throw new Error("Missing --platform=linux|windows");
  if (options.version !== packageInfo.version) {
    throw new Error(`Requested version ${options.version} does not match package.json ${packageInfo.version}.`);
  }
  return options;
}

function run(command, args) {
  const windowsNpm = process.platform === "win32" && ["npm", "npx"].includes(command);
  const result = spawnSync(windowsNpm ? `${command}.cmd` : command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed.`);
}

function hashes(filePath) {
  const data = fs.readFileSync(filePath);
  return {
    size: data.length,
    sha256: crypto.createHash("sha256").update(data).digest("hex"),
    sha512: crypto.createHash("sha512").update(data).digest("base64"),
  };
}

function copyArtifact(sourceDir, sourceName, targetName = sourceName) {
  const source = path.join(sourceDir, sourceName);
  if (!fs.existsSync(source)) throw new Error(`Build artifact not found: ${source}`);
  const target = path.join(artifactsDir, targetName);
  fs.copyFileSync(source, target);
  return { name: targetName, ...hashes(target) };
}

function resetPlatformOutput(platform) {
  fs.rmSync(path.join(buildDir, platform), { recursive: true, force: true });
  fs.mkdirSync(artifactsDir, { recursive: true });
}

function buildLinux(version) {
  if (process.platform !== "linux") throw new Error("Linux packages require a Linux host.");
  resetPlatformOutput("linux");
  run("node", ["scripts/run-electron-vite.cjs", "build"]);
  run("npx", [
    "electron-builder", "--config", "electron-builder.config.cjs",
    "--linux", "AppImage", "rpm", "deb", "--x64", "--publish", "never",
    "--config.directories.output=dist/build/linux",
  ]);
  const output = path.join(buildDir, "linux");
  const assets = [
    copyArtifact(output, config.release.linuxAppImageAsset),
    copyArtifact(output, config.release.linuxRpmAsset),
    copyArtifact(output, config.release.linuxDebAsset),
  ];
  fs.writeFileSync(
    path.join(artifactsDir, "update_manifest_linux.json"),
    `${JSON.stringify({ version, platform: "linux", asset: assets[0], assets }, null, 2)}\n`,
  );
}

function buildWindows(version) {
  if (process.platform !== "win32") throw new Error("Windows packages require a Windows host.");
  resetPlatformOutput("windows");
  run("node", ["scripts/run-electron-vite.cjs", "build"]);
  run("npx", [
    "electron-builder", "--config", "electron-builder.config.cjs",
    "--win", "nsis", "--x64", "--publish", "never",
    "--config.directories.output=dist/build/windows/setup",
  ]);
  run("npx", [
    "electron-builder", "--config", "electron-builder.config.cjs",
    "--win", "appx", "--x64", "--publish", "never",
    "--config.directories.output=dist/build/windows/store",
  ]);
  const setup = copyArtifact(path.join(buildDir, "windows", "setup"), config.release.windowsSetupAsset);
  copyArtifact(path.join(buildDir, "windows", "store"), config.release.windowsStoreAppxAsset);
  fs.writeFileSync(
    path.join(artifactsDir, "update_manifest_windows.json"),
    `${JSON.stringify({ version, platform: "windows", asset: setup }, null, 2)}\n`,
  );
}

const options = parseArgs();
if (options.platform === "linux") buildLinux(options.version);
else buildWindows(options.version);
