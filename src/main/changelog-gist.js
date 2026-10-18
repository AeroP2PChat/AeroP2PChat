const CHANGELOG_FILE_PATTERN = /^(\d+)\.(\d+)\.md$/i;
const MAX_CHANGELOG_FILE_BYTES = 256 * 1024;

function parseChangelogFileName(fileName) {
  const match = CHANGELOG_FILE_PATTERN.exec(String(fileName || "").trim());
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor)) return null;
  return {
    fileName: `${major}.${minor}.md`,
    version: `${major}.${minor}.0`,
    versionParts: [major, minor, 0],
  };
}

function compareVersionParts(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return right[index] - left[index];
  }
  return 0;
}

function normalizeChangelogGist(payload) {
  if (!payload || typeof payload !== "object" || !payload.files) {
    throw new Error("GitHub returned an invalid changelog response.");
  }

  const entries = Object.entries(payload.files)
    .map(([fileName, file]) => {
      const parsed = parseChangelogFileName(fileName);
      if (!parsed || !file || file.truncated === true) return null;
      const content = typeof file.content === "string" ? file.content : "";
      if (!content.trim() || Buffer.byteLength(content, "utf8") > MAX_CHANGELOG_FILE_BYTES) {
        return null;
      }
      return {
        fileName: parsed.fileName,
        version: parsed.version,
        versionParts: parsed.versionParts,
        markdown: content,
        rawUrl:
          typeof file.raw_url === "string" &&
          /^https:\/\/gist\.githubusercontent\.com\//i.test(file.raw_url)
            ? file.raw_url
            : "",
      };
    })
    .filter(Boolean)
    .sort((left, right) => compareVersionParts(left.versionParts, right.versionParts))
    .map(({ versionParts, ...entry }) => entry);

  return {
    entries,
    updatedAt: typeof payload.updated_at === "string" ? payload.updated_at : "",
    sourceUrl:
      typeof payload.html_url === "string" && payload.html_url.startsWith("https://gist.github.com/")
        ? payload.html_url
        : "",
  };
}

module.exports = {
  normalizeChangelogGist,
  parseChangelogFileName,
};
