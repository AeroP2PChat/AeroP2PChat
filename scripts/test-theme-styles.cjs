const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(
  path.join(__dirname, "..", "src", "renderer", "design.css"),
  "utf8",
);
const html = fs.readFileSync(
  path.join(__dirname, "..", "src", "renderer", "index.html"),
  "utf8",
);
const renderer = fs.readFileSync(
  path.join(__dirname, "..", "src", "renderer", "index.js"),
  "utf8",
);

const accentWallpaperRuleStart = css.indexOf(
  "/* Keep the Aero wallpaper tinted",
);
assert.notEqual(accentWallpaperRuleStart, -1);
const accentWallpaperRule = css.slice(accentWallpaperRuleStart);

assert.match(accentWallpaperRule, /\[data-theme="dark"\]/);
assert.match(accentWallpaperRule, /\[data-theme="ultra-dark"\]/);
assert.match(
  accentWallpaperRule,
  /linear-gradient\(var\(--accent\), var\(--accent\)\)/,
);

assert.match(css, /\.participant-avatar-shell\.speaking::after/);
assert.match(css, /@keyframes participant-speaking-ring/);
assert.match(
  css,
  /\.participant-card\.streaming \.participant-avatar-shell/,
);
assert.doesNotMatch(css, /\.message-row\.selectable\.mine\s*{[^}]*flex-direction:\s*row-reverse/s);
assert.match(html, /id="selection-all"/);
assert.match(html, /id="selection-copy"[\s\S]*aria-label="Copy selected messages"/);
assert.match(renderer, /event\.shiftKey && messageSelectionAnchorId/);

console.log("Theme style tests passed.");
