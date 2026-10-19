const { spawnSync } = require("node:child_process");

const checks = ["node", "npm", "git", "gh"];
let failed = false;

for (const command of checks) {
  const windowsCommand =
    process.platform === "win32" && command === "npm";
  const executable = windowsCommand
    ? process.env.ComSpec || "cmd.exe"
    : command;
  const args = windowsCommand
    ? ["/d", "/s", "/c", "npm.cmd", "--version"]
    : ["--version"];
  const result = spawnSync(executable, args, { encoding: "utf8" });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim().split(/\r?\n/)[0];
  const ok = result.status === 0;
  console.log(`${ok ? "[OK]" : "[MISSING]"} ${command}${output ? `: ${output}` : ""}`);
  if (!ok) failed = true;
}

if (process.platform !== "win32") {
  console.error("[ERROR] Local release development is configured for Windows.");
  failed = true;
}
if (Number(process.versions.node.split(".")[0]) !== 22) {
  console.error(`[ERROR] Node 22 is required; found ${process.versions.node}.`);
  failed = true;
}
process.exitCode = failed ? 1 : 0;
