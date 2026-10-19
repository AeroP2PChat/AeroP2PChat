const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function openLiveLogConsole(title, logPath, layout = "") {
  if (process.platform !== "win32") return;

  const escapePowerShellString = (value) => String(value).replace(/'/g, "''");
  const layoutCommand = layout
    ? [
        "Add-Type -AssemblyName System.Windows.Forms; Add-Type @'\n",
        "using System; using System.Runtime.InteropServices;\n",
        "public static class AeroDevWindow { [DllImport(\"user32.dll\")] public static extern bool MoveWindow(IntPtr handle, int x, int y, int width, int height, bool repaint); }\n",
        "'@; $area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea; ",
        "$topHeight = [math]::Floor($area.Height / 2); $columnWidth = [math]::Floor($area.Width / 2); ",
        "if ($area.Width -ge 1240 -and $area.Height -ge 880) { $left = $area.X",
        layout === "right" ? " + $columnWidth" : "",
        "; $width = ",
        layout === "right" ? "$area.Width - $columnWidth" : "$columnWidth",
        "; [AeroDevWindow]::MoveWindow((Get-Process -Id $PID).MainWindowHandle, $left, $area.Y + $topHeight, $width, $area.Height - $topHeight, $true) | Out-Null }; ",
      ].join("")
    : "";
  const command = [
    "$host.UI.RawUI.WindowTitle = '",
    escapePowerShellString(title),
    "'; ",
    layoutCommand,
    "Get-Content -LiteralPath '",
    escapePowerShellString(logPath),
    "' -Encoding UTF8 -Wait",
  ].join("");
  const viewer = spawn(
    process.env.ComSpec || "cmd.exe",
    [
      "/d",
      "/c",
      "start",
      String(title).replace(/"/g, "'"),
      "powershell.exe",
      "-NoLogo",
      "-NoProfile",
      "-NoExit",
      "-EncodedCommand",
      Buffer.from(command, "utf16le").toString("base64"),
    ],
    { detached: true, stdio: "ignore", windowsHide: false },
  );
  viewer.unref();
}

function createRuntimeLog(logName, title, layout = "") {
  const safeLogName = String(logName).replace(/[^a-zA-Z0-9._-]/g, "-");
  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
  const logDirectory = path.join(root, ".logs", safeLogName);
  const logPath = path.join(logDirectory, `${timestamp}.log`);

  fs.mkdirSync(logDirectory, { recursive: true });
  fs.writeFileSync(
    logPath,
    `[${new Date().toISOString()}] Aero P2P Chat runtime log: ${title}\n\n`,
    "utf8",
  );
  openLiveLogConsole(title, logPath, layout);
  return { logPath };
}

module.exports = { createRuntimeLog };
