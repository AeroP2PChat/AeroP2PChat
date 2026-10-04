const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const config = JSON.parse(
  fs.readFileSync(path.join(root, "config.json"), "utf8"),
);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);

function parseArgs() {
  const options = {
    output: path.join(root, "dist", "store"),
    artifact: "",
    skipCompile: false,
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === "--skip-compile") options.skipCompile = true;
    else if (arg.startsWith("--output=")) {
      options.output = path.resolve(root, arg.slice("--output=".length));
    } else if (arg.startsWith("--artifact=")) {
      options.artifact = path.resolve(root, arg.slice("--artifact=".length));
    } else {
      throw new Error(`Unknown Microsoft Store build option: ${arg}`);
    }
  }

  return options;
}

function run(command, args) {
  const isWindowsNpm =
    process.platform === "win32" && (command === "npm" || command === "npx");
  const executable = isWindowsNpm ? process.env.ComSpec || "cmd.exe" : command;
  const finalArgs = isWindowsNpm
    ? ["/d", "/s", "/c", `${command}.cmd`, ...args]
    : args;
  const result = spawnSync(executable, finalArgs, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "" },
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed.`);
  }
}

function findMsix(outputDir) {
  const candidates = fs
    .readdirSync(outputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".msix"))
    .map((entry) => path.join(outputDir, entry.name));

  candidates.sort(
    (left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs,
  );
  return candidates[0] || "";
}

function main() {
  if (process.platform !== "win32") {
    throw new Error("Microsoft Store MSIX packages can only be built on Windows.");
  }

  const options = parseArgs();
  fs.rmSync(options.output, { recursive: true, force: true });
  fs.mkdirSync(options.output, { recursive: true });

  if (!options.skipCompile) {
    run("node", ["scripts/run-electron-vite.cjs", "build"]);
  }

  run("npx", [
    "electron-builder",
    "--config",
    "electron-builder.config.cjs",
    "--win",
    "appx",
    "--x64",
    "--publish",
    "never",
    `--config.directories.output=${path.relative(root, options.output)}`,
  ]);

  const generatedPackage = findMsix(options.output);
  if (!generatedPackage) {
    throw new Error("electron-builder did not create a Microsoft Store .msix package.");
  }

  const artifactPath = options.artifact || generatedPackage;
  if (path.resolve(generatedPackage) !== path.resolve(artifactPath)) {
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.copyFileSync(generatedPackage, artifactPath);
  }

  console.log(`Microsoft Store package: ${path.relative(root, artifactPath)}`);
  console.log("Upload the .msix file to Microsoft Partner Center.");
}

main();
