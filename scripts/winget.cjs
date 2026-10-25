const { spawnSync } = require("node:child_process");
const config = require("../config.json");
const packageInfo = require("../package.json");

function run(args, { capture = false } = {}) {
  const result = spawnSync("wingetcreate", args, {
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: capture ? "utf8" : undefined,
    shell: false,
  });
  if (result.error?.code === "ENOENT") {
    throw new Error(
      "WingetCreate ist nicht installiert. Installiere es mit: winget install --id Microsoft.WingetCreate --exact",
    );
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = capture
      ? `${result.stdout || ""}${result.stderr || ""}`.trim()
      : "";
    throw new Error(
      `wingetcreate ${args.join(" ")} fehlgeschlagen${details ? `:\n${details}` : "."}`,
    );
  }
  return capture ? String(result.stdout || "").trim() : "";
}

function normalizeVersion(value) {
  const version = String(value || "").replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Ungültige WinGet-Version: ${value}`);
  }
  return version;
}

function releaseDetails(value = packageInfo.version) {
  const version = normalizeVersion(value);
  const tag = `v${version}`;
  const installerUrl = `https://github.com/${config.repo}/releases/download/${tag}/${config.release.windowsSetupAsset}`;
  return {
    version,
    tag,
    installerUrl,
    packageId: config.release.wingetPackageIdentifier,
  };
}

function ensureWingetCreate() {
  run(["info"], { capture: true });
}

function ensureWingetPackageExists() {
  ensureWingetCreate();
  run(["show", config.release.wingetPackageIdentifier], { capture: true });
}

function setupInitialPackage() {
  if (process.platform !== "win32") {
    throw new Error("Die WinGet-Ersteinrichtung muss unter Windows laufen.");
  }
  ensureWingetCreate();
  const details = releaseDetails();
  console.log("GitHub-Anmeldung für WingetCreate einrichten ...");
  run(["token", "--store"]);
  console.log(`Erstes Manifest für ${details.packageId} ${details.version} erstellen ...`);
  run(["new", details.installerUrl]);
}

function submitWingetUpdate(value) {
  if (process.platform !== "win32") {
    throw new Error("WinGet-Aktualisierungen müssen unter Windows laufen.");
  }
  ensureWingetPackageExists();
  const details = releaseDetails(value);
  run([
    "update",
    details.packageId,
    "--version",
    details.version,
    "--urls",
    details.installerUrl,
    "--submit",
    "--no-open",
  ]);
  return details;
}

function main() {
  const command = process.argv[2] || "check";
  if (command === "setup") setupInitialPackage();
  else if (command === "check") {
    ensureWingetPackageExists();
    console.log(`${config.release.wingetPackageIdentifier} ist bei WinGet verfügbar.`);
  } else if (command === "update") {
    const details = submitWingetUpdate(process.argv[3] || packageInfo.version);
    console.log(`WinGet-Update für ${details.packageId} ${details.version} eingereicht.`);
  } else {
    throw new Error("Benutzung: node scripts/winget.cjs setup|check|update [version]");
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  ensureWingetCreate,
  ensureWingetPackageExists,
  releaseDetails,
  setupInitialPackage,
  submitWingetUpdate,
};
