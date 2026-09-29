const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aeroChat", {
  platform: process.platform,
  usesLinuxSystemScreenPicker:
    process.platform === "linux" &&
    (Boolean(process.env.WAYLAND_DISPLAY) ||
      String(process.env.XDG_SESSION_TYPE || "").toLowerCase() === "wayland"),
  isPackaged: !process.defaultApp,
  isWindowsStore: Boolean(process.windowsStore),
  isAppImage: process.platform === "linux" && Boolean(process.env.APPIMAGE),
  installUpdate: (details) => ipcRenderer.invoke("install-update", details),
  downloadUpdate: (details) => ipcRenderer.invoke("download-update", details),
  openMicrosoftStoreUpdates: () =>
    ipcRenderer.invoke("open-microsoft-store-updates"),
  onUpdateProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("update-progress", listener);
    return () => {
      ipcRenderer.removeListener("update-progress", listener);
    };
  },
  fetchUpdateManifest: (url) =>
    ipcRenderer.invoke("fetch-update-manifest", url),
  fetchChangelogFeed: () => ipcRenderer.invoke("fetch-changelog-feed"),
  onCheckForUpdates: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("check-for-updates", listener);
    return () => {
      ipcRenderer.removeListener("check-for-updates", listener);
    };
  },
  onDisconnect: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("disconnect-p2p", listener);
    return () => {
      ipcRenderer.removeListener("disconnect-p2p", listener);
    };
  },
  updateTrayState: (state) => ipcRenderer.send("update-tray-state", state),
  onTrayAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on("tray-action", listener);
    return () => {
      ipcRenderer.removeListener("tray-action", listener);
    };
  },
  loadConfig: () => ipcRenderer.invoke("load-config"),
  saveConfig: (config) => ipcRenderer.invoke("save-config", config),
  getConfigPath: () => ipcRenderer.invoke("get-config-path"),
  getSystemAccentColor: () => ipcRenderer.invoke("get-system-accent-color"),
  onSystemAccentColorChanged: (callback) => {
    const listener = (_event, color) => callback(color);
    ipcRenderer.on("system-accent-color-changed", listener);
    return () => {
      ipcRenderer.removeListener("system-accent-color-changed", listener);
    };
  },
  listThemes: () => ipcRenderer.invoke("list-themes"),
  openThemesFolder: () => ipcRenderer.invoke("open-themes-folder"),
  loadTheme: (fileName) => ipcRenderer.invoke("load-theme", fileName),
  chooseReceivedFileDirectory: () =>
    ipcRenderer.invoke("choose-received-file-directory"),
  saveReceivedFile: (details) =>
    ipcRenderer.invoke("save-received-file", details),
  prepareIncomingFile: (details) =>
    ipcRenderer.invoke("prepare-incoming-file", details),
  appendIncomingFile: (tempRef, data) =>
    ipcRenderer.invoke("append-incoming-file", tempRef, data),
  finalizeIncomingFile: (tempRef) =>
    ipcRenderer.invoke("finalize-incoming-file", tempRef),
  releaseIncomingFile: (tempRef) =>
    ipcRenderer.invoke("release-incoming-file", tempRef),
  scanIncomingFile: (tempRef) =>
    ipcRenderer.invoke("scan-incoming-file", tempRef),
  getIncomingFileUrl: (tempRef) =>
    ipcRenderer.invoke("get-incoming-file-url", tempRef),
  cleanupIncomingFiles: () =>
    ipcRenderer.invoke("cleanup-incoming-files"),
  saveCustomSound: (soundId, data) =>
    ipcRenderer.invoke("save-custom-sound", soundId, data),
  loadCustomSound: (soundId) => ipcRenderer.invoke("load-custom-sound", soundId),
  deleteCustomSound: (soundId) =>
    ipcRenderer.invoke("delete-custom-sound", soundId),
  openCustomSoundsFolder: () => ipcRenderer.invoke("open-custom-sounds-folder"),
  saveCustomWallpaper: (wallpaperId, data) =>
    ipcRenderer.invoke("save-custom-wallpaper", wallpaperId, data),
  loadCustomWallpaper: (wallpaperId) =>
    ipcRenderer.invoke("load-custom-wallpaper", wallpaperId),
  deleteCustomWallpaper: (wallpaperId) =>
    ipcRenderer.invoke("delete-custom-wallpaper", wallpaperId),
  openCustomWallpapersFolder: () =>
    ipcRenderer.invoke("open-custom-wallpapers-folder"),
  fetchOnlineTheme: (url) => ipcRenderer.invoke("fetch-online-theme", url),
  getScreenSources: () => ipcRenderer.invoke("get-screen-sources"),
  writeClipboard: (text) => ipcRenderer.invoke("write-clipboard", text),
  openExternalLink: (url) => ipcRenderer.invoke("open-external-link", url),
  getNotificationState: () => ipcRenderer.invoke("get-notification-state"),
  showNotification: (details) =>
    ipcRenderer.invoke("show-app-notification", details),
  closeNotification: (id) => ipcRenderer.invoke("close-app-notification", id),
  onNotificationAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on("notification-action", listener);
    return () => {
      ipcRenderer.removeListener("notification-action", listener);
    };
  },
  onSystemShutdown: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("system-shutdown", listener);
    return () => {
      ipcRenderer.removeListener("system-shutdown", listener);
    };
  },
  openCallHealthWindow: () => ipcRenderer.invoke("open-call-health-window"),
  getCallHealthWindowData: () =>
    ipcRenderer.invoke("get-call-health-window-data"),
  updateCallHealthWindow: (details) =>
    ipcRenderer.send("update-call-health-window", details),
  closeCallHealthWindow: () => ipcRenderer.send("close-call-health-window"),
  onCallHealthUpdate: (callback) => {
    const listener = (_event, details) => callback(details);
    ipcRenderer.on("call-health-update", listener);
    return () => ipcRenderer.removeListener("call-health-update", listener);
  },
  realtimeCleanupComplete: () => ipcRenderer.send("realtime-cleanup-complete"),
  windowControl: (action) => ipcRenderer.invoke("window-control", action),
  log: (msg) => ipcRenderer.send("console-log", msg),
});

contextBridge.exposeInMainWorld("aeroChatNotification", {
  action: (action) => ipcRenderer.invoke("notification-action", action),
  close: (id) => ipcRenderer.invoke("close-app-notification", id),
  onShowToast: (callback) => {
    const listener = (_event, details) => callback(details);
    ipcRenderer.on("show-toast", listener);
    return () => ipcRenderer.removeListener("show-toast", listener);
  },
  onCloseToast: (callback) => {
    const listener = (_event, id) => callback(id);
    ipcRenderer.on("close-toast", listener);
    return () => ipcRenderer.removeListener("close-toast", listener);
  },
  updateToastHeight: (height) =>
    ipcRenderer.send("update-toast-height", height),
});
