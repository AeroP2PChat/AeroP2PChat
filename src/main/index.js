const {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  Notification,
  Tray,
  clipboard,
  desktopCapturer,
  dialog,
  ipcMain,
  nativeTheme,
  powerMonitor,
  protocol,
  net,
  safeStorage,
  shell,
  session,
  systemPreferences,
  screen,
} = require("electron");
const {
  appendFileSync,
  constants: fsConstants,
  copyFileSync,
  createWriteStream,
  mkdirSync,
  readFileSync,
} = require("node:fs");
const {
  chmod,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  open,
  stat,
  statfs,
  writeFile,
} = require("node:fs/promises");
const { createHash, randomBytes } = require("node:crypto");
const { get } = require("node:https");
const { tmpdir } = require("node:os");
const { basename, dirname, extname, isAbsolute, join, resolve } = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const { format } = require("node:util");
const { pathToFileURL } = require("node:url");
const {
  KEY_BYTES,
  decryptAuthenticatedConfig,
  decryptLegacyConfig,
  encryptAuthenticatedConfig,
  isAuthenticatedConfig,
} = require("./config-crypto");
const projectConfig = __PROJECT_CONFIG__;

const packagedWindowIconPath = join(
  process.resourcesPath,
  process.platform === "win32" ? "app-icon.ico" : "app-icon.png",
);
const bundledWindowIconPath =
  process.platform === "win32"
    ? join(__dirname, "../../assets/app.ico")
    : join(__dirname, "../../assets/linux-icons/512x512.png");
let windowIconPath = app.isPackaged
  ? packagedWindowIconPath
  : bundledWindowIconPath;
let windowIcon = nativeImage.createFromPath(windowIconPath);
if (windowIcon.isEmpty() && windowIconPath !== bundledWindowIconPath) {
  windowIconPath = bundledWindowIconPath;
  windowIcon = nativeImage.createFromPath(windowIconPath);
}
const bundledConnectionBadgePath = join(
  __dirname,
  "../../assets/status/peer-connected.png",
);
const packagedConnectionBadgePath = join(
  process.resourcesPath,
  "peer-connected.png",
);
let connectionBadgeImage = nativeImage.createFromPath(
  app.isPackaged ? packagedConnectionBadgePath : bundledConnectionBadgePath,
);
if (connectionBadgeImage.isEmpty() && app.isPackaged) {
  connectionBadgeImage = nativeImage.createFromPath(bundledConnectionBadgePath);
}
const releaseHost = "github.com";
const releasePathPrefix = `/${projectConfig.repo}/releases/`;
const latestManifestUrl = `https://${releaseHost}${releasePathPrefix}latest/download/latest.yml`;
const changelogFeedUrl =
  "https://zorblock.featurebase.app/api/v1/changelog/feed.rss";
const appDisplayName = projectConfig.app.name;
const userConfigFileName = "config.aero";
const userConfigKeyFileName = "config.key";
const themesDirectoryName = "Themes";
const maxThemeFileSize = 2 * 1024 * 1024;
const customSoundDirectoryName = "Sounds";
const maxCustomSoundBytes = 25 * 1024 * 1024;
const customWallpaperDirectoryName = "Wallpapers";
const maxCustomWallpaperBytes = 8 * 1024 * 1024;
const unsafeReceivedFileExtensions = new Set([
  ".apk", ".app", ".appimage", ".bat", ".bin", ".cmd", ".com",
  ".command", ".cpl", ".deb", ".desktop", ".dll", ".dmg", ".dylib",
  ".elf", ".exe",
  ".gadget", ".hta", ".img", ".iso", ".jar", ".jse", ".js", ".lnk",
  ".msi", ".msp", ".mst", ".php", ".pkg", ".pl", ".ps1", ".psd1",
  ".psm1", ".py", ".pyw", ".rb", ".reg", ".rpm", ".scr", ".sh",
  ".so", ".sys", ".url", ".vb", ".vbe", ".vbs", ".wsf", ".wsh",
]);
const incomingTempFiles = new Map();
let windowsDefenderScanQueue = Promise.resolve();
const incomingFileChunkMaxBytes = 256 * 1024;
const incomingFileDiskReserveBytes = 64 * 1024 * 1024;

protocol.registerSchemesAsPrivileged([
  {
    scheme: "aero-temp",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);
const customWallpaperIds = new Set(["light", "dark", "both"]);
const customSoundIds = new Set([
  "message",
  "ringtone",
  "call-join",
  "call-leave",
  "connected",
]);
const maxOnlineThemeCount = 8;
const maxOnlineThemeSize = 2 * 1024 * 1024;
const updateManifestTimeoutMs = 12000;
const updateManifestRetryDelayMs = 800;
const updateDownloadTimeoutMs = 60000;
const updateSetupDirectoryPrefix = "aero-p2p-setup-";
const defaultSidebarWidth = 360;
const minSidebarWidth = 170;
const maxSidebarWidth = 360;
const defaultMicBoost = 100;
const defaultMicSensitivity = 55;
const defaultMicNoiseReduction = 55;
const defaultMicEqLow = 0;
const defaultMicEqMid = 0;
const defaultMicEqHigh = 0;
const allowMultipleInstances =
  process.env.AERO_CHAT_ALLOW_MULTI_INSTANCE === "1";
const runtimeLogPath = app.isPackaged
  ? ""
  : String(process.env.AERO_CHAT_RUNTIME_LOG_FILE || "").trim();
let diagnosticLogPath = "";
let diagnosticLogBytes = 0;
let diagnosticLogLimitReached = false;
const diagnosticSessionId = randomBytes(6).toString("hex");
const diagnosticBreadcrumbs = [];
const maxDiagnosticLogBytes = 8 * 1024 * 1024;
const maxDiagnosticBreadcrumbs = 120;
const autostartDesktopFileName = projectConfig.linux.autostartDesktopFileName;
const bootAccentPresets = {
  aero: "#147fa6",
  violet: "#7654d9",
  green: "#21875a",
  rose: "#c44d6d",
  amber: "#ad721c",
};
let mainWindow = null;
let toastWindow = null;
let callHealthWindow = null;
let callHealthPayload = null;
let tray = null;
let connectedTrayIcon = null;
let connectionOverlayIcon = null;
let appConfig = {};
let forceQuit = false;
let systemShutdownStarted = false;
let delayedQuitStarted = false;
let delayedQuitTimer = null;
const activeNotifications = new Map();
let lastSystemDndCheck = { checkedAt: 0, enabled: false };
let trayState = {
  peerId: null,
  hasActivePeerConnection: false,
  isMuted: false,
  isDeafened: false,
  status: "online",
  theme: "light",
  autostart: true,
  closeToTray: true,
  debugOfflineMode: false,
  debugSimulateUpdate: false,
  debugBootSimulation: false,
};

function normalizeAccentColor(value) {
  const color = String(value || "").trim().replace(/^#/, "");
  return /^[0-9a-f]{6,8}$/i.test(color)
    ? `#${color.slice(0, 6).toLowerCase()}`
    : "";
}

function writeRuntimeLog(level, args) {
  const critical = ["ERROR", "DETAIL", "SNAPSHOT", "BREADCRUMBS"].includes(
    level,
  );
  if (!diagnosticLogPath || (diagnosticLogLimitReached && !critical)) return;
  try {
    const line = `[${new Date().toISOString()}] [${level}] ${format(...args)}\n`;
    const nextBytes = Buffer.byteLength(line);
    if (!critical && diagnosticLogBytes + nextBytes > maxDiagnosticLogBytes) {
      appendFileSync(
        diagnosticLogPath,
        `[${new Date().toISOString()}] [WARN] Log size limit reached; further routine logging stopped.\n`,
        "utf8",
      );
      diagnosticLogLimitReached = true;
      return;
    }
    appendFileSync(
      diagnosticLogPath,
      line,
      "utf8",
    );
    diagnosticLogBytes += nextBytes;
  } catch {
    // Diagnostics must never interfere with the app itself.
  }
}

function sanitizeDiagnosticText(value, maxLength = 4000) {
  let text = String(value ?? "");
  try {
    const homePath = app.getPath("home");
    if (homePath) text = text.split(homePath).join("<home>");
  } catch {
    // app paths may be unavailable during very early startup failures.
  }
  text = text.replace(/aero-(?:[a-f0-9]{16}|[a-f0-9]{32})/gi, "aero-<redacted>");
  return text.slice(0, maxLength);
}

function sanitizeDiagnosticData(value, depth = 0) {
  if (depth > 3) return "[depth limited]";
  if (value === null || value === undefined) return value;
  if (["boolean", "number"].includes(typeof value)) return value;
  if (typeof value === "string") return sanitizeDiagnosticText(value, 1000);
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeDiagnosticData(item, depth + 1));
  }
  if (typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value).slice(0, 30)) {
      if (/(token|secret|password|private|identity.?id|peer.?id|device.?id|group.?id|message.?text)/i.test(key)) {
        result[key] = "[redacted]";
      } else {
        result[key] = sanitizeDiagnosticData(item, depth + 1);
      }
    }
    return result;
  }
  return sanitizeDiagnosticText(value, 1000);
}

function recordDiagnosticEvent(scope, event, data = {}) {
  const entry = {
    at: new Date().toISOString(),
    scope: sanitizeDiagnosticText(scope, 80),
    event: sanitizeDiagnosticText(event, 160),
    data: sanitizeDiagnosticData(data),
  };
  diagnosticBreadcrumbs.push(entry);
  if (diagnosticBreadcrumbs.length > maxDiagnosticBreadcrumbs) {
    diagnosticBreadcrumbs.shift();
  }
  writeRuntimeLog("EVENT", [JSON.stringify(entry)]);
}

function getDiagnosticSnapshot() {
  const memory = process.memoryUsage();
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  return sanitizeDiagnosticData({
    sessionId: diagnosticSessionId,
    uptimeSeconds: Math.round(process.uptime()),
    appVersion: app.getVersion(),
    packaged: app.isPackaged,
    platform: process.platform,
    architecture: process.arch,
    osVersion: process.getSystemVersion?.() || "unknown",
    linuxSession:
      process.platform === "linux"
        ? process.env.XDG_SESSION_TYPE || (process.env.WAYLAND_DISPLAY ? "wayland" : "unknown")
        : undefined,
    desktop:
      process.platform === "linux"
        ? process.env.XDG_CURRENT_DESKTOP || process.env.DESKTOP_SESSION || "unknown"
        : undefined,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
    memoryMiB: {
      rss: Math.round(memory.rss / 1048576),
      heapUsed: Math.round(memory.heapUsed / 1048576),
      external: Math.round(memory.external / 1048576),
    },
    window: win
      ? {
          visible: win.isVisible(),
          focused: win.isFocused(),
          minimized: win.isMinimized(),
          maximized: win.isMaximized(),
          bounds: win.getBounds(),
        }
      : null,
    appState: {
      connected: Boolean(trayState?.hasActivePeerConnection),
      muted: Boolean(trayState?.isMuted),
      deafened: Boolean(trayState?.isDeafened),
      presence: trayState?.status || "unknown",
      closeToTray: appConfig.appSettings?.closeToTray !== false,
    },
    gpu: app.isReady() ? app.getGPUFeatureStatus() : undefined,
  });
}

function normalizeDiagnosticError(error) {
  if (error instanceof Error) {
    return {
      name: String(error.name || "Error").slice(0, 120),
      message: sanitizeDiagnosticText(error.message || "Unknown error", 2000),
      stack: sanitizeDiagnosticText(error.stack || "", 12000),
    };
  }
  return {
    name: "Error",
    message: sanitizeDiagnosticText(error || "Unknown error", 2000),
    stack: "",
  };
}

function writeDiagnosticEvent(kind, error, details = {}) {
  const normalized = normalizeDiagnosticError(error);
  writeRuntimeLog("ERROR", [
    `${kind}: ${normalized.name}: ${normalized.message}\n${normalized.stack}`,
  ]);
  if (Object.keys(details).length) {
    writeRuntimeLog("DETAIL", [JSON.stringify(sanitizeDiagnosticData(details))]);
  }
  writeRuntimeLog("SNAPSHOT", [JSON.stringify(getDiagnosticSnapshot())]);
  writeRuntimeLog("BREADCRUMBS", [JSON.stringify(diagnosticBreadcrumbs.slice(-40))]);
  return normalized;
}

let diagnosticDialogOpen = false;
let fatalErrorHandling = false;
let lastDiagnosticFingerprint = "";
let lastDiagnosticAt = 0;

function isDuplicateDiagnostic(kind, message) {
  const fingerprint = `${kind}:${message}`;
  const now = Date.now();
  const duplicate =
    fingerprint === lastDiagnosticFingerprint && now - lastDiagnosticAt < 5000;
  lastDiagnosticFingerprint = fingerprint;
  lastDiagnosticAt = now;
  return duplicate;
}

async function saveDiagnosticLogCopy(parent = null) {
  if (!diagnosticLogPath) return;
  const options = {
    title: "Save Aero diagnostic log",
    defaultPath: join(
      app.getPath("documents"),
      `Aero-diagnostic-${new Date().toISOString().replace(/[.:]/g, "-")}.log`,
    ),
    filters: [{ name: "Log file", extensions: ["log"] }],
  };
  const result = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options);
  if (!result.canceled && result.filePath) {
    await copyFile(diagnosticLogPath, result.filePath);
  }
}

async function showDiagnosticDialog({ kind, error, details = {}, canReload = false }) {
  const normalized = writeDiagnosticEvent(kind, error, details);
  if (
    diagnosticDialogOpen ||
    isDuplicateDiagnostic(kind, normalized.message) ||
    !app.isReady()
  ) {
    return;
  }

  diagnosticDialogOpen = true;
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  try {
    const options = {
      type: "error",
      title: `${appDisplayName} encountered a problem`,
      message: `${appDisplayName} encountered an unexpected problem.`,
      detail: `${normalized.message}\n\nA diagnostic log was created at:\n${diagnosticLogPath}`,
      buttons: [canReload ? "Reload Aero" : "Continue", "Open log", "Save log", "Close Aero"],
      defaultId: 0,
      cancelId: 3,
      noLink: true,
    };
    const result = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options);

    if (result.response === 0 && canReload && parent && !parent.isDestroyed()) {
      parent.reload();
    } else if (result.response === 1) {
      const openError = await shell.openPath(diagnosticLogPath);
      if (openError) shell.showItemInFolder(diagnosticLogPath);
    } else if (result.response === 2) {
      await saveDiagnosticLogCopy(parent);
    } else if (result.response === 3) {
      forceQuit = true;
      app.quit();
    }
  } catch (dialogError) {
    writeDiagnosticEvent("Diagnostic dialog failed", dialogError);
  } finally {
    diagnosticDialogOpen = false;
  }
}

function handleFatalMainError(error) {
  if (fatalErrorHandling) {
    app.exit(1);
    return;
  }
  fatalErrorHandling = true;
  const normalized = writeDiagnosticEvent("Main process crash", error);
  let response = 3;
  if (app.isReady()) {
    response = dialog.showMessageBoxSync({
      type: "error",
      title: `${appDisplayName} crashed`,
      message: `${appDisplayName} must close after an unexpected error.`,
      detail: `${normalized.message}\n\nDiagnostic log:\n${diagnosticLogPath}`,
      buttons: ["Restart Aero", "Open log", "Save log", "Close"],
      defaultId: 0,
      cancelId: 3,
      noLink: true,
    });
  } else {
    dialog.showErrorBox(
      `${appDisplayName} crashed`,
      `${normalized.message}\n\nDiagnostic log:\n${diagnosticLogPath}`,
    );
  }

  if (response === 0) {
    app.relaunch();
  } else if (response === 1) {
    void shell.openPath(diagnosticLogPath);
  } else if (response === 2) {
    const destination = dialog.showSaveDialogSync({
      title: "Save Aero diagnostic log",
      defaultPath: join(app.getPath("documents"), `Aero-diagnostic-${Date.now()}.log`),
      filters: [{ name: "Log file", extensions: ["log"] }],
    });
    if (destination) {
      try {
        copyFileSync(diagnosticLogPath, destination);
      } catch {
        // The original log remains available in userData.
      }
    }
  }
  forceQuit = true;
  app.exit(1);
}

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.name = projectConfig.app.name || "Aero P2P Chat";
process.env.AERO_CHAT_IS_PACKAGED = app.isPackaged ? "1" : "0";
// Keep the runtime window identity aligned with the installed launcher.
if (process.platform === "win32") {
  app.setAppUserModelId(projectConfig.app.id);
}
if (process.platform === "linux") {
  app.commandLine.appendSwitch("class", projectConfig.app.id);
}

let legacyPackagedUserDataPath = "";
if (process.env.AERO_CHAT_USER_DATA_DIR) {
  app.setPath("userData", process.env.AERO_CHAT_USER_DATA_DIR);
} else if (!app.isPackaged) {
  app.setPath("userData", join(process.cwd(), ".dev-data", "instance-0"));
} else {
  legacyPackagedUserDataPath = app.getPath("userData");
  const vendorUserDataPath = join(
    app.getPath("appData"),
    "zorblock",
    "userData",
    appDisplayName,
  );
  app.setPath("userData", vendorUserDataPath);

  if (resolve(legacyPackagedUserDataPath) === resolve(vendorUserDataPath)) {
    legacyPackagedUserDataPath = "";
  }
}

const diagnosticLogDirectory = join(app.getPath("userData"), "Logs");
mkdirSync(diagnosticLogDirectory, { recursive: true });
diagnosticLogPath =
  runtimeLogPath ||
  join(
    diagnosticLogDirectory,
    `aero-${new Date().toISOString().replace(/[.:]/g, "-")}.log`,
  );
const diagnosticHeader =
  `[${new Date().toISOString()}] ${appDisplayName} ${app.getVersion()} · ` +
  `${process.platform} ${process.arch}\n`;
appendFileSync(diagnosticLogPath, diagnosticHeader, "utf8");
diagnosticLogBytes = Buffer.byteLength(diagnosticHeader);

for (const level of ["debug", "info", "log", "warn", "error"]) {
  const writeToConsole = console[level].bind(console);
  console[level] = (...args) => {
    writeRuntimeLog(level, args);
    writeToConsole(...args);
  };
}

recordDiagnosticEvent("app", "session-start", {
  sessionId: diagnosticSessionId,
  version: app.getVersion(),
  packaged: app.isPackaged,
  platform: process.platform,
  architecture: process.arch,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
});

process.on("uncaughtException", handleFatalMainError);
process.on("unhandledRejection", (reason) => {
  const showError = () =>
    showDiagnosticDialog({
      kind: "Unhandled main-process promise rejection",
      error: reason,
    });
  if (app.isReady()) {
    void showError();
  } else {
    void app.whenReady().then(showError);
  }
});

async function cleanupOldDiagnosticLogs() {
  try {
    const entries = await readdir(diagnosticLogDirectory, {
      withFileTypes: true,
    });
    const logs = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /^aero-.*\.log$/i.test(entry.name))
        .map(async (entry) => {
          const path = join(diagnosticLogDirectory, entry.name);
          return { path, modified: (await stat(path)).mtimeMs };
        }),
    );
    logs.sort((left, right) => right.modified - left.modified);
    await Promise.all(
      logs.slice(12).map((entry) => rm(entry.path, { force: true })),
    );
  } catch {
    // Log cleanup is best effort only.
  }
}

if (!allowMultipleInstances) {
  const hasSingleInstanceLock = app.requestSingleInstanceLock();

  if (!hasSingleInstanceLock) {
    app.quit();
  } else {
    app.on("second-instance", () => {
      if (!mainWindow) {
        return;
      }

      showMainWindow();
    });
  }
}

function getConfigPath() {
  return join(app.getPath("userData"), userConfigFileName);
}

function getThemesPath() {
  return join(app.getPath("userData"), themesDirectoryName);
}

function getCustomSoundsPath() {
  return join(app.getPath("userData"), customSoundDirectoryName);
}

function getCustomSoundPath(soundId) {
  return customSoundIds.has(soundId)
    ? join(getCustomSoundsPath(), `${soundId}.ogg`)
    : "";
}

function getCustomWallpapersPath() {
  return join(app.getPath("userData"), customWallpaperDirectoryName);
}

function getCustomWallpaperPath(wallpaperId) {
  return customWallpaperIds.has(wallpaperId)
    ? join(getCustomWallpapersPath(), `${wallpaperId}.webp`)
    : "";
}

function isCustomSoundRequest(event) {
  return BrowserWindow.fromWebContents(event.sender) === mainWindow;
}

function toCustomSoundBuffer(value) {
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

function isOggOpus(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= 32 &&
    buffer.subarray(0, 4).equals(Buffer.from("OggS")) &&
    buffer.subarray(0, 128).includes(Buffer.from("OpusHead"))
  );
}

function isWebpImage(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= 16 &&
    buffer.subarray(0, 4).equals(Buffer.from("RIFF")) &&
    buffer.subarray(8, 12).equals(Buffer.from("WEBP"))
  );
}

function sanitizeReceivedFileName(value) {
  const raw = basename(String(value || "file").normalize("NFKC"));
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/gu, "_")
    .replace(/[. ]+$/u, "")
    .trim();
  const safe = cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : "file";
  const extension = extname(safe).slice(0, 21);
  return safe.length <= 180
    ? safe
    : `${safe.slice(0, 180 - extension.length)}${extension}`;
}

function hasExecutableFileSignature(buffer) {
  if (!Buffer.isBuffer(buffer)) return true;
  if (buffer.length >= 2 && buffer.subarray(0, 2).equals(Buffer.from("MZ"))) return true;
  if (buffer.length < 4) return false;
  const hex = buffer.subarray(0, 4).toString("hex");
  return (
    hex === "7f454c46" ||
    ["feedface", "feedfacf", "cefaedfe", "cffaedfe", "cafebabe"].includes(hex)
  );
}

async function getUniqueReceivedFilePath(directory, fileName) {
  const safeName = sanitizeReceivedFileName(fileName);
  const extension = extname(safeName);
  const stem = safeName.slice(0, safeName.length - extension.length) || "file";
  for (let index = 0; index < 10000; index += 1) {
    const candidate = join(
      directory,
      index === 0 ? safeName : `${stem} (${index})${extension}`,
    );
    if (!(await pathExists(candidate))) return candidate;
  }
  throw new Error("Could not create a unique file name.");
}

function runSecurityScanner(command, args, timeoutMs = 120000) {
  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, output: output.slice(-12000) });
    };
    const capture = (chunk) => {
      output += String(chunk || "");
      if (output.length > 24000) output = output.slice(-12000);
    };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    child.once("error", (error) =>
      finish({ unavailable: error?.code === "ENOENT", error: error?.message || "Scanner failed." }),
    );
    child.once("close", (code) => finish({ code }));
    const timer = setTimeout(() => {
      child.kill();
      finish({ error: "The local antivirus scan timed out." });
    }, timeoutMs);
  });
}

async function findWindowsDefenderScanner() {
  const candidates = [];
  const programData = process.env.ProgramData;
  if (programData) {
    const platformDirectory = join(
      programData,
      "Microsoft",
      "Windows Defender",
      "Platform",
    );
    try {
      const versions = await readdir(platformDirectory, { withFileTypes: true });
      versions
        .filter((entry) => entry.isDirectory())
        .sort((left, right) => right.name.localeCompare(left.name, undefined, { numeric: true }))
        .forEach((entry) => candidates.push(join(platformDirectory, entry.name, "MpCmdRun.exe")));
    } catch {
      // Defender may be disabled or managed by another security product.
    }
  }
  for (const base of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]) {
    if (base) candidates.push(join(base, "Windows Defender", "MpCmdRun.exe"));
  }
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  return "";
}

async function scanReceivedFile(filePath) {
  if (process.platform === "win32") {
    const runDefenderScan = async () => {
      const scanner = await findWindowsDefenderScanner();
      if (!scanner) return { status: "unavailable", engine: "" };
      const result = await runSecurityScanner(scanner, [
        "-Scan",
        "-ScanType",
        "3",
        "-File",
        filePath,
        "-DisableRemediation",
      ]);
      if (result.code === 0) {
        return { status: "clean", engine: "Microsoft Defender" };
      }
      const output = String(result.output || "");
      const threatDetected =
        /(?:found|detected)\s+[1-9]\d*\s+threats?/i.test(output) ||
        /threats?\s+(?:was\s+|were\s+)?(?:found|detected)/i.test(output) ||
        /(?:malware|virus)\s+(?:was\s+)?detected/i.test(output) ||
        /infected(?:\s+files?)?\s*:\s*[1-9]\d*/i.test(output) ||
        /\bfile\s+is\s+infected\b/i.test(output);
      if (threatDetected) {
        return { status: "blocked", engine: "Microsoft Defender" };
      }
      return {
        status: "error",
        engine: "Microsoft Defender",
        error: result.error || "Microsoft Defender could not complete the scan.",
      };
    };
    const queuedScan = windowsDefenderScanQueue.then(
      runDefenderScan,
      runDefenderScan,
    );
    windowsDefenderScanQueue = queuedScan.then(
      () => undefined,
      () => undefined,
    );
    return queuedScan;
  }

  if (process.platform === "linux") {
    const result = await runSecurityScanner("clamscan", [
      "--no-summary",
      "--infected",
      filePath,
    ]);
    if (result.unavailable) return { status: "unavailable", engine: "" };
    if (result.code === 0) return { status: "clean", engine: "ClamAV" };
    if (result.code === 1) return { status: "blocked", engine: "ClamAV" };
    return { status: "error", engine: "ClamAV", error: result.error || "ClamAV could not complete the scan." };
  }

  return { status: "unavailable", engine: "" };
}

function getIncomingTempDirectory() {
  return join(app.getPath("userData"), ".temp");
}

async function cleanupIncomingTempDirectory() {
  const activeEntries = Array.from(incomingTempFiles.values());
  incomingTempFiles.clear();
  await Promise.all(activeEntries.map((entry) => entry.handle?.close().catch(() => {})));
  const directory = getIncomingTempDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries.map((entry) => rm(join(directory, entry.name), {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  }).catch(() => {})));
}

async function prepareIncomingFile(event, details = {}) {
  if (!isCustomSoundRequest(event)) return { ok: false, error: "Unauthorized temporary file request." };
  const id = String(details.id || "");
  const providedName = String(details.name || "");
  const name = sanitizeReceivedFileName(providedName);
  const size = Number(details.size);
  const sha256 = String(details.sha256 || "").toLowerCase();
  if (
    !/^file-[a-f0-9]{24}$/.test(id) || providedName !== name ||
    !Number.isSafeInteger(size) || size < 1 || !/^[a-f0-9]{64}$/.test(sha256)
  ) {
    return { ok: false, blocked: true, error: "Invalid file metadata." };
  }
  const directory = getIncomingTempDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const disk = await statfs(directory);
  const available = Number(disk.bavail) * Number(disk.bsize);
  if (Number.isFinite(available) && available < size + incomingFileDiskReserveBytes) {
    return { ok: false, noSpace: true, error: "Not enough free disk space is available for this file." };
  }
  const tempRef = randomBytes(18).toString("hex");
  const filePath = join(directory, `${tempRef}.part`);
  try {
    const handle = await open(filePath, "wx", 0o600);
    incomingTempFiles.set(tempRef, {
      handle,
      path: filePath,
      name,
      mimeType: String(details.mimeType || "application/octet-stream").slice(0, 160),
      size,
      sha256,
      hash: createHash("sha256"),
      received: 0,
      finalized: false,
    });
    return { ok: true, tempRef };
  } catch (error) {
    return { ok: false, error: error?.message || "The temporary file could not be created." };
  }
}

async function appendIncomingFile(event, tempRefValue, data) {
  if (!isCustomSoundRequest(event)) return { ok: false, error: "Unauthorized temporary file request." };
  const tempRef = String(tempRefValue || "");
  const entry = incomingTempFiles.get(tempRef);
  const buffer = toCustomSoundBuffer(data);
  if (
    !entry || entry.finalized || !buffer?.length || buffer.length > incomingFileChunkMaxBytes ||
    entry.received + buffer.length > entry.size
  ) {
    return { ok: false, blocked: true, error: "Invalid temporary file data." };
  }
  try {
    await entry.handle.write(buffer, 0, buffer.length, entry.received);
    entry.hash.update(buffer);
    entry.received += buffer.length;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || "The temporary file could not be written." };
  }
}

async function finalizeIncomingFile(event, tempRefValue) {
  if (!isCustomSoundRequest(event)) return { ok: false, error: "Unauthorized temporary file request." };
  const tempRef = String(tempRefValue || "");
  const entry = incomingTempFiles.get(tempRef);
  if (!entry || entry.finalized || entry.received !== entry.size) {
    return { ok: false, error: "The temporary file is incomplete." };
  }
  try {
    await entry.handle.sync();
    await entry.handle.close();
    entry.handle = null;
    const digest = entry.hash.digest("hex");
    entry.hash = null;
    if (digest !== entry.sha256) {
      await rm(entry.path, { force: true });
      incomingTempFiles.delete(tempRef);
      return { ok: false, blocked: true, error: "SHA-256 mismatch." };
    }
    const reader = await open(entry.path, "r");
    const header = Buffer.alloc(Math.min(64 * 1024, entry.size));
    await reader.read(header, 0, header.length, 0);
    await reader.close();
    if (
      hasExecutableFileSignature(header) &&
      !unsafeReceivedFileExtensions.has(extname(entry.name).toLowerCase())
    ) {
      await rm(entry.path, { force: true });
      incomingTempFiles.delete(tempRef);
      return {
        ok: false,
        blocked: true,
        error: "Executable content is disguised as a different file type.",
      };
    }
    entry.finalized = true;
    return {
      ok: true,
      size: entry.size,
      header: header.buffer.slice(header.byteOffset, header.byteOffset + header.byteLength),
    };
  } catch (error) {
    return { ok: false, error: error?.message || "The temporary file could not be finalized." };
  }
}

async function releaseIncomingFile(event, tempRefValue) {
  if (!isCustomSoundRequest(event)) return { ok: false };
  const tempRef = String(tempRefValue || "");
  const entry = incomingTempFiles.get(tempRef);
  incomingTempFiles.delete(tempRef);
  await entry?.handle?.close().catch(() => {});
  if (entry?.path) await rm(entry.path, { force: true }).catch(() => {});
  return { ok: true };
}

async function scanIncomingFile(event, tempRefValue) {
  if (!isCustomSoundRequest(event)) {
    return { ok: false, error: "Unauthorized file scan request." };
  }
  const tempRef = String(tempRefValue || "");
  const entry = incomingTempFiles.get(tempRef);
  if (!entry?.finalized || !entry.path) {
    return { ok: false, error: "The temporary file is unavailable." };
  }

  const scan = await scanReceivedFile(entry.path);
  return {
    ok: scan.status === "clean",
    blocked: scan.status === "blocked",
    unavailable: scan.status === "unavailable",
    scanStatus: scan.status,
    scanner: scan.engine || "",
    error: scan.error || "",
  };
}

function getIncomingFileUrl(event, tempRefValue) {
  if (!isCustomSoundRequest(event)) return "";
  const tempRef = String(tempRefValue || "");
  const entry = incomingTempFiles.get(tempRef);
  return entry?.finalized ? `aero-temp://file/${tempRef}` : "";
}

async function chooseReceivedFileDirectory(event) {
  if (!isCustomSoundRequest(event)) {
    return { ok: false, error: "Unauthorized folder request." };
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose file download folder",
    defaultPath: app.getPath("downloads"),
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
  return { ok: true, path: resolve(result.filePaths[0]) };
}

async function saveReceivedFile(event, details = {}) {
  if (!isCustomSoundRequest(event)) {
    return { ok: false, error: "Unauthorized file save request." };
  }
  const tempEntry = incomingTempFiles.get(String(details.tempRef || ""));
  const buffer = tempEntry ? null : toCustomSoundBuffer(details.data);
  const providedFileName = String(details.name || "");
  const fileName = sanitizeReceivedFileName(providedFileName);
  const extension = extname(fileName).toLowerCase();
  const nameParts = fileName.toLowerCase().split(".").filter(Boolean);
  const expectedSha256 = String(details.sha256 || "").toLowerCase();
  if (
    (!tempEntry && (!buffer || buffer.length < 1)) ||
    (tempEntry && (!tempEntry.finalized || tempEntry.name !== fileName || tempEntry.size < 1)) ||
    providedFileName !== fileName ||
    /[\u202a-\u202e\u2066-\u2069]/u.test(fileName) ||
    (nameParts.length >= 3 && unsafeReceivedFileExtensions.has(`.${nameParts.at(-2)}`)) ||
    (!tempEntry && hasExecutableFileSignature(buffer) && !unsafeReceivedFileExtensions.has(extension)) ||
    !/^[a-f0-9]{64}$/.test(expectedSha256) ||
    (tempEntry ? tempEntry.sha256 : createHash("sha256").update(buffer).digest("hex")) !== expectedSha256
  ) {
    return { ok: false, blocked: true, error: "The file failed Aero's security checks." };
  }

  const mode = ["ask", "downloads", "custom"].includes(details.mode)
    ? details.mode
    : "ask";
  let targetPath = "";
  let allowOverwrite = false;
  if (mode === "ask") {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Save received file",
      defaultPath: join(app.getPath("downloads"), fileName),
      buttonLabel: "Save",
      properties: ["showOverwriteConfirmation", "dontAddToRecent"],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    targetPath = resolve(result.filePath);
    allowOverwrite = true;
  } else {
    let directory = app.getPath("downloads");
    if (
      mode === "custom" &&
      typeof details.directory === "string" &&
      isAbsolute(details.directory)
    ) {
      directory = resolve(details.directory);
    }
    await mkdir(directory, { recursive: true });
    targetPath = await getUniqueReceivedFilePath(directory, fileName);
  }

  const quarantineDirectory = tempEntry ? "" : await mkdtemp(join(tmpdir(), "aero-p2p-received-"));
  const quarantinePath = tempEntry?.path || join(quarantineDirectory, "quarantine.bin");
  try {
    if (!tempEntry) await writeFile(quarantinePath, buffer, { flag: "wx", mode: 0o600 });
    const scan = await scanReceivedFile(quarantinePath);
    if (scan.status === "blocked") {
      return { ok: false, blocked: true, scanner: scan.engine, error: `${scan.engine} blocked this file.` };
    }
    if (scan.status === "error") {
      return { ok: false, scanError: true, scanner: scan.engine, error: scan.error };
    }
    await mkdir(dirname(targetPath), { recursive: true });
    let savedPath = targetPath;
    let renamedDueToLock = false;
    try {
      await copyFile(
        quarantinePath,
        savedPath,
        allowOverwrite ? 0 : fsConstants.COPYFILE_EXCL,
      );
    } catch (error) {
      if (!allowOverwrite || !["EBUSY", "EACCES", "EPERM"].includes(error?.code)) throw error;
      savedPath = await getUniqueReceivedFilePath(dirname(targetPath), basename(targetPath));
      await copyFile(quarantinePath, savedPath, fsConstants.COPYFILE_EXCL);
      renamedDueToLock = true;
    }
    return {
      ok: true,
      path: savedPath,
      renamedDueToLock,
      scanner: scan.engine,
      scanStatus: scan.status,
    };
  } catch (error) {
    return { ok: false, error: error?.message || "The file could not be saved." };
  } finally {
    if (quarantineDirectory) await rm(quarantineDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

function isThemeFileName(fileName) {
  return (
    typeof fileName === "string" &&
    fileName.length > 0 &&
    fileName === basename(fileName) &&
    fileName.toLowerCase().endsWith(".css")
  );
}

function normalizeOnlineThemeUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:" || url.username || url.password) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeExternalLinkUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeOnlineThemeUrls(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeOnlineThemeUrl).filter(Boolean))].slice(
    0,
    maxOnlineThemeCount,
  );
}

function fetchOnlineThemeCss(rawUrl, redirects = 0) {
  const url = normalizeOnlineThemeUrl(rawUrl);
  if (!url) {
    return Promise.reject(new Error("Only valid HTTPS theme URLs are allowed."));
  }
  return new Promise((resolve, reject) => {
    const request = get(url, { headers: { Accept: "text/css,*/*;q=0.1" } }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        if (redirects >= 4) {
          reject(new Error("Too many theme URL redirects."));
          return;
        }
        fetchOnlineThemeCss(new URL(response.headers.location, url).toString(), redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Theme request failed (${response.statusCode || "unknown"}).`));
        return;
      }
      const length = Number(response.headers["content-length"] || 0);
      if (length > maxOnlineThemeSize) {
        response.resume();
        reject(new Error("Theme file is too large."));
        return;
      }
      let size = 0;
      const chunks = [];
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxOnlineThemeSize) {
          request.destroy(new Error("Theme file is too large."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      response.on("error", reject);
    });
    request.setTimeout(12000, () => request.destroy(new Error("Theme request timed out.")));
    request.on("error", reject);
  });
}

function parseThemeMetadata(css, fileName) {
  const header = String(css || "").slice(0, 8192);
  const metadataComment = header.match(/\/\*[\s\S]*?\*\//)?.[0] || header;
  const readField = (field) => {
    const match = metadataComment.match(
      new RegExp(`@${field}\\s+([^\\r\\n*]+)`, "i"),
    );
    return match?.[1]?.trim() || "";
  };
  const fallbackName = fileName.replace(/\.css$/i, "");
  return {
    id: fileName,
    name: readField("name") || fallbackName,
    author: readField("author"),
    version: readField("version"),
    description: readField("description"),
  };
}

async function listThemes() {
  const themesPath = getThemesPath();
  await mkdir(themesPath, { recursive: true });
  const entries = await readdir(themesPath, { withFileTypes: true });
  const themes = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isThemeFileName(entry.name)) continue;
    const themePath = join(themesPath, entry.name);
    try {
      const details = await stat(themePath);
      if (details.size > maxThemeFileSize) continue;
      const css = await readFile(themePath, "utf8");
      themes.push(parseThemeMetadata(css, entry.name));
    } catch {
      // Ignore a theme that is currently being edited or cannot be read.
    }
  }
  return themes.sort((left, right) => left.name.localeCompare(right.name));
}

async function openThemesFolder() {
  const themesPath = getThemesPath();
  await mkdir(themesPath, { recursive: true });
  const error = await shell.openPath(themesPath);
  return error ? { ok: false, error } : { ok: true, path: themesPath };
}

async function loadTheme(fileName) {
  if (!isThemeFileName(fileName)) {
    return { ok: false, error: "Invalid theme file." };
  }
  const themePath = join(getThemesPath(), fileName);
  try {
    const details = await stat(themePath);
    if (!details.isFile() || details.size > maxThemeFileSize) {
      return { ok: false, error: "Theme file is unavailable or too large." };
    }
    const css = await readFile(themePath, "utf8");
    return { ok: true, css, metadata: parseThemeMetadata(css, fileName) };
  } catch {
    return { ok: false, error: "Theme file could not be read." };
  }
}

function getConfigBackupPath() {
  return `${getConfigPath()}.bak`;
}

function getConfigKeyPath() {
  return join(app.getPath("userData"), userConfigKeyFileName);
}

function getConfigKeyBackupPath() {
  return `${getConfigKeyPath()}.bak`;
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function migratePackagedUserData() {
  if (!legacyPackagedUserDataPath) {
    return;
  }

  const targetPath = app.getPath("userData");
  if (
    (await pathExists(targetPath)) ||
    !(await pathExists(legacyPackagedUserDataPath))
  ) {
    return;
  }

  try {
    await mkdir(dirname(targetPath), { recursive: true });
    await cp(legacyPackagedUserDataPath, targetPath, {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
    console.log(`Migrated user data to ${targetPath}`);
  } catch (error) {
    console.warn(
      `Could not migrate existing user data to ${targetPath}.`,
      error.message,
    );
  }
}

function getDefaultAppSettings() {
  return {
    welcomeScreen: true,
    autostart: true,
    startHidden: true,
    closeToTray: true,
    autoDownloadUpdates: false,
    showUpdateModal: true,
    readReceipts: true,
    fileAutoDownloadTrusted: false,
    fileDownloadMode: "ask",
    fileDownloadDirectory: "",
    fileDownloadDirectoryLabel: "",
    feedbackEnabled: true,
    sidebarWidth: defaultSidebarWidth,
    theme: "system",
    customTheme: "",
    presenceStatus: "online",
  };
}

function getDefaultAudioSettings() {
  return {
    inputDeviceId: "default",
    cameraDeviceId: "default",
    outputDeviceId: "default",
    remoteVolume: 100,
    micMode: "auto",
    micSensitivity: defaultMicSensitivity,
    micBoost: defaultMicBoost,
    micNoiseReduction: defaultMicNoiseReduction,
    micEqLow: defaultMicEqLow,
    micEqMid: defaultMicEqMid,
    micEqHigh: defaultMicEqHigh,
    micProfile: "voice-isolation",
  };
}

function normalizeConfig(config = {}) {
  const settings = {
    ...getDefaultAppSettings(),
    ...(config.appSettings && typeof config.appSettings === "object"
      ? config.appSettings
      : {}),
  };

  config.appSettings = {
    ...settings,
    // Missing means setup has never been completed. This also onboards
    // existing installations once when they first receive this setting.
    welcomeScreen: settings.welcomeScreen !== false,
    autostart: Boolean(settings.autostart),
    startHidden: Boolean(settings.startHidden),
    closeToTray: settings.closeToTray !== false,
    autoDownloadUpdates: Boolean(settings.autoDownloadUpdates),
    showUpdateModal: settings.showUpdateModal !== false,
    readReceipts: settings.readReceipts !== false,
    fileAutoDownloadTrusted: Boolean(settings.fileAutoDownloadTrusted),
    fileDownloadMode: ["ask", "downloads", "custom"].includes(
      settings.fileDownloadMode,
    )
      ? settings.fileDownloadMode
      : "ask",
    fileDownloadDirectory:
      typeof settings.fileDownloadDirectory === "string"
        ? settings.fileDownloadDirectory.slice(0, 1024)
        : "",
    fileDownloadDirectoryLabel:
      typeof settings.fileDownloadDirectoryLabel === "string"
        ? settings.fileDownloadDirectoryLabel.slice(0, 240)
        : "",
    feedbackEnabled: settings.feedbackEnabled !== false,
    presenceStatus: ["online", "dnd", "offline"].includes(
      settings.presenceStatus,
    )
      ? settings.presenceStatus
      : "online",
    theme: ["system", "light", "dark", "ultra-dark"].includes(settings.theme)
      ? settings.theme
      : "system",
    customTheme: isThemeFileName(settings.customTheme)
      ? settings.customTheme
      : "",
    onlineThemeUrls: normalizeOnlineThemeUrls(settings.onlineThemeUrls),
    customAccentColor: /^#[0-9a-f]{6}$/i.test(settings.customAccentColor)
      ? settings.customAccentColor
      : "#147fa6",
    sidebarWidth: Number.isFinite(settings.sidebarWidth)
      ? Math.round(
          Math.max(
            minSidebarWidth,
            Math.min(maxSidebarWidth, settings.sidebarWidth),
          ),
        )
      : defaultSidebarWidth,
  };

  // This is a temporary dialog state, not a user preference. Remove the
  // legacy persisted value when an existing configuration is next saved.
  delete config.appSettings.hideOwnId;

  if (!config.appSettings.autostart) {
    config.appSettings.startHidden = false;
  }

  const audio = {
    ...getDefaultAudioSettings(),
    ...(config.audio && typeof config.audio === "object" ? config.audio : {}),
  };

  config.audio = {
    ...audio,
    inputDeviceId:
      typeof audio.inputDeviceId === "string" ? audio.inputDeviceId : "default",
    cameraDeviceId:
      typeof audio.cameraDeviceId === "string"
        ? audio.cameraDeviceId
        : "default",
    outputDeviceId:
      typeof audio.outputDeviceId === "string"
        ? audio.outputDeviceId
        : "default",
    remoteVolume: Number.isFinite(audio.remoteVolume)
      ? Math.round(Math.max(0, Math.min(100, audio.remoteVolume)))
      : 100,
    micMode: audio.micMode === "manual" ? "manual" : "auto",
    micSensitivity: Number.isFinite(audio.micSensitivity)
      ? Math.round(Math.max(0, Math.min(100, audio.micSensitivity)))
      : defaultMicSensitivity,
    micBoost: Number.isFinite(audio.micBoost)
      ? Math.round(Math.max(0, Math.min(200, audio.micBoost)))
      : defaultMicBoost,
    micNoiseReduction: Number.isFinite(audio.micNoiseReduction)
      ? Math.round(Math.max(0, Math.min(100, audio.micNoiseReduction)))
      : defaultMicNoiseReduction,
    micEqLow: Number.isFinite(audio.micEqLow)
      ? Math.round(Math.max(-12, Math.min(12, audio.micEqLow)))
      : defaultMicEqLow,
    micEqMid: Number.isFinite(audio.micEqMid)
      ? Math.round(Math.max(-12, Math.min(12, audio.micEqMid)))
      : defaultMicEqMid,
    micEqHigh: Number.isFinite(audio.micEqHigh)
      ? Math.round(Math.max(-12, Math.min(12, audio.micEqHigh)))
      : defaultMicEqHigh,
    micProfile: ["voice-isolation", "studio", "custom"].includes(
      audio.micProfile,
    )
      ? audio.micProfile
      : "voice-isolation",
  };

  return config;
}

let cachedConfigKey = null;
let unreadableConfigKey = false;
let configKeyCreation = null;

function decodeStoredConfigKey(value) {
  const text = String(value).trim();
  let decoded;
  if (text.startsWith("SAFE:")) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Operating-system secret storage is unavailable.");
    }
    decoded = Buffer.from(
      safeStorage.decryptString(Buffer.from(text.substring(5), "base64")),
      "base64",
    );
  } else if (text.startsWith("LOCAL:")) {
    decoded = Buffer.from(text.substring(6), "base64");
  } else {
    throw new Error("Invalid config key format.");
  }

  if (decoded.length !== KEY_BYTES) {
    throw new Error("Invalid config key length.");
  }
  return decoded;
}

async function readExistingConfigKey() {
  if (cachedConfigKey) {
    return cachedConfigKey;
  }
  if (unreadableConfigKey) {
    return null;
  }

  const keyPaths = [getConfigKeyPath(), getConfigKeyBackupPath()];
  let lastError = null;
  for (const keyPath of keyPaths) {
    try {
      cachedConfigKey = decodeStoredConfigKey(await readFile(keyPath, "utf8"));
      return cachedConfigKey;
    } catch (error) {
      if (error.code !== "ENOENT") {
        lastError = error;
      }
    }
  }

  if (lastError) {
    // Windows safeStorage uses the current user's DPAPI credentials. A config
    // copied from a previous Windows installation cannot be decrypted again.
    // Keep those files for inspection, but let the next save create a fresh
    // key instead of permanently blocking every settings update.
    unreadableConfigKey = true;
    console.warn(
      "Saved settings key cannot be decrypted on this system; settings will be reset on the next save.",
    );
  }
  return null;
}

async function archiveUnreadableConfigFiles() {
  if (!unreadableConfigKey) {
    return;
  }

  const recoverySuffix = `.unreadable-${Date.now()}`;
  for (const filePath of [
    getConfigPath(),
    getConfigBackupPath(),
    getConfigKeyPath(),
    getConfigKeyBackupPath(),
  ]) {
    try {
      await rename(filePath, `${filePath}${recoverySuffix}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  unreadableConfigKey = false;
}

async function createConfigKey() {
  if (cachedConfigKey) {
    return cachedConfigKey;
  }
  if (configKeyCreation) {
    return configKeyCreation;
  }

  configKeyCreation = (async () => {
    const existing = await readExistingConfigKey();
    if (existing) {
      return existing;
    }

    await archiveUnreadableConfigFiles();
    const key = randomBytes(KEY_BYTES);
    const protectedValue = safeStorage.isEncryptionAvailable()
      ? `SAFE:${safeStorage
          .encryptString(key.toString("base64"))
          .toString("base64")}`
      : `LOCAL:${key.toString("base64")}`;
    const keyPath = getConfigKeyPath();
    const keyBackupPath = getConfigKeyBackupPath();
    const tempPath = `${keyPath}.${process.pid}.tmp`;

    await mkdir(app.getPath("userData"), { recursive: true });
    await writeFile(tempPath, protectedValue, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(tempPath, keyPath);
    await chmod(keyPath, 0o600).catch(() => {});
    await copyFile(keyPath, keyBackupPath);
    await chmod(keyBackupPath, 0o600).catch(() => {});
    cachedConfigKey = key;
    return key;
  })();

  try {
    return await configKeyCreation;
  } finally {
    configKeyCreation = null;
  }
}

function legacyConfigPaths() {
  const installDir = dirname(process.execPath);
  return [
    join(installDir, userConfigFileName),
    join(installDir, `${userConfigFileName}.bak`),
    join(installDir, "config.json"),
    join(app.getPath("appData"), app.name, "config.json"),
    join(app.getPath("appData"), "aero-p2p-chat", "config.json"),
  ];
}

async function removeMigratedLegacyConfigs() {
  const protectedPaths = new Set([getConfigPath(), getConfigBackupPath()]);
  for (const legacyPath of new Set(legacyConfigPaths())) {
    if (!protectedPaths.has(legacyPath)) {
      await rm(legacyPath, { force: true }).catch(() => {});
    }
  }
}

function stripRetiredIdentityData(config) {
  if (!config || typeof config !== "object") {
    return config;
  }

  const legacyIdentity =
    config.identity && typeof config.identity === "object"
      ? config.identity
      : null;
  if (legacyIdentity) {
    delete legacyIdentity.loggedIn;
    delete legacyIdentity.accountUserId;
    delete legacyIdentity.authToken;
    delete legacyIdentity.role;
  }
  if (Array.isArray(config.contacts)) {
    for (const contact of config.contacts) {
      if (contact && typeof contact === "object") {
        delete contact.accountUserId;
      }
    }
  }
  if (config.security && typeof config.security === "object") {
    delete config.security.pendingTokenRevocation;
    delete config.security.accountReloginRequired;
    delete config.security.accountSecurityVersion;
  }
  return config;
}

async function loadConfig() {
  const configPaths = [
    getConfigPath(),
    getConfigBackupPath(),
    ...legacyConfigPaths(),
  ];
  let lastError = null;
  for (const configPath of configPaths) {
    try {
      const fileData = await readFile(configPath, "utf8");
      const authenticated = isAuthenticatedConfig(fileData);
      const existingKey = await readExistingConfigKey();
      const isProtectedConfigPath =
        configPath === getConfigPath() || configPath === getConfigBackupPath();
      if (
        !authenticated &&
        app.isPackaged &&
        (isProtectedConfigPath || existingKey)
      ) {
        throw new Error(
          "Refused unauthenticated config after security migration.",
        );
      }
      const plaintext = authenticated
        ? decryptAuthenticatedConfig(fileData, existingKey)
        : decryptLegacyConfig(fileData, projectConfig.app.id || "AeroP2Pchat");
      const parsedConfig = JSON.parse(plaintext);
      const beforeCleanup = JSON.stringify(parsedConfig);
      const config = normalizeConfig(stripRetiredIdentityData(parsedConfig));
      const cleanedUp = beforeCleanup !== JSON.stringify(parsedConfig);
      if (!authenticated || configPath !== getConfigPath() || cleanedUp) {
        await saveConfig(config);
        if (configPath === getConfigBackupPath()) {
          await copyFile(getConfigPath(), getConfigBackupPath());
        }
        await removeMigratedLegacyConfigs();
      }
      return config;
    } catch (error) {
      if (error.code !== "ENOENT") {
        lastError = error;
        console.warn(
          `Could not read saved settings from ${configPath}; trying backup.`,
          error.message,
        );
      }
    }
  }
  // Keep a damaged file in place for recovery instead of replacing it with an
  // empty config. A later save will recreate the primary file atomically.
  if (lastError) {
    console.warn("No readable settings file found; starting with defaults.");
  }
  return normalizeConfig({});
}

async function saveConfig(config) {
  const normalizedConfig = normalizeConfig(config || {});
  const configPath = getConfigPath();
  const backupPath = getConfigBackupPath();
  const tempPath = `${configPath}.${process.pid}.tmp`;
  await mkdir(app.getPath("userData"), { recursive: true });
  const dataString = encryptAuthenticatedConfig(
    JSON.stringify(normalizedConfig, null, 2),
    await createConfigKey(),
  );
  await writeFile(tempPath, dataString, "utf8");
  let hadExistingConfig = false;
  try {
    await copyFile(configPath, backupPath);
    hadExistingConfig = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await rename(tempPath, configPath);
  if (!hadExistingConfig) {
    await copyFile(configPath, backupPath);
  }
  appConfig = normalizedConfig;
  await applyAutostartSettings();
  return { ok: true, path: configPath };
}

function getAutostartArgs() {
  return appConfig.appSettings?.startHidden ? ["--hidden"] : [];
}

function getLinuxAutostartPath() {
  const configHome =
    process.env.XDG_CONFIG_HOME || join(app.getPath("home"), ".config");
  return join(configHome, "autostart", autostartDesktopFileName);
}

function quoteDesktopValue(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function applyLinuxAutostartSettings() {
  const autostartPath = getLinuxAutostartPath();
  if (!appConfig.appSettings?.autostart) {
    await rm(autostartPath, { force: true });
    return;
  }

  const executable = process.env.APPIMAGE || process.execPath;
  const args = getAutostartArgs().map(quoteDesktopValue).join(" ");
  const desktopEntry = [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${appDisplayName}`,
    `Exec=${quoteDesktopValue(executable)}${args ? ` ${args}` : ""}`,
    "Terminal=false",
    "X-GNOME-Autostart-enabled=true",
  ].join("\n");

  await mkdir(dirname(autostartPath), { recursive: true });
  await writeFile(autostartPath, `${desktopEntry}`, "utf8");
}

async function applyAutostartSettings() {
  if (!app.isPackaged && process.env.AERO_CHAT_APPLY_DEV_AUTOSTART !== "1") {
    return;
  }

  if (process.platform === "linux") {
    await applyLinuxAutostartSettings();
    return;
  }

  app.setLoginItemSettings({
    openAtLogin: Boolean(appConfig.appSettings?.autostart),
    path: process.execPath,
    args: getAutostartArgs(),
  });
}

function shouldStartHidden() {
  return process.argv.includes("--hidden");
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow({ hidden: false });
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function hasTrayStateChanged(nextState) {
  return [
    "peerId",
    "hasActivePeerConnection",
    "isMuted",
    "isDeafened",
    "status",
    "theme",
    "autostart",
    "closeToTray",
    "debugOfflineMode",
    "debugSimulateUpdate",
    "debugBootSimulation",
  ].some((key) => trayState[key] !== nextState[key]);
}

function paintConnectionBadge(bitmap, width, height, { corner = false } = {}) {
  if (!Buffer.isBuffer(bitmap) || bitmap.length < width * height * 4) {
    return false;
  }

  const outerRadius = Math.max(2, Math.round(Math.min(width, height) * (corner ? 0.2 : 0.39)));
  const innerRadius = Math.max(1, outerRadius - Math.max(1, Math.round(outerRadius * 0.22)));
  const centerX = corner ? width - outerRadius - 1 : Math.floor(width / 2);
  const centerY = corner ? height - outerRadius - 1 : Math.floor(height / 2);

  for (let y = Math.max(0, centerY - outerRadius); y <= Math.min(height - 1, centerY + outerRadius); y += 1) {
    for (let x = Math.max(0, centerX - outerRadius); x <= Math.min(width - 1, centerX + outerRadius); x += 1) {
      const distance = Math.hypot(x - centerX, y - centerY);
      if (distance > outerRadius) continue;

      const offset = (y * width + x) * 4;
      const isInnerDot = distance <= innerRadius;
      // nativeImage bitmap pixels use BGRA ordering.
      bitmap[offset] = isInnerDot ? 82 : 14;
      bitmap[offset + 1] = isInnerDot ? 197 : 57;
      bitmap[offset + 2] = isInnerDot ? 34 : 22;
      bitmap[offset + 3] = 255;
    }
  }

  return true;
}

function getConnectedTrayIcon() {
  if (connectedTrayIcon) return connectedTrayIcon;

  try {
    const icon = windowIcon.resize({ width: 64, height: 64 });
    const { width, height } = icon.getSize();
    const bitmap = Buffer.from(icon.toBitmap());
    const badge = connectionBadgeImage.resize({ width: 26, height: 26 });
    const { width: badgeWidth, height: badgeHeight } = badge.getSize();
    const badgeBitmap = Buffer.from(badge.toBitmap());
    const offsetX = Math.max(0, width - badgeWidth);
    const offsetY = Math.max(0, height - badgeHeight);
    const canOverlayBadge =
      !badge.isEmpty() && badgeBitmap.length >= badgeWidth * badgeHeight * 4;
    if (canOverlayBadge) {
      for (let y = 0; y < badgeHeight; y += 1) {
        for (let x = 0; x < badgeWidth; x += 1) {
          const sourceOffset = (y * badgeWidth + x) * 4;
          const alpha = badgeBitmap[sourceOffset + 3] / 255;
          if (!alpha) continue;
          const targetOffset = ((offsetY + y) * width + offsetX + x) * 4;
          for (let channel = 0; channel < 3; channel += 1) {
            bitmap[targetOffset + channel] = Math.round(
              badgeBitmap[sourceOffset + channel] * alpha +
                bitmap[targetOffset + channel] * (1 - alpha),
            );
          }
          bitmap[targetOffset + 3] = Math.max(
            bitmap[targetOffset + 3],
            badgeBitmap[sourceOffset + 3],
          );
        }
      }
    }
    if (canOverlayBadge || paintConnectionBadge(bitmap, width, height, { corner: true })) {
      connectedTrayIcon = nativeImage.createFromBitmap(bitmap, {
        width,
        height,
        scaleFactor: 1,
      });
    }
  } catch {
    // A missing or unsupported icon must never affect the tray itself.
  }

  return connectedTrayIcon && !connectedTrayIcon.isEmpty()
    ? connectedTrayIcon
    : windowIcon;
}

function getConnectionOverlayIcon() {
  if (connectionOverlayIcon) return connectionOverlayIcon;

  try {
    if (!connectionBadgeImage.isEmpty()) {
      connectionOverlayIcon = connectionBadgeImage.resize({
        width: 16,
        height: 16,
      });
    }
    if (!connectionOverlayIcon || connectionOverlayIcon.isEmpty()) {
      const size = 16;
      const bitmap = Buffer.alloc(size * size * 4);
      if (paintConnectionBadge(bitmap, size, size)) {
        connectionOverlayIcon = nativeImage.createFromBitmap(bitmap, {
          width: size,
          height: size,
          scaleFactor: 1,
        });
      }
    }
  } catch {
    // Taskbar overlays are optional OS decoration.
  }

  return connectionOverlayIcon && !connectionOverlayIcon.isEmpty()
    ? connectionOverlayIcon
    : null;
}

function updateConnectionBadge() {
  const isConnected = Boolean(trayState.hasActivePeerConnection);

  if (tray) {
    tray.setImage(isConnected ? getConnectedTrayIcon() : windowIcon);
    tray.setToolTip(
      isConnected ? `${appDisplayName} · Peer connected` : appDisplayName,
    );
  }

  if (process.platform === "win32" && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setOverlayIcon(
      isConnected ? getConnectionOverlayIcon() : null,
      isConnected ? "Peer connected" : "",
    );
  }
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  const menuIcon = windowIcon.resize({ width: 16, height: 16 });

  const sendTrayAction = (action, value) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("tray-action", { action, value });
    }
  };

  const menuTemplate = [
    {
      label: `${appDisplayName} v${app.getVersion()}`,
      icon: menuIcon,
      enabled: false,
    },
    { type: "separator" },
  ];

  if (trayState.peerId) {
    menuTemplate.push({
      label: `Copy Peer ID`,
      click: () => {
        clipboard.writeText(trayState.peerId);
      },
    });
  }

  menuTemplate.push(
    {
      label: "Online Status",
      submenu: [
        {
          label: "Online",
          type: "radio",
          checked: trayState.status === "online",
          click: () => sendTrayAction("set-status", "online"),
        },
        {
          label: "Do Not Disturb",
          type: "radio",
          checked: trayState.status === "dnd",
          click: () => sendTrayAction("set-status", "dnd"),
        },
        {
          label: "Offline / Hidden",
          type: "radio",
          checked: trayState.status === "offline",
          click: () => sendTrayAction("set-status", "offline"),
        },
      ],
    },
    { type: "separator" },
    {
      label: "Mute Microphone",
      type: "checkbox",
      checked: trayState.isMuted,
      click: () => sendTrayAction("toggle-mute"),
    },
    {
      label: "Deafen Audio",
      type: "checkbox",
      checked: trayState.isDeafened,
      click: () => sendTrayAction("toggle-deafen"),
    },
    { type: "separator" },
    {
      label: "Quick Settings",
      submenu: [
        {
          label: "Theme",
          submenu: [
            ["system", "System"], ["light", "Light"],
            ["dark", "Dark"], ["ultra-dark", "OLED"],
          ].map(([value, label]) => ({
            label,
            type: "radio",
            checked: trayState.theme === value,
            click: () => sendTrayAction("set-theme", value),
          })),
        },
        {
          label: "Launch on Startup",
          type: "checkbox",
          checked: trayState.autostart,
          click: () => sendTrayAction("toggle-autostart"),
        },
        {
          label: "Close to Tray",
          type: "checkbox",
          checked: trayState.closeToTray,
          click: () => sendTrayAction("toggle-close-to-tray"),
        },
      ],
    },
    { type: "separator" },
    {
      label: "Open Aero P2P Chat",
      click: showMainWindow,
    },
    {
      label: "Disconnect All",
      click: () => sendTrayAction("disconnect-p2p"),
    },
    {
      label: "Hide to Tray",
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.hide();
        }
      },
    },
  );

  menuTemplate.splice(-2, 0, {
    label: "Check for Updates",
    click: () => sendTrayAction("check-for-updates"),
  });

  if (!app.isPackaged) {
    menuTemplate.push(
      { type: "separator" },
      {
        label: "Dev",
        submenu: [
          {
            label: "Toggle Developer Tools",
            click: () => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.toggleDevTools();
              }
            },
          },
          {
            label: "Offline Mode",
            type: "checkbox",
            checked: trayState.debugOfflineMode,
            click: () => {
              trayState.debugOfflineMode = !trayState.debugOfflineMode;
              updateTrayMenu();
              sendTrayAction(
                "set-debug-offline-mode",
                trayState.debugOfflineMode,
              );
            },
          },
          {
            label: "Simulate Update",
            type: "checkbox",
            checked: trayState.debugSimulateUpdate,
            click: () => {
              trayState.debugSimulateUpdate = !trayState.debugSimulateUpdate;
              updateTrayMenu();
              sendTrayAction(
                "set-debug-simulate-update",
                trayState.debugSimulateUpdate,
              );
            },
          },
          {
            label: "Simulate Boot (loop)",
            type: "checkbox",
            checked: trayState.debugBootSimulation,
            click: () => {
              trayState.debugBootSimulation = !trayState.debugBootSimulation;
              updateTrayMenu();
              showMainWindow();
              sendTrayAction(
                "set-debug-boot-simulation",
                trayState.debugBootSimulation,
              );
            },
          },
          {
            label: "Restart App",
            click: () => {
              app.relaunch();
              app.quit();
            },
          },
          {
            label: "Trigger Real Crash…",
            click: () => {
              const response = dialog.showMessageBoxSync({
                type: "warning",
                buttons: ["Crash now", "Cancel"],
                defaultId: 1,
                cancelId: 1,
                title: "Trigger a real crash?",
                message:
                  "This intentionally throws an unhandled Main Process error to test Aero's real crash handler.",
                detail:
                  "Unsaved activity and active calls will be interrupted. The normal crash log and recovery dialog should appear.",
                noLink: true,
              });
              if (response !== 0) return;

              setImmediate(() => {
                throw new Error(
                  "Intentional developer-triggered Main Process crash.",
                );
              });
            },
          },
          {
            label: "Clear App Data & Restart",
            click: () => {
              const { dialog } = require("electron");
              const response = dialog.showMessageBoxSync({
                type: "warning",
                buttons: ["Yes, Clear Data", "Cancel"],
                defaultId: 1,
                title: "Clear App Data?",
                message:
                  "Are you sure you want to completely clear all app settings and data? This cannot be undone.",
              });

              if (response === 0) {
                session.defaultSession.clearStorageData().then(() => {
                  app.relaunch();
                  app.quit();
                });
              }
            },
          },
        ],
      },
    );
  }

  menuTemplate.push(
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        forceQuit = true;
        app.quit();
      },
    },
  );

  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
}

function createTray() {
  if (tray) {
    updateConnectionBadge();
    updateTrayMenu();
    return tray;
  }

  tray = new Tray(windowIcon);
  updateConnectionBadge();
  tray.on("click", showMainWindow);
  updateTrayMenu();
  return tray;
}

function runStatusCommand(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 900,
      windowsHide: true,
    }).trim();
  } catch {
    return "";
  }
}

function isWindowsNotificationDisabled() {
  const shellState = runStatusCommand("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "Add-Type 'using System; using System.Runtime.InteropServices; public static class AeroNotifyState { [DllImport(\"shell32.dll\")] public static extern int SHQueryUserNotificationState(out int state); }'; $state = 0; [void][AeroNotifyState]::SHQueryUserNotificationState([ref]$state); [Console]::Write($state)",
  ]);
  if (/^\d+$/.test(shellState)) {
    return shellState !== "5";
  }

  const settingsOutput = runStatusCommand("reg.exe", [
    "query",
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings",
    "/v",
    "NOC_GLOBAL_SETTING_TOASTS_ENABLED",
  ]);
  if (
    /\bNOC_GLOBAL_SETTING_TOASTS_ENABLED\b[\s\S]*\b0x0\b/i.test(settingsOutput)
  ) {
    return true;
  }

  const pushOutput = runStatusCommand("reg.exe", [
    "query",
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications",
    "/v",
    "ToastEnabled",
  ]);
  return /\bToastEnabled\b[\s\S]*\b0x0\b/i.test(pushOutput);
}

function isLinuxNotificationDisabled() {
  const showBanners = runStatusCommand("gsettings", [
    "get",
    "org.gnome.desktop.notifications",
    "show-banners",
  ]);
  if (showBanners) {
    return showBanners === "false";
  }

  return false;
}

function isSystemDoNotDisturbEnabled() {
  if (process.env.AERO_CHAT_ASSUME_SYSTEM_DND === "1") {
    return true;
  }

  const now = Date.now();
  if (now - lastSystemDndCheck.checkedAt < 2000) {
    return lastSystemDndCheck.enabled;
  }

  const enabled =
    process.platform === "win32"
      ? isWindowsNotificationDisabled()
      : process.platform === "linux"
      ? isLinuxNotificationDisabled()
      : false;
  lastSystemDndCheck = { checkedAt: now, enabled };
  return enabled;
}

function getNotificationState() {
  return {
    appFocused: Boolean(mainWindow?.isVisible() && mainWindow?.isFocused()),
    systemDnd: isSystemDoNotDisturbEnabled(),
  };
}

function shouldSuppressNotification({ showWhenFocused = false } = {}) {
  const state = getNotificationState();
  return Boolean(state.systemDnd || (!showWhenFocused && state.appFocused));
}

function createToastWindow() {
  if (toastWindow) return toastWindow;

  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;

  toastWindow = new BrowserWindow({
    width: 380,
    height: 10,
    x: workArea.x + workArea.width - 380 - 10,
    y: workArea.y + workArea.height - 10,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    ...(process.platform === "linux" ? { type: "notification" } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  toastWindow.setIgnoreMouseEvents(false);

  if (process.env.ELECTRON_RENDERER_URL) {
    const toastUrl = new URL("toast.html", process.env.ELECTRON_RENDERER_URL);
    toastWindow.loadURL(toastUrl.toString());
  } else {
    toastWindow.loadFile(join(__dirname, "../renderer/toast.html"));
  }

  toastWindow.on("closed", () => {
    toastWindow = null;
  });

  return toastWindow;
}

function normalizeCallHealthPayload(details = {}) {
  const number = (value, fallback = null) =>
    Number.isFinite(value) ? Math.max(0, value) : fallback;
  const quality = ["good", "unstable", "bad", "unknown"].includes(
    details.quality,
  )
    ? details.quality
    : "unknown";
  const color = (value, fallback) =>
    /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
  const history = Array.isArray(details.history)
    ? details.history.slice(-30).map((entry) => ({
        latencyMs: number(entry?.latencyMs),
        lossRatio: Math.min(1, number(entry?.lossRatio, 0)),
        incomingBitrateKbps: number(entry?.incomingBitrateKbps),
        outgoingBitrateKbps: number(entry?.outgoingBitrateKbps),
        jitterMs: number(entry?.jitterMs),
      }))
    : [];

  return {
    quality,
    latencyMs: number(details.latencyMs),
    jitterMs: number(details.jitterMs),
    lossRatio: Math.min(1, number(details.lossRatio, 0)),
    bitrateKbps: number(details.bitrateKbps),
    outgoingBitrateKbps: number(details.outgoingBitrateKbps),
    bytesReceived: number(details.bytesReceived, 0),
    bytesSent: number(details.bytesSent, 0),
    packetsReceived: number(details.packetsReceived, 0),
    packetsSent: number(details.packetsSent, 0),
    packetsLost: number(details.packetsLost, 0),
    connectionState: String(details.connectionState || "Checking").slice(0, 32),
    iceState: String(details.iceState || "Checking").slice(0, 32),
    incomingCodec: String(details.incomingCodec || "—").slice(0, 32),
    outgoingCodec: String(details.outgoingCodec || "—").slice(0, 32),
    mediaKinds: Array.isArray(details.mediaKinds)
      ? details.mediaKinds.filter((kind) => ["audio", "video"].includes(kind)).slice(0, 2)
      : [],
    playoutDelayMs: number(details.playoutDelayMs),
    videoInfo: String(details.videoInfo || "—").slice(0, 48),
    state: String(details.state || "Waiting for media").slice(0, 80),
    history,
    theme: details.theme === "light" ? "light" : "dark",
    colors: {
      accent: color(details.colors?.accent, "#7654d9"),
      text: color(details.colors?.text, "#f5f5f5"),
      muted: color(details.colors?.muted, "#a6a6a6"),
      surface: color(details.colors?.surface, "#111111"),
      raised: color(details.colors?.raised, "#171717"),
      line: color(details.colors?.line, "#303030"),
      success: color(details.colors?.success, "#39b97d"),
      warning: color(details.colors?.warning, "#dba13c"),
      danger: color(details.colors?.danger, "#e25871"),
    },
  };
}

function sendCallHealthPayload() {
  if (
    callHealthPayload &&
    callHealthWindow &&
    !callHealthWindow.isDestroyed()
  ) {
    callHealthWindow.webContents.send("call-health-update", callHealthPayload);
  }
}

function positionCallHealthWindow(win = callHealthWindow) {
  if (!win || win.isDestroyed() || !mainWindow || mainWindow.isDestroyed()) return;
  const parentBounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(parentBounds);
  const workArea = display.workArea;
  const [width, height] = win.getSize();
  win.setPosition(
    Math.max(workArea.x + 8, Math.min(parentBounds.x + parentBounds.width - width - 20, workArea.x + workArea.width - width - 8)),
    Math.max(workArea.y + 8, Math.min(parentBounds.y + 76, workArea.y + workArea.height - height - 8)),
  );
}

function openCallHealthWindow() {
  if (callHealthWindow && !callHealthWindow.isDestroyed()) {
    positionCallHealthWindow();
    callHealthWindow.show();
    callHealthWindow.focus();
    sendCallHealthPayload();
    return { ok: true };
  }
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };

  const win = new BrowserWindow({
    width: 560,
    height: 450,
    title: "Call health",
    icon: windowIcon,
    parent: mainWindow,
    modal: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: callHealthPayload?.theme === "light" ? "#f7fafc" : "#111111",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.setIcon(windowIcon);
  win.setMenuBarVisibility(false);
  callHealthWindow = win;
  positionCallHealthWindow(win);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.once("did-finish-load", () => {
    if (callHealthWindow !== win || win.isDestroyed()) return;
    sendCallHealthPayload();
    win.show();
    win.focus();
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(new URL("call-health.html", process.env.ELECTRON_RENDERER_URL).toString());
  } else {
    win.loadFile(join(__dirname, "../renderer/call-health.html"));
  }
  win.on("closed", () => {
    if (callHealthWindow === win) callHealthWindow = null;
  });
  return { ok: true };
}

function closeCallHealthWindow() {
  if (callHealthWindow && !callHealthWindow.isDestroyed()) {
    callHealthWindow.close();
  }
}

function sendNotificationAction(action) {
  if (action?.openWindow) {
    showMainWindow();
  }
  mainWindow?.webContents.send("notification-action", action);
}

function showLinuxSystemNotification(payload) {
  if (process.platform !== "linux" || !Notification.isSupported()) {
    return false;
  }

  const notification = new Notification({
    title: payload.title,
    body: payload.body,
    icon: windowIcon.isEmpty() ? undefined : windowIcon,
    silent: payload.silent,
    urgency: payload.kind === "call" ? "critical" : "normal",
    timeoutType: payload.kind === "call" ? "never" : "default",
  });
  const entry = {
    type: "native",
    notification,
    cleanupTimer: null,
  };
  const forget = () => {
    const current = activeNotifications.get(payload.id);
    if (current?.notification !== notification) return;
    if (current.cleanupTimer) clearTimeout(current.cleanupTimer);
    activeNotifications.delete(payload.id);
  };

  notification.on("click", () => {
    sendNotificationAction({
      type: "open",
      openWindow: true,
      id: payload.id,
      kind: payload.kind,
      peerId: payload.peerId,
      callId: payload.callId,
    });
    notification.close();
    forget();
  });
  notification.on("close", forget);

  if (payload.kind !== "call") {
    entry.cleanupTimer = setTimeout(forget, 60_000);
  }
  activeNotifications.set(payload.id, entry);

  try {
    notification.show();
    return true;
  } catch (error) {
    forget();
    console.warn("Native Linux notification failed; using app toast.", error);
    return false;
  }
}

function showAppNotification(details = {}) {
  if (
    shouldSuppressNotification({
      showWhenFocused: Boolean(details.showWhenFocused),
    })
  ) {
    return { ok: true, suppressed: true };
  }

  const kind = details.kind === "call" ? "call" : "message";
  const notificationId =
    details.id || `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (activeNotifications.has(notificationId)) {
    return { ok: true, id: notificationId, existing: true };
  }

  const title = String(
    details.title || (kind === "call" ? "Incoming call" : "New message"),
  );
  const body = String(details.body || "");
  const peerId = details.peerId || "";
  const callId = details.callId || "";
  const variant = ["chat", "voice", "call"].includes(details.variant)
    ? details.variant
    : kind === "call" ? "call" : "chat";
  const accent = /^#[0-9a-f]{6}$/i.test(String(details.accent || ""))
    ? String(details.accent)
    : "";

  const toastPayload = {
    id: notificationId,
    title,
    body,
    kind,
    variant,
    peerId,
    avatar: details.avatar,
    callId,
    theme: details.theme,
    accent,
    silent: Boolean(details.silent),
  };

  if (showLinuxSystemNotification(toastPayload)) {
    return { ok: true, id: notificationId, native: true };
  }

  activeNotifications.set(notificationId, { type: "toast" });

  if (!toastWindow) {
    createToastWindow();
    toastWindow.once("ready-to-show", () => {
      toastWindow.showInactive();
      toastWindow.webContents.send("show-toast", toastPayload);
    });
  } else {
    toastWindow.showInactive();
    toastWindow.webContents.send("show-toast", toastPayload);
  }

  // The renderer (toast.js) will handle the 10s auto-close and send close-app-notification.
  return { ok: true, id: notificationId };
}

function closeAppNotification(id) {
  const notificationId = String(id);
  const active = activeNotifications.get(notificationId);
  if (!active) return { ok: true };

  activeNotifications.delete(notificationId);
  if (active.cleanupTimer) clearTimeout(active.cleanupTimer);
  if (active.type === "native") {
    active.notification.close();
  } else if (toastWindow) {
    toastWindow.webContents.send("close-toast", notificationId);
  }
  return { ok: true };
}
function getAppNotificationState() {
  return getNotificationState();
}

function notifyRendererShutdown(reason = "quit") {
  systemShutdownStarted = true;
  forceQuit = true;

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("system-shutdown", { reason });
  }
}

async function finishDelayedQuit() {
  if (delayedQuitTimer) {
    clearTimeout(delayedQuitTimer);
    delayedQuitTimer = null;
  }
  await cleanupIncomingTempDirectory().catch(() => {});
  app.quit();
}

function assertTrustedReleaseAssetUrl(rawUrl, expectedAssetName) {
  const url = new URL(rawUrl);
  const isTrustedHost = url.hostname === releaseHost;
  const isTrustedPath = url.pathname.startsWith(releasePathPrefix);
  const isExpectedAsset = basename(url.pathname) === expectedAssetName;

  if (!isTrustedHost || !isTrustedPath || !isExpectedAsset) {
    throw new Error("Refused untrusted update URL.");
  }

  return url;
}

function assertTrustedWindowsSetupUrl(rawUrl) {
  return assertTrustedReleaseAssetUrl(
    rawUrl,
    projectConfig.release.windowsSetupAsset,
  );
}

function getCachedWindowsSetupPath() {
  return join(
    app.getPath("userData"),
    "Updates",
    projectConfig.release.windowsSetupAsset,
  );
}

async function hasUsableUpdateFile(filePath) {
  try {
    const file = await stat(filePath);
    return file.isFile() && file.size > 0;
  } catch {
    return false;
  }
}

async function stageWindowsUpdateInstaller(
  rawSetupUrl,
  expectedSetupSha256 = "",
  expectedSetupSha512 = "",
  onProgress = () => {},
) {
  if (process.platform !== "win32" || process.windowsStore) {
    throw new Error("Automatic update downloads are unavailable on this platform.");
  }
  if (!app.isPackaged) {
    throw new Error("Automatic update downloads are only available in the packaged app.");
  }

  const cachedInstallerPath = getCachedWindowsSetupPath();
  if (await hasUsableUpdateFile(cachedInstallerPath)) {
    try {
      verifyUpdateDownload(
        cachedInstallerPath,
        expectedSetupSha256,
        expectedSetupSha512,
      );
      return { path: cachedInstallerPath, cached: true };
    } catch {
      await rm(cachedInstallerPath, { force: true }).catch(() => {});
    }
  }

  const setupUrl = assertTrustedWindowsSetupUrl(rawSetupUrl);
  const temporaryUpdateDir = await mkdtemp(join(tmpdir(), "aero-p2p-update-"));
  const downloadedInstallerPath = join(
    temporaryUpdateDir,
    projectConfig.release.windowsSetupAsset,
  );

  try {
    onProgress({
      phase: "download",
      percent: 0,
      receivedBytes: 0,
      totalBytes: null,
    });
    await downloadFileWithRetry(
      setupUrl,
      downloadedInstallerPath,
      onProgress,
    );
    onProgress({ phase: "verify", percent: 100 });
    verifyUpdateDownload(
      downloadedInstallerPath,
      expectedSetupSha256,
      expectedSetupSha512,
    );
    await mkdir(dirname(cachedInstallerPath), { recursive: true });
    await copyFile(downloadedInstallerPath, cachedInstallerPath);
    return { path: cachedInstallerPath, cached: false };
  } finally {
    await rm(temporaryUpdateDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function cleanupCompletedUpdateSetups() {
  if (process.platform !== "win32") return;

  let entries;
  try {
    entries = await readdir(tmpdir(), { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name.startsWith(updateSetupDirectoryPrefix),
      )
      .map((entry) =>
        rm(join(tmpdir(), entry.name), {
          recursive: true,
          force: true,
          maxRetries: 2,
          retryDelay: 100,
        }).catch(() => {}),
      ),
  );
}

function assertTrustedManifestUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.toString() !== latestManifestUrl) {
    throw new Error("Refused untrusted update manifest URL.");
  }
  return url;
}

function fetchText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      if (
        [301, 302, 303, 307, 308].includes(response.statusCode) &&
        response.headers.location
      ) {
        response.resume();
        if (redirects >= 5) {
          reject(new Error("Too many update manifest redirects."));
          return;
        }
        fetchText(new URL(response.headers.location, url), redirects + 1).then(
          resolve,
          reject,
        );
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(
          new Error(`Update manifest failed with HTTP ${response.statusCode}.`),
        );
        return;
      }

      response.setEncoding("utf8");
      let text = "";
      response.on("data", (chunk) => {
        text += chunk;
      });
      response.on("end", () => resolve(text));
    });

    request.on("error", reject);
    request.setTimeout(updateManifestTimeoutMs, () => {
      request.destroy(new Error("Update manifest request timed out."));
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchTextWithRetry(url, attempts = 2) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchText(url);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await wait(updateManifestRetryDelayMs);
      }
    }
  }

  throw lastError;
}

async function downloadFileWithRetry(
  url,
  targetPath,
  onProgress = () => {},
  attempts = 2,
) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await downloadFile(url, targetPath, onProgress);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await wait(updateManifestRetryDelayMs);
      }
    }
  }

  throw lastError;
}

function fetchUpdateManifest(rawUrl) {
  const url = assertTrustedManifestUrl(rawUrl);
  return fetchTextWithRetry(url);
}

function fetchChangelogFeed() {
  return fetchTextWithRetry(new URL(changelogFeedUrl));
}

function downloadFile(url, targetPath, onProgress = () => {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let responseStream = null;
    let file = null;

    const fail = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      request.destroy();
      responseStream?.destroy();
      file?.destroy();
      rm(targetPath, { force: true })
        .catch(() => {})
        .finally(() => reject(error));
    };

    const request = get(url, (response) => {
      responseStream = response;
      if (
        [301, 302, 303, 307, 308].includes(response.statusCode) &&
        response.headers.location
      ) {
        response.resume();
        if (redirects >= 5) {
          reject(new Error("Too many update download redirects."));
          return;
        }

        settled = true;
        downloadFile(
          new URL(response.headers.location, url),
          targetPath,
          onProgress,
          redirects + 1,
        ).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(
          new Error(`Update download failed with HTTP ${response.statusCode}.`),
        );
        return;
      }

      file = createWriteStream(targetPath);
      const totalBytes = Number(response.headers["content-length"]) || 0;
      let receivedBytes = 0;

      response.on("data", (chunk) => {
        receivedBytes += chunk.length;
        if (totalBytes > 0) {
          onProgress({
            phase: "download",
            percent: Math.min(
              100,
              Math.round((receivedBytes / totalBytes) * 100),
            ),
            receivedBytes,
            totalBytes,
          });
        } else {
          onProgress({
            phase: "download",
            percent: null,
            receivedBytes,
            totalBytes: null,
          });
        }
      });

      response.pipe(file);
      file.on("finish", () => {
        if (totalBytes > 0 && receivedBytes !== totalBytes) {
          fail(new Error("Update download ended before all bytes arrived."));
          return;
        }

        file.close((error) => {
          if (error) {
            fail(error);
            return;
          }
          settled = true;
          onProgress({
            phase: "download",
            percent: 100,
            receivedBytes: totalBytes || receivedBytes,
            totalBytes: totalBytes || receivedBytes,
          });
          resolve();
        });
      });
      file.on("error", fail);
      response.on("aborted", () =>
        fail(new Error("Update download was interrupted.")),
      );
      response.on("error", fail);
    });

    request.on("error", fail);
    request.setTimeout(updateDownloadTimeoutMs, () => {
      fail(new Error("Update download timed out."));
    });
  });
}

function getFileHash(filePath, algorithm, encoding = "hex") {
  return createHash(algorithm).update(readFileSync(filePath)).digest(encoding);
}

function verifyUpdateDownload(
  filePath,
  expectedSha256 = "",
  expectedSha512 = "",
) {
  if (!expectedSha256 || !expectedSha512) {
    throw new Error("Update manifest is missing installer checksums.");
  }

  if (expectedSha256) {
    const actualSha256 = getFileHash(filePath, "sha256", "hex").toLowerCase();
    if (actualSha256 !== String(expectedSha256).toLowerCase()) {
      throw new Error("Update download SHA256 did not match latest.yml.");
    }
  }

  if (expectedSha512) {
    const actualSha512 = getFileHash(filePath, "sha512", "base64");
    if (actualSha512 !== String(expectedSha512)) {
      throw new Error("Update download SHA512 did not match latest.yml.");
    }
  }
}

async function installWindowsUpdate(
  rawSetupUrl,
  expectedSetupSha256 = "",
  expectedSetupSha512 = "",
  onProgress = () => {},
) {
  if (process.platform !== "win32") {
    throw new Error("Setup updates are only available on Windows.");
  }
  if (!app.isPackaged) {
    throw new Error("Update install is only available in the packaged app.");
  }

  try {
    const stagedInstaller = await stageWindowsUpdateInstaller(
      rawSetupUrl,
      expectedSetupSha256,
      expectedSetupSha512,
      onProgress,
    );
    const setupPath = stagedInstaller.path;

    onProgress({ phase: "install", percent: 100 });

    let updater;
    let spawnError;
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      try {
        updater = spawn(
          setupPath,
          ["/S"],
          {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
          },
        );
        break;
      } catch (error) {
        spawnError = error;
        if (attempt < 10) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    if (!updater) {
      throw spawnError || new Error("Could not spawn updater process.");
    }

    updater.unref();

    setTimeout(() => {
      forceQuit = true;
      app.quit();
    }, 250);
    return { ok: true };
  } catch (error) {
    throw error;
  }
}

async function installLinuxAppImageUpdate(
  rawAppImageUrl,
  expectedSha256 = "",
  expectedSha512 = "",
  version = "",
  onProgress = () => {},
) {
  if (process.platform !== "linux" || !app.isPackaged) {
    throw new Error("AppImage updates are only available in the packaged Linux app.");
  }
  const appImagePath = process.env.APPIMAGE ? resolve(process.env.APPIMAGE) : "";
  if (!appImagePath || !(await hasUsableUpdateFile(appImagePath))) {
    throw new Error("This installation is not running from an AppImage. Open the release page to update the RPM or DEB package.");
  }
  const appImageUrl = assertTrustedReleaseAssetUrl(
    rawAppImageUrl,
    projectConfig.release.linuxAppImageAsset,
  );
  const updateDir = await mkdtemp(join(dirname(appImagePath), ".aero-update-"));
  const downloadedPath = join(updateDir, projectConfig.release.linuxAppImageAsset);
  try {
    await downloadFileWithRetry(appImageUrl, downloadedPath, onProgress);
    onProgress({ phase: "verify", percent: 100 });
    verifyUpdateDownload(downloadedPath, expectedSha256, expectedSha512);
    await chmod(downloadedPath, 0o755);
    await rename(downloadedPath, appImagePath);
    if (
      basename(appImagePath) === projectConfig.linux.installedAppImageName &&
      /^\d+\.\d+\.\d+$/.test(version)
    ) {
      const versionPath = join(dirname(appImagePath), "version");
      const temporaryVersionPath = `${versionPath}.${process.pid}.tmp`;
      await writeFile(temporaryVersionPath, `${version}\n`, { mode: 0o644 });
      await rename(temporaryVersionPath, versionPath);
    }
    onProgress({ phase: "install", percent: 100 });
    const updatedApp = spawn(
      "/bin/sh",
      [
        "-c",
        'while kill -0 "$1" 2>/dev/null; do sleep 0.2; done; exec "$2"',
        "aero-appimage-update",
        String(process.pid),
        appImagePath,
      ],
      {
        detached: true,
        stdio: "ignore",
        env: { ...process.env, APPIMAGE: appImagePath },
      },
    );
    updatedApp.unref();
    setTimeout(() => {
      forceQuit = true;
      app.quit();
    }, 250);
    return { ok: true };
  } finally {
    await rm(updateDir, { recursive: true, force: true }).catch(() => {});
  }
}

function createWindow({ hidden = false } = {}) {
  const devLayout = !app.isPackaged
    ? String(process.env.AERO_CHAT_DEV_LAYOUT || "")
    : "";
  const workArea = screen.getPrimaryDisplay().workArea;
  const useDevGrid =
    (devLayout === "left" || devLayout === "right") &&
    workArea.width >= 1240 &&
    workArea.height >= 880;
  const topHeight = Math.floor(workArea.height / 2);
  const columnWidth = Math.floor(workArea.width / 2);
  const devBounds = useDevGrid
    ? {
        x: workArea.x + (devLayout === "right" ? columnWidth : 0),
        y: workArea.y,
        width: devLayout === "right" ? workArea.width - columnWidth : columnWidth,
        height: topHeight,
      }
    : null;
  const savedTheme = appConfig?.appSettings?.theme || "system";
  const initialTheme =
    savedTheme === "system"
      ? nativeTheme.shouldUseDarkColors
        ? "dark"
        : "light"
      : ["dark", "ultra-dark"].includes(savedTheme)
      ? savedTheme
      : "light";
  const savedAccent = appConfig?.appSettings?.accentColor || "system";
  let initialAccent = bootAccentPresets[savedAccent] || bootAccentPresets.aero;
  if (
    savedAccent === "custom" &&
    /^#[0-9a-f]{6}$/i.test(appConfig?.appSettings?.customAccentColor || "")
  ) {
    initialAccent = appConfig.appSettings.customAccentColor;
  } else if (savedAccent === "system") {
    try {
      const systemAccent = normalizeAccentColor(systemPreferences.getAccentColor());
      if (systemAccent) initialAccent = systemAccent;
    } catch {
      // Some Linux desktop environments do not expose an accent color.
    }
  }
  const win = new BrowserWindow({
    width: devBounds?.width || 980,
    height: devBounds?.height || 680,
    x: devBounds?.x,
    y: devBounds?.y,
    minWidth: 620,
    minHeight: 440,
    title: appDisplayName,
    icon: windowIcon,
    frame: false,
    thickFrame: true,
    backgroundMaterial: "none",
    transparent: false,
    titleBarStyle: "hidden",
    backgroundColor: initialTheme === "ultra-dark" ? "#000000" : initialTheme === "dark" ? "#232428" : "#eef4f7",
    autoHideMenuBar: true,
    show: !hidden,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  recordDiagnosticEvent("window", "created", {
    hidden,
    developmentLayout: devLayout || "none",
    bounds: win.getBounds(),
  });

  // Apply the icon after native window creation as well. On Windows this also
  // sets the taskbar button identity and relaunch icon instead of inheriting
  // electron.exe's defaults during development or from an old shortcut.
  win.setIcon(windowIcon);
  if (process.platform === "win32") {
    win.setAppDetails({
      appId: projectConfig.app.id,
      appIconPath: windowIconPath,
      appIconIndex: 0,
    });
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("console-message", (details) => {
    const sourceId = String(details.sourceId || "");
    if (
      sourceId.includes("/@vite/") ||
      sourceId.includes("cdn.userjot.com") ||
      sourceId.startsWith("node:electron/")
    ) {
      return;
    }
    const method = details.level === "warning" ? "warn" : details.level;
    if (typeof console[method] === "function") {
      console[method](
        `[Renderer ${sourceId}:${details.lineNumber || 0}] ${details.message}`,
      );
    }
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    if (
      forceQuit ||
      systemShutdownStarted ||
      details.reason === "clean-exit"
    ) {
      return;
    }
    void showDiagnosticDialog({
      kind: "Renderer process stopped",
      error: new Error(`Renderer stopped: ${details.reason}`),
      details: {
        reason: details.reason,
        exitCode: details.exitCode,
      },
      canReload: true,
    });
  });

  win.webContents.on("did-finish-load", () => {
    recordDiagnosticEvent("window", "renderer-loaded", {
      development: Boolean(process.env.ELECTRON_RENDERER_URL),
    });
  });

  win.on("unresponsive", () => {
    if (forceQuit || systemShutdownStarted) return;
    void showDiagnosticDialog({
      kind: "Renderer became unresponsive",
      error: new Error("The application window stopped responding."),
      canReload: true,
    });
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    const rendererUrl = new URL(process.env.ELECTRON_RENDERER_URL);
    rendererUrl.searchParams.set("theme", initialTheme);
    rendererUrl.searchParams.set("accent", initialAccent);
    win.loadURL(rendererUrl.toString());
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"), {
      query: { theme: initialTheme, accent: initialAccent },
    });
  }

  mainWindow = win;
  updateConnectionBadge();
  win.on("query-session-end", () => {
    notifyRendererShutdown("session-end");
  });
  win.on("session-end", () => {
    notifyRendererShutdown("session-end");
  });
  win.on("close", (event) => {
    if (
      forceQuit ||
      systemShutdownStarted ||
      !appConfig.appSettings?.closeToTray
    ) {
      return;
    }

    event.preventDefault();
    win.hide();
  });
  win.on("closed", () => {
    recordDiagnosticEvent("window", "closed");
    if (mainWindow === win) {
      mainWindow = null;
    }
  });
}

app.whenReady().then(async () => {
  await cleanupOldDiagnosticLogs();
  await cleanupCompletedUpdateSetups();
  await migratePackagedUserData();
  await cleanupIncomingTempDirectory();
  appConfig = await loadConfig();
  recordDiagnosticEvent("app", "ready", {
    locale: app.getLocale(),
    configLoaded: true,
    autostart: Boolean(appConfig.appSettings?.autostart),
    closeToTray: appConfig.appSettings?.closeToTray !== false,
    theme: appConfig.appSettings?.theme || "system",
  });
  await applyAutostartSettings();
  createTray();

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const requestingWindow = BrowserWindow.fromWebContents(webContents);
      callback(requestingWindow === mainWindow && permission === "media");
    },
  );
  ipcMain.handle("install-update", async (event, details) => {
    const onProgress = (progress) => event.sender.send("update-progress", progress);
    recordDiagnosticEvent("update", "install-started", {
      platform: process.platform,
      version: details.version,
    });
    try {
      const result = process.platform === "linux"
        ? await installLinuxAppImageUpdate(
            details.url,
            details.sha256,
            details.sha512,
            details.version,
            onProgress,
          )
        : await installWindowsUpdate(
            details.url,
            details.sha256,
            details.sha512,
            onProgress,
          );
      recordDiagnosticEvent("update", "installer-launched", {
        platform: process.platform,
        version: details.version,
      });
      return result;
    } catch (error) {
      recordDiagnosticEvent("update", "install-failed", {
        platform: process.platform,
        version: details.version,
        error: error?.message || "Unknown update error",
      });
      throw error;
    }
  });
  ipcMain.on("renderer-error", (event, details = {}) => {
    if (BrowserWindow.fromWebContents(event.sender) !== mainWindow) return;
    const error = new Error(
      String(details.message || "Unknown renderer error").slice(0, 2000),
    );
    error.name = String(details.name || "RendererError").slice(0, 120);
    if (details.stack) error.stack = String(details.stack).slice(0, 12000);
    void showDiagnosticDialog({
      kind: details.unhandledRejection
        ? "Unhandled renderer promise rejection"
        : "Unhandled renderer error",
      error,
      details: {
        source: String(details.source || "").slice(0, 500),
        line: Number(details.line) || 0,
        column: Number(details.column) || 0,
      },
    });
  });
  ipcMain.on("diagnostic-event", (event, details = {}) => {
    if (BrowserWindow.fromWebContents(event.sender) !== mainWindow) return;
    recordDiagnosticEvent(
      "renderer",
      String(details.event || "event").slice(0, 160),
      details.data && typeof details.data === "object" ? details.data : {},
    );
  });
  ipcMain.handle("download-update", async (_event, details = {}) => {
    try {
      const result = await stageWindowsUpdateInstaller(
        details.url,
        details.sha256,
        details.sha512,
      );
      return { ok: true, cached: result.cached };
    } catch (error) {
      return { ok: false, error: error?.message || "Update download failed." };
    }
  });
  ipcMain.handle("open-microsoft-store-updates", async () => {
    if (process.platform !== "win32" || !process.windowsStore) {
      return { ok: false };
    }
    const storeUri = projectConfig.windowsStore?.productId
      ? `ms-windows-store://pdp/?productid=${projectConfig.windowsStore.productId}`
      : "ms-windows-store://downloadsandupdates";
    await shell.openExternal(storeUri);
    return { ok: true };
  });
  ipcMain.handle("fetch-update-manifest", async (_event, url) => {
    try {
      return { ok: true, text: await fetchUpdateManifest(url) };
    } catch (error) {
      return {
        ok: false,
        error: error?.message || "Update manifest request failed.",
      };
    }
  });

  ipcMain.handle("fetch-changelog-feed", async () => {
    try {
      return { ok: true, text: await fetchChangelogFeed() };
    } catch (error) {
      return {
        ok: false,
        error: error?.message || "Changelog request failed.",
      };
    }
  });
  ipcMain.handle("load-config", () => loadConfig());
  ipcMain.handle("save-config", (_event, config) => saveConfig(config));
  ipcMain.handle("get-config-path", () => getConfigPath());
  ipcMain.handle("open-call-health-window", (event) => {
    if (!isCustomSoundRequest(event)) return { ok: false };
    return openCallHealthWindow();
  });
  ipcMain.handle("get-call-health-window-data", (event) =>
    BrowserWindow.fromWebContents(event.sender) === callHealthWindow
      ? callHealthPayload
      : null,
  );
  ipcMain.on("update-call-health-window", (event, details) => {
    if (!isCustomSoundRequest(event)) return;
    callHealthPayload = normalizeCallHealthPayload(details);
    sendCallHealthPayload();
  });
  ipcMain.on("close-call-health-window", (event) => {
    if (!isCustomSoundRequest(event)) return;
    closeCallHealthWindow();
  });
  ipcMain.handle("get-system-accent-color", () => {
    try {
      return { color: normalizeAccentColor(systemPreferences.getAccentColor()) };
    } catch {
      return { color: "" };
    }
  });
  ipcMain.handle("list-themes", async () => ({
    path: getThemesPath(),
    themes: await listThemes(),
  }));
  ipcMain.handle("open-themes-folder", () => openThemesFolder());
  ipcMain.handle("load-theme", (_event, fileName) => loadTheme(fileName));
  ipcMain.handle("choose-received-file-directory", (event) =>
    chooseReceivedFileDirectory(event),
  );
  protocol.handle("aero-temp", async (request) => {
    const url = new URL(request.url);
    const tempRef = url.hostname === "file" ? url.pathname.slice(1) : "";
    const entry = incomingTempFiles.get(tempRef);
    if (!entry?.finalized) return new Response("Not found", { status: 404 });
    const response = await net.fetch(pathToFileURL(entry.path).toString(), {
      headers: request.headers,
    });
    const headers = new Headers(response.headers);
    headers.set("content-type", entry.mimeType || "application/octet-stream");
    headers.set("content-disposition", "inline");
    return new Response(response.body, { status: response.status, headers });
  });
  ipcMain.handle("save-received-file", (event, details) =>
    saveReceivedFile(event, details),
  );
  ipcMain.handle("prepare-incoming-file", (event, details) => prepareIncomingFile(event, details));
  ipcMain.handle("append-incoming-file", (event, tempRef, data) => appendIncomingFile(event, tempRef, data));
  ipcMain.handle("finalize-incoming-file", (event, tempRef) => finalizeIncomingFile(event, tempRef));
  ipcMain.handle("release-incoming-file", (event, tempRef) => releaseIncomingFile(event, tempRef));
  ipcMain.handle("scan-incoming-file", (event, tempRef) => scanIncomingFile(event, tempRef));
  ipcMain.handle("get-incoming-file-url", (event, tempRef) => getIncomingFileUrl(event, tempRef));
  ipcMain.handle("cleanup-incoming-files", async (event) => {
    if (!isCustomSoundRequest(event)) return { ok: false };
    await cleanupIncomingTempDirectory();
    return { ok: true };
  });
  ipcMain.handle("save-custom-sound", async (event, soundId, data) => {
    if (!isCustomSoundRequest(event)) {
      return { ok: false, error: "Unauthorized sound request." };
    }
    const targetPath = getCustomSoundPath(String(soundId || ""));
    const buffer = toCustomSoundBuffer(data);
    if (!targetPath || !buffer || buffer.length < 4 || buffer.length > maxCustomSoundBytes) {
      return { ok: false, error: "Invalid custom sound file." };
    }
    if (!isOggOpus(buffer)) {
      return { ok: false, error: "Custom sounds must be OGG/Opus files." };
    }

    try {
      await mkdir(getCustomSoundsPath(), { recursive: true });
      const temporaryPath = `${targetPath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, buffer);
      await rename(temporaryPath, targetPath);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || "Sound could not be saved." };
    }
  });
  ipcMain.handle("load-custom-sound", async (event, soundId) => {
    if (!isCustomSoundRequest(event)) {
      return { ok: false, error: "Unauthorized sound request." };
    }
    const targetPath = getCustomSoundPath(String(soundId || ""));
    if (!targetPath) return { ok: false, error: "Unknown sound." };
    try {
      const buffer = await readFile(targetPath);
      if (
        buffer.length < 4 ||
        buffer.length > maxCustomSoundBytes ||
        !isOggOpus(buffer)
      ) {
        return { ok: false, error: "Stored sound is invalid." };
      }
      return { ok: true, data: buffer };
    } catch {
      return { ok: false, missing: true };
    }
  });
  ipcMain.handle("delete-custom-sound", async (event, soundId) => {
    if (!isCustomSoundRequest(event)) {
      return { ok: false, error: "Unauthorized sound request." };
    }
    const targetPath = getCustomSoundPath(String(soundId || ""));
    if (!targetPath) return { ok: false, error: "Unknown sound." };
    try {
      await rm(targetPath, { force: true });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || "Sound could not be removed." };
    }
  });
  ipcMain.handle("open-custom-sounds-folder", async (event) => {
    if (!isCustomSoundRequest(event)) {
      return { ok: false, error: "Unauthorized sound request." };
    }
    try {
      const directory = getCustomSoundsPath();
      await mkdir(directory, { recursive: true });
      const error = await shell.openPath(directory);
      return error ? { ok: false, error } : { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || "Folder could not be opened." };
    }
  });
  ipcMain.handle("save-custom-wallpaper", async (event, wallpaperId, data) => {
    if (!isCustomSoundRequest(event)) {
      return { ok: false, error: "Unauthorized wallpaper request." };
    }
    const targetPath = getCustomWallpaperPath(String(wallpaperId || ""));
    const buffer = toCustomSoundBuffer(data);
    if (
      !targetPath ||
      !buffer ||
      buffer.length < 16 ||
      buffer.length > maxCustomWallpaperBytes ||
      !isWebpImage(buffer)
    ) {
      return { ok: false, error: "Wallpaper must be an optimized WebP image." };
    }
    try {
      await mkdir(getCustomWallpapersPath(), { recursive: true });
      const temporaryPath = `${targetPath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, buffer);
      await rename(temporaryPath, targetPath);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || "Wallpaper could not be saved." };
    }
  });
  ipcMain.handle("load-custom-wallpaper", async (event, wallpaperId) => {
    if (!isCustomSoundRequest(event)) {
      return { ok: false, error: "Unauthorized wallpaper request." };
    }
    const targetPath = getCustomWallpaperPath(String(wallpaperId || ""));
    if (!targetPath) return { ok: false, error: "Unknown wallpaper." };
    try {
      const buffer = await readFile(targetPath);
      if (
        buffer.length < 16 ||
        buffer.length > maxCustomWallpaperBytes ||
        !isWebpImage(buffer)
      ) {
        return { ok: false, error: "Stored wallpaper is invalid." };
      }
      return { ok: true, data: buffer };
    } catch {
      return { ok: false, missing: true };
    }
  });
  ipcMain.handle("delete-custom-wallpaper", async (event, wallpaperId) => {
    if (!isCustomSoundRequest(event)) {
      return { ok: false, error: "Unauthorized wallpaper request." };
    }
    const targetPath = getCustomWallpaperPath(String(wallpaperId || ""));
    if (!targetPath) return { ok: false, error: "Unknown wallpaper." };
    try {
      await rm(targetPath, { force: true });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || "Wallpaper could not be removed." };
    }
  });
  ipcMain.handle("open-custom-wallpapers-folder", async (event) => {
    if (!isCustomSoundRequest(event)) {
      return { ok: false, error: "Unauthorized wallpaper request." };
    }
    try {
      const directory = getCustomWallpapersPath();
      await mkdir(directory, { recursive: true });
      const error = await shell.openPath(directory);
      return error ? { ok: false, error } : { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || "Wallpaper folder could not be opened." };
    }
  });
  ipcMain.handle("fetch-online-theme", async (_event, url) => {
    try {
      return { ok: true, css: await fetchOnlineThemeCss(url) };
    } catch (error) {
      return { ok: false, error: error?.message || "Theme could not be loaded." };
    }
  });
  ipcMain.on("update-tray-state", (_event, state) => {
    const nextTrayState = { ...trayState, ...state };
    // The renderer synchronizes every 1.5 seconds. Replacing an open native
    // tray menu with an identical menu closes its submenus on Linux, so only
    // rebuild when an item the user can see has actually changed.
    if (!hasTrayStateChanged(nextTrayState)) {
      return;
    }

    trayState = nextTrayState;
    updateConnectionBadge();
    updateTrayMenu();
  });
  ipcMain.handle("get-screen-sources", async (event) => {
    const requestingWindow = BrowserWindow.fromWebContents(event.sender);
    if (requestingWindow !== mainWindow) {
      return [];
    }

    let sources;
    try {
      sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      });
      recordDiagnosticEvent("screen-share", "sources-selected", {
        count: sources.length,
        linuxSession:
          process.platform === "linux"
            ? process.env.XDG_SESSION_TYPE || "unknown"
            : undefined,
      });
    } catch (error) {
      recordDiagnosticEvent("screen-share", "source-selection-failed", {
        name: error?.name || "Error",
        error: error?.message || "Unknown capture error",
      });
      throw error;
    }
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      displayId: source.display_id,
      thumbnail: source.thumbnail?.toDataURL() || "",
      appIcon: source.appIcon?.toDataURL?.() || "",
    }));
  });
  ipcMain.handle("write-clipboard", (_event, text) => {
    clipboard.writeText(String(text || ""));
    return { ok: true };
  });
  ipcMain.handle("open-external-link", async (_event, rawUrl) => {
    const url = normalizeExternalLinkUrl(rawUrl);
    if (!url) return { ok: false, error: "Invalid external link." };
    await shell.openExternal(url);
    return { ok: true };
  });
  ipcMain.handle("get-notification-state", () => getAppNotificationState());
  ipcMain.handle("show-app-notification", (_event, details) =>
    showAppNotification(details),
  );
  ipcMain.handle("close-app-notification", (_event, id) =>
    closeAppNotification(id),
  );
  ipcMain.handle("notification-action", (_event, action) => {
    sendNotificationAction(action);
    return { ok: true };
  });
  ipcMain.on("update-toast-height", (event, height) => {
    if (toastWindow && !toastWindow.isDestroyed()) {
      const display = screen.getPrimaryDisplay();
      const workArea = display.workArea;
      // We set height to height or minimum 10 so it's not totally 0.
      const h = Math.max(10, height);
      toastWindow.setBounds({
        x: workArea.x + workArea.width - 380 - 10,
        y: workArea.y + workArea.height - h - 10,
        width: 380,
        height: h,
      });
      // Hide if empty
      if (height <= 0) {
        toastWindow.hide();
      } else {
        toastWindow.showInactive();
      }
    }
  });
  ipcMain.on("realtime-cleanup-complete", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win === mainWindow && delayedQuitStarted && systemShutdownStarted) {
      finishDelayedQuit();
    }
  });
  ipcMain.handle("window-control", (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { ok: false };
    if (action === "minimize") win.minimize();
    if (action === "maximize") {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
    if (action === "close") win.close();
    return { ok: true, maximized: win.isMaximized() };
  });
  ipcMain.on("console-log", (event, msg) => {
    console.log("[Renderer Log]:", msg);
  });
  systemPreferences.on("accent-color-changed", (_event, color) => {
    const accent = normalizeAccentColor(color);
    if (accent && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("system-accent-color-changed", accent);
    }
  });
  createWindow({ hidden: shouldStartHidden() });

  powerMonitor.on("shutdown", () => {
    notifyRendererShutdown("shutdown");
  });

  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("before-quit", (event) => {
  recordDiagnosticEvent("app", "before-quit", {
    forced: forceQuit,
    shutdown: systemShutdownStarted,
  });
  if (delayedQuitStarted || systemShutdownStarted) {
    return;
  }

  delayedQuitStarted = true;
  notifyRendererShutdown("quit");
  event.preventDefault();
  delayedQuitTimer = setTimeout(finishDelayedQuit, 900);
});

app.on("window-all-closed", () => {
  if (
    forceQuit ||
    systemShutdownStarted ||
    !appConfig.appSettings?.closeToTray
  ) {
    app.quit();
  }
});

app.on("child-process-gone", (_event, details) => {
  if (
    forceQuit ||
    systemShutdownStarted ||
    !["crashed", "oom", "launch-failed", "integrity-failure"].includes(
      details.reason,
    )
  ) {
    return;
  }
  void showDiagnosticDialog({
    kind: "Electron child process stopped",
    error: new Error(
      `${details.type || "Child process"} stopped: ${details.reason}`,
    ),
    details: {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
      serviceName: details.serviceName,
      name: details.name,
    },
    canReload: details.type === "GPU",
  });
});
