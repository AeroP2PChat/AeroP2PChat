const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packagePath = path.join(root, "package.json");
const lockPath = path.join(root, "package-lock.json");
const policyPath = path.join(root, "update-policy.json");
const artifactsDir = path.join(root, "dist", "build", "artifacts");
const config = require("../config.json");

function run(command, args, { capture = false } = {}) {
  const windowsCommand =
    process.platform === "win32" && ["npm", "npx"].includes(command);
  const executable = windowsCommand
    ? process.env.ComSpec || "cmd.exe"
    : command;
  const commandArgs = windowsCommand
    ? ["/d", "/s", "/c", `${command}.cmd`, ...args]
    : args;
  const result = spawnSync(executable, commandArgs, {
    cwd: root,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: capture ? "utf8" : undefined,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = capture
      ? `${result.stdout || ""}${result.stderr || ""}`.trim()
      : "";
    throw new Error(
      `${command} ${args.join(" ")} failed${details ? `:\n${details}` : "."}`,
    );
  }
  return capture ? String(result.stdout || "").trim() : "";
}

function runAsync(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let errorOutput = "";
    child.stderr.on("data", (chunk) => {
      errorOutput += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            errorOutput.trim() ||
              `${command} ${args.join(" ")} failed with exit code ${code}.`,
          ),
        );
      }
    });
  });
}

function readJson(filePath, fallback = {}) {
  return fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, "utf8"))
    : fallback;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version));
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) throw new Error("Versions must use x.y.z.");
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] > rightParts[index] ? 1 : -1;
    }
  }
  return 0;
}

function bumpVersion(version, bump) {
  const parts = parseVersion(version);
  if (!parts) throw new Error(`Invalid version: ${version}`);
  let [major, minor, patch] = parts;
  if (bump === "major") [major, minor, patch] = [major + 1, 0, 0];
  else if (bump === "minor") [minor, patch] = [minor + 1, 0];
  else if (bump === "patch") patch += 1;
  else throw new Error(`Unsupported version bump: ${bump}`);
  return `${major}.${minor}.${patch}`;
}

function getReleaseState() {
  const pkg = readJson(packagePath);
  const policy = readJson(policyPath, { minimumVersion: "" });
  return {
    currentVersion: String(pkg.version),
    minimumVersion: String(policy.minimumVersion || ""),
    repo: config.repo,
  };
}

function resolveMinimumVersion(mode, nextVersion, previousMinimumVersion) {
  if (mode === "important") return nextVersion;
  if (mode === "clear") return "";
  if (mode === "keep") return String(previousMinimumVersion || "");
  throw new Error(`Unsupported update policy: ${mode}`);
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
  if (status) {
    throw new Error(
      "Commit or stash all changes before creating a release. The release must start from a clean repository.",
    );
  }
}

function ensureTagAvailable(tag) {
  const local = spawnSync(
    "git",
    ["rev-parse", "-q", "--verify", `refs/tags/${tag}`],
    { cwd: root },
  );
  if (local.status === 0) throw new Error(`Tag already exists: ${tag}`);
  const remote = spawnSync(
    "git",
    ["ls-remote", "--exit-code", "--tags", "origin", tag],
    { cwd: root },
  );
  if (remote.status === 0) throw new Error(`Remote tag already exists: ${tag}`);
}

function verifyArtifacts(names, platform) {
  for (const name of names) {
    if (!fs.existsSync(path.join(artifactsDir, name))) {
      throw new Error(`Missing ${platform} artifact: ${name}`);
    }
  }
}

function wait(milliseconds) {
  Atomics.wait(
    new Int32Array(new SharedArrayBuffer(4)),
    0,
    0,
    milliseconds,
  );
}

function findLinuxWorkflowRun({ headSha, dispatchedAt, attempts = 20 }) {
  const earliestCreatedAt = Number(dispatchedAt) - 10000;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const output = run(
      "gh",
      [
        "run",
        "list",
        "--repo",
        config.repo,
        "--workflow",
        "linux-release.yml",
        "--commit",
        headSha,
        "--event",
        "workflow_dispatch",
        "--limit",
        "10",
        "--json",
        "databaseId,createdAt,status,url,headSha",
      ],
      { capture: true },
    );
    const runs = JSON.parse(output || "[]");
    const workflowRun = runs
      .filter(
        (entry) =>
          entry.headSha === headSha &&
          Date.parse(entry.createdAt) >= earliestCreatedAt,
      )
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
    if (workflowRun) return workflowRun;
    if (attempt < attempts) wait(1500);
  }
  throw new Error(
    "The dispatched Linux workflow could not be found. Check GitHub Actions.",
  );
}

function watchLinuxWorkflow(runId) {
  run("gh", [
    "run",
    "watch",
    String(runId),
    "--repo",
    config.repo,
    "--compact",
    "--exit-status",
  ]);
}

async function uploadReleaseAsset(tag, filePath) {
  const size = fs.statSync(filePath).size;
  await runAsync("gh", [
    "release",
    "upload",
    tag,
    filePath,
    "--repo",
    config.repo,
  ]);
  return { name: path.basename(filePath), size };
}

function releaseNotes(tag, highlights = "") {
  const lines = [`## Aero P2P Chat ${tag}`, ""];
  if (highlights.trim()) {
    lines.push("### What's new", "", highlights.trim(), "");
  }
  lines.push(
    "### Downloads",
    "",
    `- Linux AppImage: \`${config.release.linuxAppImageAsset}\``,
    `- Fedora/Nobara RPM: \`${config.release.linuxRpmAsset}\``,
    `- Debian/Ubuntu DEB: \`${config.release.linuxDebAsset}\``,
    `- Windows setup: \`${config.release.windowsSetupAsset}\``,
    "",
    "The Microsoft Store APPX is built locally on Windows and retained for Store submission.",
  );
  return lines.join("\n");
}

async function executeRelease(options, reporter = {}) {
  if (process.platform !== "win32") {
    throw new Error("Releases are prepared locally on Windows.");
  }
  const step = reporter.step || ((message) => console.log(`\n${message}`));
  const info = reporter.info || console.log;
  const state = getReleaseState();
  const nextVersion = String(options.nextVersion || "").replace(/^v/, "");
  if (!parseVersion(nextVersion)) throw new Error("Version must use x.y.z.");
  if (compareVersions(nextVersion, state.currentVersion) <= 0) {
    throw new Error(
      `The release version must be newer than ${state.currentVersion}.`,
    );
  }

  const tag = `v${nextVersion}`;
  const minimumVersion = resolveMinimumVersion(
    options.updatePolicy,
    nextVersion,
    state.minimumVersion,
  );
  const chromeMode = options.chromeMode || "skip";
  const publishRelease = options.publishRelease !== false;

  step("Preflight checks");
  ensureCleanRepository();
  run("gh", ["auth", "status"], { capture: true });
  ensureTagAvailable(tag);
  const branch = run("git", ["branch", "--show-current"], { capture: true });
  if (!branch) throw new Error("Release requires a named branch.");
  if (chromeMode === "publish") {
    run("node", ["scripts/publish-chrome-extension.cjs", "--check"]);
  }

  const originalPackage = fs.readFileSync(packagePath, "utf8");
  const originalLock = fs.readFileSync(lockPath, "utf8");
  const originalPolicy = fs.existsSync(policyPath)
    ? fs.readFileSync(policyPath, "utf8")
    : null;
  let committed = false;

  try {
    step("Run project tests");
    run("npm", ["run", "test"]);

    step(`Set version ${state.currentVersion} → ${nextVersion}`);
    setVersion(nextVersion);
    writeJson(policyPath, { minimumVersion });

    step("Build Windows NSIS setup and Microsoft Store APPX natively");
    run("node", [
      "scripts/ci-build-release.cjs",
      "--platform=windows",
      `--version=${nextVersion}`,
    ]);
    run("node", [
      "scripts/ci-create-latest.cjs",
      path.relative(root, artifactsDir),
      ...(minimumVersion ? [`--minimum-version=${minimumVersion}`] : []),
    ]);
    const windowsAssets = [
      config.release.windowsSetupAsset,
      config.release.windowsStoreAppxAsset,
      "update_manifest_windows.json",
      "latest.yml",
    ];
    verifyArtifacts(windowsAssets, "Windows");

    // The APPX is for Partner Center, not a public GitHub release download.
    const releaseAssets = windowsAssets.filter(
      (name) => name !== config.release.windowsStoreAppxAsset,
    );
    if (chromeMode !== "skip") {
      step("Build Chrome extension");
      run("node", ["scripts/build-chrome-extension.cjs"]);
      verifyArtifacts([config.release.chromeExtensionAsset], "Chrome");
      releaseAssets.push(config.release.chromeExtensionAsset);
    }

    step("Create and push release commit");
    run("git", [
      "add",
      "--",
      "package.json",
      "package-lock.json",
      "update-policy.json",
    ]);
    run("git", ["commit", "-m", `chore: release ${tag}`]);
    committed = true;
    run("git", ["push", "-u", "origin", branch]);
    run("git", ["tag", tag]);
    run("git", ["push", "origin", tag]);

    step("Create draft release and upload local artifacts");
    run("gh", [
      "release",
      "create",
      tag,
      "--draft",
      "--target",
      branch,
      "--title",
      `Aero P2P Chat ${tag}`,
      "--notes",
      releaseNotes(tag, options.highlights),
    ]);
    for (const [index, name] of releaseAssets.entries()) {
      const filePath = path.join(artifactsDir, name);
      const uploadDetails = {
        index: index + 1,
        total: releaseAssets.length,
        name,
        size: fs.statSync(filePath).size,
      };
      reporter.uploadStart?.(uploadDetails);
      try {
        await uploadReleaseAsset(tag, filePath);
        reporter.uploadSuccess?.(uploadDetails);
      } catch (error) {
        reporter.uploadError?.(uploadDetails);
        throw error;
      }
    }

    if (chromeMode === "publish") {
      step("Publish Chrome extension to the Chrome Web Store");
      run("node", ["scripts/publish-chrome-extension.cjs"]);
    }

    step("Dispatch Linux release workflow");
    const headSha = run("git", ["rev-parse", "HEAD"], { capture: true });
    const dispatchedAt = Date.now();
    run("gh", [
      "workflow",
      "run",
      "linux-release.yml",
      "--ref",
      branch,
      "-f",
      `tag=${tag}`,
      "-f",
      `minimum_version=${minimumVersion}`,
      "-f",
      `publish_release=${publishRelease}`,
    ]);

    info(`Draft ${tag} contains the native Windows setup.`);
    info(
      publishRelease
        ? "The Linux workflow will add AppImage, RPM and DEB files and publish the release."
        : "The Linux workflow will add AppImage, RPM and DEB files and keep the release as a draft.",
    );
    return {
      branch,
      tag,
      minimumVersion,
      publishRelease,
      chromeMode,
      headSha,
      dispatchedAt,
      appxPath: path.join(artifactsDir, config.release.windowsStoreAppxAsset),
    };
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

module.exports = {
  bumpVersion,
  compareVersions,
  downloadStoreAppx: async () => {
    const appxPath = path.join(artifactsDir, config.release.windowsStoreAppxAsset);
    if (!fs.existsSync(appxPath)) throw new Error(`Local APPX not found: ${appxPath}`);
    return { path: appxPath, size: fs.statSync(appxPath).size };
  },
  executeRelease,
  findLinuxWorkflowRun,
  findWindowsWorkflowRun: findLinuxWorkflowRun,
  getReleaseState,
  parseVersion,
  releaseNotes,
  resolveMinimumVersion,
  uploadReleaseAsset,
  watchLinuxWorkflow,
  watchWindowsWorkflow: watchLinuxWorkflow,
};
