const { spawn } = require("node:child_process");
const { join } = require("node:path");
const {
  attachFilteredDevStderr,
  shouldShowRawChromiumLogs,
} = require("./filter-dev-stderr.cjs");

const command = process.argv[2] || "dev";
const electronVitePackage = require("electron-vite/package.json");
const bin = join(
  __dirname,
  "..",
  "node_modules",
  "electron-vite",
  electronVitePackage.bin["electron-vite"],
);

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const filterDevStderr = command === "dev" && !shouldShowRawChromiumLogs();

const child = spawn(
  process.execPath,
  [bin, command, ...process.argv.slice(3)],
  {
    cwd: join(__dirname, ".."),
    env,
    stdio: filterDevStderr ? ["inherit", "inherit", "pipe"] : "inherit",
    shell: false,
  },
);

if (filterDevStderr) attachFilteredDevStderr(child);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
