const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const [logName, ...commandInput] = process.argv.slice(2);
const useShell = commandInput[0] === "--shell";
const command = useShell ? commandInput[1] : commandInput[0];
const args = useShell ? [] : commandInput.slice(1);

if (!logName || !command) {
  console.error(
    "Usage: node scripts/run-logged-command.cjs <log-name> <command> [arguments...]",
  );
  process.exit(1);
}

const safeLogName = logName.replace(/[^a-zA-Z0-9._-]/g, "-");
const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
const logDirectory = path.join(root, ".logs", safeLogName);
const logPath = path.join(logDirectory, `${timestamp}.log`);
const relativeLogPath = path.relative(root, logPath);

fs.mkdirSync(logDirectory, { recursive: true });
const logStream = fs.createWriteStream(logPath, { encoding: "utf8" });

function writeToTerminalAndLog(stream, chunk) {
  stream.write(chunk);
  logStream.write(chunk);
}

function writeLogLine(line) {
  const message = `${line}\n`;
  process.stdout.write(message);
  logStream.write(message);
}

let finished = false;

function finish(exitCode) {
  if (finished) return;
  finished = true;
  writeLogLine(`\n[${new Date().toISOString()}] Command finished with exit code ${exitCode}.`);
  logStream.end(() => {
    process.exitCode = exitCode;
  });
}

writeLogLine(`[${new Date().toISOString()}] npm run ${logName}`);
writeLogLine(`Command: ${command} ${args.join(" ")}`);
writeLogLine(`Log file: ${relativeLogPath}`);
writeLogLine("");

const isWindowsNpmCommand =
  process.platform === "win32" && (command === "npm" || command === "npx");
const executable = useShell
  ? command
  : isWindowsNpmCommand
    ? process.env.ComSpec || "cmd.exe"
    : command;
const commandArgs = isWindowsNpmCommand
  ? ["/d", "/s", "/c", `${command}.cmd`, ...args]
  : args;
const child = spawn(executable, commandArgs, {
  cwd: root,
  env: process.env,
  stdio: ["inherit", "pipe", "pipe"],
  shell: useShell,
});

child.stdout.on("data", (chunk) => writeToTerminalAndLog(process.stdout, chunk));
child.stderr.on("data", (chunk) => writeToTerminalAndLog(process.stderr, chunk));

child.on("error", (error) => {
  writeToTerminalAndLog(process.stderr, `Could not start command: ${error.message}\n`);
  finish(1);
});

child.on("close", (code, signal) => {
  if (signal) {
    writeLogLine(`Command was terminated by signal ${signal}.`);
  }
  finish(code ?? 1);
});
