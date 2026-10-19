const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(projectRoot, "src/renderer/index.html"), "utf8");
const renderer = fs.readFileSync(path.join(projectRoot, "src/renderer/index.js"), "utf8");

const steps = [...html.matchAll(/data-welcome-step="(\d+)"/g)].map((match) => Number(match[1]));
const progress = [...html.matchAll(/data-welcome-progress="(\d+)"/g)].map((match) => Number(match[1]));

assert.deepEqual(steps.sort(), [0, 1, 2, 3], "welcome setup must have four ordered steps");
assert.deepEqual(progress.sort(), [0, 1, 2, 3], "welcome progress must match all setup steps");

for (const id of [
  "welcome-close-to-tray",
  "reopen-welcome-screen",
]) {
  assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
}

assert.match(renderer, /function openWelcomeScreen\(\{ force = false \} = \{\}\)/);
assert.match(renderer, /openWelcomeScreen\(\{ force: true \}\)/);
assert.match(renderer, /currentWelcomeStep === 0 && !\(await saveWelcomeNickname\(\)\)/);

console.log("Welcome screen tests passed.");
