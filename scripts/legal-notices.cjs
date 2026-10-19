const { existsSync, readFileSync, readdirSync, realpathSync } = require("node:fs");
const { dirname, join, resolve } = require("node:path");

const BUNDLED_RUNTIME_DEV_PACKAGES = [
  "@fortawesome/fontawesome-free",
  "peerjs",
];

function findPackageDirectory(packageName, startDirectory, projectRoot) {
  let current = resolve(startDirectory);
  const boundary = resolve(projectRoot);
  while (current.startsWith(boundary)) {
    const candidate = join(current, "node_modules", packageName);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function readLicenseText(packageDirectory) {
  const fileName = readdirSync(packageDirectory).find((name) =>
    /^(?:licen[cs]e|copying|notice)(?:[._-]|$)/i.test(name),
  );
  if (fileName) return readFileSync(join(packageDirectory, fileName), "utf8").trim();
  const readmePath = join(packageDirectory, "README.md");
  if (existsSync(readmePath)) {
    const readme = readFileSync(readmePath, "utf8");
    const match = readme.match(/^##\s+Licen[cs]e\s*$([\s\S]*)/im);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "No standalone license text was included in this package.";
}

function normalizeRepositoryUrl(repository) {
  const value = typeof repository === "string" ? repository : repository?.url;
  return String(value || "")
    .replace(/^git\+/, "")
    .replace(/\.git$/, "");
}

function getLegalInformation(projectRoot) {
  const projectMetadata = JSON.parse(
    readFileSync(join(projectRoot, "package.json"), "utf8"),
  );
  const runtimePackageRoots = [
    ...Object.keys(projectMetadata.dependencies || {}),
    ...BUNDLED_RUNTIME_DEV_PACKAGES,
  ];
  const packages = new Map();
  const visit = (packageName, fromDirectory) => {
    const packageDirectory = findPackageDirectory(
      packageName,
      fromDirectory,
      projectRoot,
    );
    if (!packageDirectory) {
      throw new Error(`Runtime license package not found: ${packageName}`);
    }
    const realDirectory = realpathSync(packageDirectory);
    if (packages.has(realDirectory)) return;
    const metadata = JSON.parse(
      readFileSync(join(realDirectory, "package.json"), "utf8"),
    );
    packages.set(realDirectory, {
      name: metadata.name || packageName,
      version: metadata.version || "",
      license: metadata.license || "See license text",
      homepage: metadata.homepage || normalizeRepositoryUrl(metadata.repository),
      text: readLicenseText(realDirectory),
    });
    for (const dependency of Object.keys(metadata.dependencies || {})) {
      visit(dependency, realDirectory);
    }
  };

  for (const packageName of runtimePackageRoots) {
    visit(packageName, projectRoot);
  }

  const electronDirectory = findPackageDirectory("electron", projectRoot, projectRoot);
  if (!electronDirectory) throw new Error("Electron license package not found.");
  const electronMetadata = JSON.parse(
    readFileSync(join(electronDirectory, "package.json"), "utf8"),
  );
  const thirdParty = [
    ...packages.values(),
    {
      name: "Electron",
      version: electronMetadata.version || "",
      license: electronMetadata.license || "MIT",
      homepage: electronMetadata.homepage || "https://www.electronjs.org/",
      text: readLicenseText(electronDirectory),
    },
  ].sort((first, second) =>
    first.name.localeCompare(second.name, undefined, { sensitivity: "base" }),
  );

  return {
    appLicense: readFileSync(join(projectRoot, "LICENSE"), "utf8").trim(),
    audioLicense: readFileSync(
      join(projectRoot, "public/sound/LICENSE.md"),
      "utf8",
    ).trim(),
    thirdParty,
  };
}

module.exports = { getLegalInformation };
