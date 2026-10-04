const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(
  path.join(__dirname, "..", "src", "renderer", "design.css"),
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
assert.match(
  accentWallpaperRule,
  /linear-gradient\(var\(--boot-fill\), var\(--boot-fill\)\)/,
);

console.log("Theme style tests passed.");
