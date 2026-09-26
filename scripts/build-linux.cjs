const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const allowedTargets = new Map([
  ["appimage", "AppImage"],
  ["rpm", "rpm"],
  ["deb", "deb"],
]);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed.`);
}

function targetsFromArgs() {
  const requested = process.argv.slice(2)
    .filter((arg) => arg.startsWith("--target="))
    .map((arg) => arg.slice("--target=".length).toLowerCase());
  if (requested.length === 0) return [...allowedTargets.values()];
  return requested.map((target) => {
    if (!allowedTargets.has(target)) throw new Error(`Unsupported Linux target: ${target}`);
    return allowedTargets.get(target);
  });
}

function main() {
  if (process.platform !== "linux") throw new Error("Native Linux packages must be built on Linux.");
  const outputDir = path.join(root, "dist", "build", "linux");
  fs.mkdirSync(outputDir, { recursive: true });
  run("node", ["scripts/run-electron-vite.cjs", "build"]);
  run("npx", [
    "electron-builder", "--config", "electron-builder.config.cjs",
    "--linux", ...targetsFromArgs(), "--x64", "--publish", "never",
    `--config.directories.output=${path.relative(root, outputDir)}`,
  ]);
  console.log(`Linux packages: ${path.relative(root, outputDir)}`);
}

try {
  main();
} catch (error) {
  console.error(`\nLinux build failed: ${error.message || error}`);
  process.exit(1);
}
