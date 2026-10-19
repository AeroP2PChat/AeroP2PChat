const assert = require("node:assert/strict");
const {
  hasMixedInstallerTypes,
  parseUninstallRegistry,
} = require("../src/main/windows-installations");

const output = String.raw`
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\Aero P2P Chat
    DisplayName    REG_SZ    Aero P2P Chat
    UninstallString    REG_SZ    C:\Users\Test\AppData\Local\Programs\aero-p2p-chat\Uninstall Aero P2P Chat.exe

HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\{12345678-1234-1234-1234-123456789ABC}
    DisplayName    REG_SZ    Aero P2P Chat
    WindowsInstaller    REG_DWORD    0x1
    UninstallString    REG_EXPAND_SZ    MsiExec.exe /X{12345678-1234-1234-1234-123456789ABC}

HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\Other
    DisplayName    REG_SZ    Other App
`;

const installations = parseUninstallRegistry(output, "Aero P2P Chat");
assert.deepEqual(
  installations.map((entry) => entry.kind),
  ["legacy", "msi"],
);
assert.equal(hasMixedInstallerTypes(installations), true);
assert.equal(hasMixedInstallerTypes(installations.slice(0, 1)), false);

console.log("Windows installation conflict tests passed.");
