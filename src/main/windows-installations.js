function parseUninstallRegistry(output, expectedDisplayName) {
  const installations = [];
  let current = null;

  const finishEntry = () => {
    if (current?.displayName === expectedDisplayName) {
      const isMsi =
        current.windowsInstaller === "0x1" ||
        /^"?msiexec(?:\.exe)?\b/i.test(current.uninstallString || "");
      installations.push({
        key: current.key,
        kind: isMsi ? "msi" : "legacy",
        uninstallString: current.uninstallString || "",
      });
    }
  };

  for (const line of String(output || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^HKEY_/i.test(trimmed)) {
      finishEntry();
      current = { key: trimmed };
      continue;
    }
    if (!current) continue;
    const value = line.match(/^\s+([^\s]+)\s+REG_[^\s]+\s+(.*)$/i);
    if (!value) continue;
    if (value[1].toLowerCase() === "displayname") {
      current.displayName = value[2].trim();
    } else if (value[1].toLowerCase() === "windowsinstaller") {
      current.windowsInstaller = value[2].trim().toLowerCase();
    } else if (value[1].toLowerCase() === "uninstallstring") {
      current.uninstallString = value[2].trim();
    }
  }
  finishEntry();
  return installations;
}

function hasMixedInstallerTypes(installations) {
  const kinds = new Set(installations.map((entry) => entry.kind));
  return kinds.has("legacy") && kinds.has("msi");
}

module.exports = { hasMixedInstallerTypes, parseUninstallRegistry };
