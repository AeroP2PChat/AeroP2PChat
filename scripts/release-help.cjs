const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packagePath = path.join(root, "package.json");
const lockPath = path.join(root, "package-lock.json");
const policyPath = path.join(root, "update-policy.json");
const artifactsDir = path.join(root, "dist", "build", "artifacts");
const config = require("../config.json");

function run(command, args, { capture = false } = {}) {
  console.log(`> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: capture ? "utf8" : undefined,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = capture ? `${result.stdout || ""}${result.stderr || ""}`.trim() : "";
    throw new Error(`${command} ${args.join(" ")} failed${details ? `:\n${details}` : "."}`);
  }
  return capture ? String(result.stdout || "").trim() : "";
}

function parseArgs() {
  const options = { bump: "minor", dryRun: false };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--patch") options.bump = "patch";
    else if (arg === "--minor") options.bump = "minor";
    else if (arg === "--major") options.bump = "major";
    else if (arg === "--no-bump") options.bump = "none";
    else if (arg === "--important") options.important = true;
    else if (arg === "--clear-important") options.clearImportant = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("--version=")) {
      options.version = arg.slice(10).replace(/^v/, "");
      options.bump = "none";
    } else throw new Error(`Unknown release option: ${arg}`);
  }
  if (options.important && options.clearImportant) {
    throw new Error("Use either --important or --clear-important.");
  }
  return options;
}

function bumpVersion(version, bump) {
  if (bump === "none") return version;
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Invalid version: ${version}`);
  let [, major, minor, patch] = match.map(Number);
  if (bump === "major") [major, minor, patch] = [major + 1, 0, 0];
  else if (bump === "minor") [minor, patch] = [minor + 1, 0];
  else patch += 1;
  return `${major}.${minor}.${patch}`;
}

function readJson(filePath, fallback = {}) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function setVersion(version) {
  const pkg = readJson(packagePath);
  pkg.version = version;
  writeJson(packagePath, pkg);
  const lock = readJson(lockPath);
  lock.version = version;
  if (lock.packages?.[""]) lock.packages[""].version = version;
  writeJson(lockPath, lock);
}

function ensureCleanRepository() {
  run("git", ["rev-parse", "--is-inside-work-tree"], { capture: true });
  const status = run("git", ["status", "--porcelain"], { capture: true });
  if (status) throw new Error("Commit or stash all changes before creating a release.");
}

function ensureTagAvailable(tag) {
  const local = spawnSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], { cwd: root });
  if (local.status === 0) throw new Error(`Tag already exists: ${tag}`);
  const remote = spawnSync("git", ["ls-remote", "--exit-code", "--tags", "origin", tag], { cwd: root });
  if (remote.status === 0) throw new Error(`Remote tag already exists: ${tag}`);
}

function verifyLinuxArtifacts() {
  for (const name of [
    config.release.linuxAppImageAsset,
    config.release.linuxRpmAsset,
    config.release.linuxDebAsset,
    "update_manifest_linux.json",
  ]) {
    if (!fs.existsSync(path.join(artifactsDir, name))) throw new Error(`Missing Linux artifact: ${name}`);
  }
}

function releaseNotes(tag) {
  return [
    `## Aero P2P Chat ${tag}`,
    "",
    "Native downloads:",
    "",
    `- Linux AppImage: \`${config.release.linuxAppImageAsset}\``,
    `- Fedora/Nobara RPM: \`${config.release.linuxRpmAsset}\``,
    `- Debian/Ubuntu DEB: \`${config.release.linuxDebAsset}\``,
    `- Windows setup: \`${config.release.windowsSetupAsset}\``,
    "",
    "The Microsoft Store APPX is retained as a private workflow artifact for Store submission.",
  ].join("\n");
}

function main() {
  if (process.platform !== "linux") throw new Error("Releases are prepared locally on Linux.");
  const options = parseArgs();
  ensureCleanRepository();
  run("gh", ["auth", "status"], { capture: true });

  const pkg = readJson(packagePath);
  const nextVersion = options.version || bumpVersion(pkg.version, options.bump);
  if (!/^\d+\.\d+\.\d+$/.test(nextVersion)) throw new Error("Version must use x.y.z.");
  const tag = `v${nextVersion}`;
  ensureTagAvailable(tag);

  const branch = run("git", ["branch", "--show-current"], { capture: true });
  if (!branch) throw new Error("Release requires a named branch.");
  const previousPolicy = readJson(policyPath, { minimumVersion: "" });
  const minimumVersion = options.important
    ? nextVersion
    : options.clearImportant
      ? ""
      : String(previousPolicy.minimumVersion || "");

  console.log(`Release ${pkg.version} -> ${nextVersion}`);
  console.log(`Linux: AppImage, RPM, DEB (local native build)`);
  console.log(`Windows: NSIS setup + APPX (GitHub Actions)`);
  if (options.dryRun) return;

  const originalPackage = fs.readFileSync(packagePath, "utf8");
  const originalLock = fs.readFileSync(lockPath, "utf8");
  const originalPolicy = fs.existsSync(policyPath) ? fs.readFileSync(policyPath, "utf8") : null;
  let committed = false;
  try {
    run("npm", ["run", "test"]);
    setVersion(nextVersion);
    writeJson(policyPath, { minimumVersion });
    run("node", ["scripts/ci-build-release.cjs", "--platform=linux", `--version=${nextVersion}`]);
    verifyLinuxArtifacts();

    run("git", ["add", "--", "package.json", "package-lock.json", "update-policy.json"]);
    run("git", ["commit", "-m", `chore: release ${tag}`]);
    committed = true;
    run("git", ["push", "-u", "origin", branch]);
    run("git", ["tag", tag]);
    run("git", ["push", "origin", tag]);

    run("gh", ["release", "create", tag, "--draft", "--target", branch, "--title", `Aero P2P Chat ${tag}`, "--notes", releaseNotes(tag)]);
    for (const name of [
      config.release.linuxAppImageAsset,
      config.release.linuxRpmAsset,
      config.release.linuxDebAsset,
      "update_manifest_linux.json",
    ]) {
      run("gh", ["release", "upload", tag, path.join(artifactsDir, name)]);
    }

    run("gh", [
      "workflow", "run", "windows-release.yml", "--ref", branch,
      "-f", `tag=${tag}`,
      "-f", `minimum_version=${minimumVersion}`,
    ]);
    console.log(`\nDraft ${tag} created with native Linux packages.`);
    console.log("The Windows workflow will add the setup, build the Store APPX, create latest.yml, and publish the release.");
    console.log(`Watch it with: gh run watch --repo ${config.repo}`);
  } catch (error) {
    if (!committed) {
      fs.writeFileSync(packagePath, originalPackage);
      fs.writeFileSync(lockPath, originalLock);
      if (originalPolicy === null) fs.rmSync(policyPath, { force: true });
      else fs.writeFileSync(policyPath, originalPolicy);
    }
    throw error;
  }
}

try {
  main();
} catch (error) {
  console.error(`\nRelease failed: ${error.message || error}`);
  process.exit(1);
}
