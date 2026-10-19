const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const config = require("../config.json");

function loadChromeEnvironment() {
  const envPath = path.join(root, ".env.chrome");
  if (!fs.existsSync(envPath)) {
    throw new Error(
      "Missing .env.chrome. Copy .env.chrome.example and add your Chrome Web Store credentials.",
    );
  }

  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;

    const [, key, rawValue] = match;
    const value = rawValue.trim().replace(/^(["'])(.*)\1$/, "$2");
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs() {
  const options = { check: false, build: false, source: "" };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--check") options.check = true;
    else if (arg === "--build") options.build = true;
    else if (arg.startsWith("--source=")) options.source = arg.slice(9);
    else throw new Error(`Unknown Chrome Web Store option: ${arg}`);
  }
  return options;
}

function assertCredentials() {
  const required = [
    "CLIENT_ID",
    "CLIENT_SECRET",
    "REFRESH_TOKEN",
    "EXTENSION_ID",
    "PUBLISHER_ID",
  ];
  const missing = required.filter((key) => !String(process.env[key] || "").trim());
  if (missing.length) {
    throw new Error(`Missing Chrome Web Store credentials: ${missing.join(", ")}`);
  }
}

function run(command, args) {
  const windowsNpx = process.platform === "win32" && command === "npx";
  const result = spawnSync(
    windowsNpx ? process.env.ComSpec || "cmd.exe" : command,
    windowsNpx ? ["/d", "/s", "/c", "npx.cmd", ...args] : args,
    { cwd: root, stdio: "inherit", env: process.env },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed.`);
  }
}

function main() {
  const options = parseArgs();
  loadChromeEnvironment();
  assertCredentials();

  if (options.check) {
    console.log("Chrome Web Store credentials are configured.");
    return;
  }

  if (options.build) {
    run("node", ["scripts/build-chrome-extension.cjs"]);
  }

  const source = path.resolve(
    root,
    options.source ||
      path.join("dist", "build", "artifacts", config.release.chromeExtensionAsset),
  );
  if (!fs.existsSync(source)) {
    throw new Error(`Chrome extension package not found: ${source}`);
  }

  console.log(`Publishing Chrome extension package: ${path.relative(root, source)}`);
  run("npx", [
    "--no-install",
    "chrome-webstore-upload",
    "--source",
    source,
    "--extension-id",
    process.env.EXTENSION_ID,
  ]);
}

try {
  main();
} catch (error) {
  console.error(`Chrome Web Store publish failed: ${error.message || error}`);
  process.exit(1);
}
