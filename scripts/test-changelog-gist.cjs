const {
  normalizeChangelogGist,
  parseChangelogFileName,
} = require("../src/main/changelog-gist");

function assert(value, message) {
  if (!value) throw new Error(message);
}

assert(parseChangelogFileName("26.65.md")?.version === "26.65.0", "Version mapping failed.");
assert(parseChangelogFileName("1.2.MD")?.version === "1.2.0", "Case-insensitive Markdown mapping failed.");
assert(parseChangelogFileName("26.65.1.md") === null, "Invalid patch filename was accepted.");
assert(parseChangelogFileName("notes.md") === null, "Unversioned filename was accepted.");

const normalized = normalizeChangelogGist({
  updated_at: "2026-10-16T00:00:00Z",
  html_url: "https://gist.github.com/Tenkayro/example",
  files: {
    "26.9.md": { content: "Older" },
    "26.66.md": { content: "Newest" },
    "README.md": { content: "Ignored" },
    "26.70.md": { content: "Too large", truncated: true },
  },
});
assert(normalized.entries.length === 2, "Unexpected changelog files were included.");
assert(normalized.entries[0].version === "26.66.0", "Changelog versions were not sorted newest first.");
assert(normalized.entries[1].fileName === "26.9.md", "Filename normalization failed.");

console.log("GitHub Gist changelog normalization checks passed.");
