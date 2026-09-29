const { readdirSync } = require("node:fs");
const { extname, resolve } = require("node:path");

function parseRingtoneFileName(fileName) {
  const extension = extname(fileName);
  const rawStem = fileName.slice(0, -extension.length);
  const isDefault = rawStem.toLowerCase().endsWith(".default");
  const stem = isDefault ? rawStem.slice(0, -".default".length) : rawStem;
  const separatorIndex = stem.indexOf("_");
  const clean = (value) => value.replaceAll("_", " ").trim();
  if (separatorIndex <= 0 || separatorIndex === stem.length - 1) {
    return { author: "", name: clean(stem), isDefault };
  }
  return {
    author: clean(stem.slice(0, separatorIndex)),
    name: clean(stem.slice(separatorIndex + 1)),
    isDefault,
  };
}

function getRingtonePresets(projectRoot) {
  const directory = resolve(projectRoot, "public/sound/ringtones");
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) =>
      entry.isFile() && extname(entry.name).toLowerCase() === ".ogg",
    )
    .map((entry) => ({
      id: entry.name,
      ...parseRingtoneFileName(entry.name),
      source: `sound/ringtones/${encodeURIComponent(entry.name)}`,
    }))
    .sort((first, second) =>
      first.name.localeCompare(second.name, undefined, { sensitivity: "base" }) ||
      first.author.localeCompare(second.author, undefined, { sensitivity: "base" }),
    );
}

module.exports = { getRingtonePresets };
