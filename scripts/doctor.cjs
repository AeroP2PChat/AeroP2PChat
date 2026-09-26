const { spawnSync } = require("node:child_process");

const checks = ["node", "npm", "git", "gh", "rpmbuild", "dpkg-deb", "fakeroot"];
let failed = false;

for (const command of checks) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim().split(/\r?\n/)[0];
  const ok = result.status === 0;
  console.log(`${ok ? "[OK]" : "[MISSING]"} ${command}${output ? `: ${output}` : ""}`);
  if (!ok) failed = true;
}

if (process.platform !== "linux") {
  console.error("[ERROR] Local development is configured for Linux.");
  failed = true;
}
if (Number(process.versions.node.split(".")[0]) !== 22) {
  console.error(`[ERROR] Node 22 is required; found ${process.versions.node}.`);
  failed = true;
}
process.exitCode = failed ? 1 : 0;
