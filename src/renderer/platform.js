import { Capacitor, CapacitorHttp, registerPlugin } from "@capacitor/core";
import { Clipboard } from "@capacitor/clipboard";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Preferences } from "@capacitor/preferences";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { FileOpener } from "@capacitor-community/file-opener";
import { App } from "@capacitor/app";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { StatusBar, Style } from "@capacitor/status-bar";

const BackgroundMode = registerPlugin("AeroBackgroundMode");
const AeroFileSave = registerPlugin("AeroFileSave");

const CONFIG_KEY = "aero-p2p-chat.config.v1";
const MAX_REMOTE_THEME_BYTES = 2 * 1024 * 1024;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("File could not be read."));
    reader.onload = () => resolve(String(reader.result || "").split(",", 2)[1] || "");
    reader.readAsDataURL(blob);
  });
}

function arrayBufferToBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(value) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function triggerBrowserDownload(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.rel = "noopener";
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  return { ok: true, scanStatus: "browser" };
}

function assertRemoteThemeUrl(value) {
  const url = new URL(String(value || "").trim());
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Only valid HTTPS theme URLs are allowed.");
  }
  return url;
}

function assertRemoteThemeSize(text) {
  const css = String(text || "");
  if (new TextEncoder().encode(css).length > MAX_REMOTE_THEME_BYTES) {
    throw new Error("Theme file is too large.");
  }
  return css;
}

function getChromeStorage() {
  const chromeApi = globalThis.chrome;
  if (!chromeApi?.runtime?.id || !chromeApi?.storage?.local) {
    return null;
  }
  return chromeApi.storage.local;
}

function getElectronApi() {
  return window.aeroChat || null;
}

function getCapacitorPlatform() {
  try {
    return Capacitor.getPlatform();
  } catch {
    return "web";
  }
}

function isNativeCapacitor() {
  return getCapacitorPlatform() !== "web";
}

async function readStoredConfig() {
  const chromeStorage = getChromeStorage();
  if (chromeStorage) {
    const stored = await chromeStorage.get(CONFIG_KEY);
    return stored[CONFIG_KEY] || {};
  }

  const result = await Preferences.get({ key: CONFIG_KEY });
  if (!result.value) {
    return {};
  }
  return JSON.parse(result.value);
}

async function writeStoredConfig(config) {
  const chromeStorage = getChromeStorage();
  if (chromeStorage) {
    await chromeStorage.set({ [CONFIG_KEY]: config || {} });
    return;
  }

  await Preferences.set({
    key: CONFIG_KEY,
    value: JSON.stringify(config || {}),
  });
}

async function requestLocalNotificationPermission() {
  const current = await LocalNotifications.checkPermissions();
  if (current.display === "granted") {
    return true;
  }

  const requested = await LocalNotifications.requestPermissions();
  return requested.display === "granted";
}

function getAndroidNotificationId(value) {
  const text = String(value || "notification");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash & 0x7fffffff || 1;
}

async function applyMobileSystemTheme(theme) {
  if (!isNativeCapacitor()) {
    return;
  }

  const dark = theme === "dark" || theme === "ultra-dark";
  await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
  if (getCapacitorPlatform() === "android") {
    await StatusBar.setBackgroundColor({ color: theme === "ultra-dark" ? "#000000" : dark ? "#232428" : "#eaf1f5" });
  }
}

async function showWebNotification({ title, body }) {
  if (!("Notification" in window)) {
    return { ok: false, unsupported: true };
  }

  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }

  if (Notification.permission !== "granted") {
    return { ok: false, denied: true };
  }

  new Notification(title || "Aero P2P Chat", { body: body || "" });
  return { ok: true };
}

export function createPlatformApi() {
  const electron = getElectronApi();
  const isChromeExtension = Boolean(getChromeStorage());
  const capacitorPlatform = getCapacitorPlatform();
  const platform =
    electron?.platform ||
    (isChromeExtension ? "chrome-extension" : capacitorPlatform || "web");
  const isAndroid = platform === "android";
  const isElectron = Boolean(electron);
  const isWindowsStore = Boolean(electron?.isWindowsStore);
  let androidUpdateProgressCallback = null;
  const browserTempFiles = new Map();
  let browserTempDirectoryPromise = null;

  async function getBrowserTempDirectory() {
    if (!navigator.storage?.getDirectory) {
      throw new Error("Private temporary storage is unavailable in this browser.");
    }
    if (!browserTempDirectoryPromise) {
      browserTempDirectoryPromise = (async () => {
        const root = await navigator.storage.getDirectory();
        const directory = await root.getDirectoryHandle("aero-received", { create: true });
        for await (const name of directory.keys()) {
          await directory.removeEntry(name, { recursive: true }).catch(() => {});
        }
        return directory;
      })();
    }
    return browserTempDirectoryPromise;
  }

  async function getBrowserTempFile(tempRef) {
    const entry = browserTempFiles.get(tempRef);
    if (!entry?.handle) throw new Error("The temporary file is no longer available.");
    return entry.handle.getFile();
  }

  return {
    platform,
    isAndroid,
    isElectron,
    isPackaged: Boolean(electron?.isPackaged),
    isWindowsStore,
    isChromeExtension,
    hasNativeWindowControls: isElectron,
    hasDesktopIntegration: isElectron,
    supportsAutostart: isElectron,
    supportsCloseToTray: isElectron,
    supportsUpdateChecks: isElectron || isAndroid,
    supportsNativeUpdateInstall: platform === "win32" && !isWindowsStore,
    supportsUpdateDownloads:
      platform === "win32" &&
      !isWindowsStore &&
      Boolean(electron?.isPackaged) &&
      Boolean(electron?.downloadUpdate),
    supportsDesktopScreenSources: isElectron,
    supportsCustomSounds: isElectron,
    supportsCustomWallpapers: isElectron,
    supportsFileDirectoryChoice: isElectron || isAndroid,
    supportsReceivedFileScan:
      isElectron && ["win32", "linux"].includes(platform),

    async prepareIncomingFile({ id, name, size, mimeType, sha256 }) {
      if (electron?.prepareIncomingFile) {
        return electron.prepareIncomingFile({ id, name, size, mimeType, sha256 });
      }
      if (isAndroid) {
        return AeroFileSave.beginReceive({ id, name, size, mimeType, sha256 });
      }
      try {
        const estimate = await navigator.storage?.estimate?.();
        const available = Number(estimate?.quota) - Number(estimate?.usage);
        const reserve = Math.max(64 * 1024 * 1024, Math.floor(Number(estimate?.quota || 0) * 0.02));
        if (Number.isFinite(available) && available > 0 && available < size + reserve) {
          return { ok: false, noSpace: true, error: "Not enough private browser storage is available." };
        }
        const persistenceRequest = navigator.storage?.persist?.();
        if (persistenceRequest) await persistenceRequest.catch(() => false);
        const directory = await getBrowserTempDirectory();
        const handle = await directory.getFileHandle(`${id}.part`, { create: true });
        const writable = await handle.createWritable({ keepExistingData: false });
        browserTempFiles.set(id, { handle, writable, received: 0, size, mimeType, name });
        return { ok: true, tempRef: id };
      } catch (error) {
        return { ok: false, error: error?.message || "Private temporary storage could not be created." };
      }
    },

    async appendIncomingFile(tempRef, value) {
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
      if (electron?.appendIncomingFile) {
        return electron.appendIncomingFile(tempRef, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      }
      if (isAndroid) {
        return AeroFileSave.appendReceive({ tempRef, data: arrayBufferToBase64(bytes) });
      }
      const entry = browserTempFiles.get(tempRef);
      if (!entry?.writable || entry.received + bytes.byteLength > entry.size) {
        throw new Error("Invalid temporary file write.");
      }
      await entry.writable.write(bytes);
      entry.received += bytes.byteLength;
      return { ok: true };
    },

    async finalizeIncomingFile(tempRef) {
      if (electron?.finalizeIncomingFile) {
        return electron.finalizeIncomingFile(tempRef);
      }
      if (isAndroid) {
        const result = await AeroFileSave.finishReceive({ tempRef });
        return {
          ...result,
          header: result?.headerBase64 ? base64ToArrayBuffer(result.headerBase64) : null,
        };
      }
      try {
        const entry = browserTempFiles.get(tempRef);
        if (!entry?.writable || entry.received !== entry.size) throw new Error("The temporary file is incomplete.");
        await entry.writable.close();
        entry.writable = null;
        const file = await entry.handle.getFile();
        return {
          ok: file.size === entry.size,
          size: file.size,
          header: await file.slice(0, 64 * 1024).arrayBuffer(),
        };
      } catch (error) {
        return { ok: false, error: error?.message || "The temporary file could not be finalized." };
      }
    },

    async createReceivedFilePreview(tempRef, mimeType) {
      if (electron?.getIncomingFileUrl) return electron.getIncomingFileUrl(tempRef);
      if (isAndroid) {
        const result = await AeroFileSave.getReceiveUri({ tempRef });
        return result?.uri ? Capacitor.convertFileSrc(result.uri) : "";
      }
      const file = await getBrowserTempFile(tempRef);
      return URL.createObjectURL(new File([file], file.name, { type: mimeType || file.type }));
    },

    async releaseReceivedFile(tempRef) {
      if (!tempRef) return;
      if (electron?.releaseIncomingFile) return electron.releaseIncomingFile(tempRef);
      if (isAndroid) return AeroFileSave.releaseReceive({ tempRef });
      const entry = browserTempFiles.get(tempRef);
      browserTempFiles.delete(tempRef);
      await entry?.writable?.abort?.().catch(() => {});
      const directory = await getBrowserTempDirectory().catch(() => null);
      await directory?.removeEntry(`${tempRef}.part`).catch(() => {});
    },

    async cleanupReceivedFiles() {
      if (electron?.cleanupIncomingFiles) return electron.cleanupIncomingFiles();
      if (isAndroid) return AeroFileSave.cleanupReceives();
      const entries = Array.from(browserTempFiles.values());
      browserTempFiles.clear();
      await Promise.all(entries.map((entry) => entry.writable?.abort?.().catch(() => {})));
      const directory = await getBrowserTempDirectory().catch(() => null);
      if (directory) {
        for await (const name of directory.keys()) {
          await directory.removeEntry(name, { recursive: true }).catch(() => {});
        }
      }
      return { ok: true };
    },

    async chooseReceivedFileDirectory() {
      if (electron?.chooseReceivedFileDirectory) {
        return electron.chooseReceivedFileDirectory();
      }
      if (isAndroid) {
        return AeroFileSave.chooseDirectory();
      }
      return { ok: false, unsupported: true };
    },

    async saveReceivedFile({ blob, tempRef, name, mimeType, sha256, mode, directory }) {
      if (!(blob instanceof Blob) && !tempRef) {
        return { ok: false, error: "The received file is unavailable." };
      }
      if (electron?.saveReceivedFile) {
        return electron.saveReceivedFile({
          ...(tempRef ? { tempRef } : { data: await blob.arrayBuffer() }),
          name,
          mimeType,
          sha256,
          mode,
          directory,
        });
      }
      if (isAndroid) {
        return AeroFileSave.saveFile({
          ...(tempRef ? { tempRef } : { data: await blobToBase64(blob) }),
          name,
          mimeType,
          sha256,
          mode,
          directory,
        });
      }

      const sourceBlob = blob instanceof Blob ? blob : await getBrowserTempFile(tempRef);

      const chromeApi = globalThis.chrome;
      if (isChromeExtension && chromeApi?.downloads?.download) {
        const objectUrl = URL.createObjectURL(sourceBlob);
        try {
          const downloadId = await chromeApi.downloads.download({
            url: objectUrl,
            filename: name,
            saveAs: mode === "ask",
          });
          setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
          return { ok: Boolean(downloadId), scanStatus: "browser" };
        } catch (error) {
          URL.revokeObjectURL(objectUrl);
          return { ok: false, error: error?.message || "The file could not be saved." };
        }
      }

      if (mode === "ask" && typeof window.showSaveFilePicker === "function") {
        try {
          const handle = await window.showSaveFilePicker({ suggestedName: name });
          const writable = await handle.createWritable();
          await writable.write(sourceBlob);
          await writable.close();
          return { ok: true, scanStatus: "browser" };
        } catch (error) {
          if (error?.name === "AbortError") return { ok: false, canceled: true };
          return { ok: false, error: error?.message || "The file could not be saved." };
        }
      }
      return triggerBrowserDownload(sourceBlob, name);
    },

    async scanReceivedFile(tempRef) {
      if (!electron?.scanIncomingFile || !tempRef) {
        return { ok: false, unsupported: true };
      }
      return electron.scanIncomingFile(tempRef);
    },

    async loadConfig() {
      if (electron?.loadConfig) {
        const loaded = await electron.loadConfig();
        return loaded && typeof loaded === "object" ? loaded : {};
      }

      try {
        return await readStoredConfig();
      } catch {
        return {};
      }
    },

    async openMicrosoftStoreUpdates() {
      if (electron?.openMicrosoftStoreUpdates) {
        return electron.openMicrosoftStoreUpdates();
      }
      return { ok: false };
    },

    async downloadUpdate(details) {
      if (!electron?.downloadUpdate) {
        return { ok: false, unsupported: true };
      }
      return electron.downloadUpdate(details);
    },

    async saveConfig(config) {
      if (electron?.saveConfig) {
        return electron.saveConfig(config);
      }

      await writeStoredConfig(config);
      return { ok: true };
    },

    async getSystemAccentColor() {
      if (electron?.getSystemAccentColor) {
        return electron.getSystemAccentColor();
      }
      return { color: "" };
    },

    onSystemAccentColorChanged(callback) {
      return electron?.onSystemAccentColorChanged?.(callback) || null;
    },

    async listThemes() {
      if (electron?.listThemes) {
        return electron.listThemes();
      }
      return { path: "", themes: [] };
    },

    async openThemesFolder() {
      if (electron?.openThemesFolder) {
        return electron.openThemesFolder();
      }
      return { ok: false, unsupported: true };
    },

    async loadTheme(fileName) {
      if (electron?.loadTheme) {
        return electron.loadTheme(fileName);
      }
      return { ok: false, error: "Custom themes are available in the desktop app." };
    },

    async saveCustomSound(soundId, data) {
      if (!electron?.saveCustomSound) {
        return { ok: false, unsupported: true };
      }
      return electron.saveCustomSound(soundId, data);
    },

    async loadCustomSound(soundId) {
      if (!electron?.loadCustomSound) {
        return { ok: false, unsupported: true };
      }
      return electron.loadCustomSound(soundId);
    },

    async deleteCustomSound(soundId) {
      if (!electron?.deleteCustomSound) {
        return { ok: false, unsupported: true };
      }
      return electron.deleteCustomSound(soundId);
    },

    async openCustomSoundsFolder() {
      if (!electron?.openCustomSoundsFolder) {
        return { ok: false, unsupported: true };
      }
      return electron.openCustomSoundsFolder();
    },

    async saveCustomWallpaper(wallpaperId, data) {
      if (!electron?.saveCustomWallpaper) {
        return { ok: false, unsupported: true };
      }
      return electron.saveCustomWallpaper(wallpaperId, data);
    },

    async loadCustomWallpaper(wallpaperId) {
      if (!electron?.loadCustomWallpaper) {
        return { ok: false, unsupported: true };
      }
      return electron.loadCustomWallpaper(wallpaperId);
    },

    async deleteCustomWallpaper(wallpaperId) {
      if (!electron?.deleteCustomWallpaper) {
        return { ok: false, unsupported: true };
      }
      return electron.deleteCustomWallpaper(wallpaperId);
    },

    async openCustomWallpapersFolder() {
      if (!electron?.openCustomWallpapersFolder) {
        return { ok: false, unsupported: true };
      }
      return electron.openCustomWallpapersFolder();
    },

    async fetchOnlineTheme(url) {
      const parsedUrl = assertRemoteThemeUrl(url);
      if (electron?.fetchOnlineTheme) {
        const result = await electron.fetchOnlineTheme(parsedUrl.toString());
        if (!result?.ok) throw new Error(result?.error || "Theme could not be loaded.");
        return assertRemoteThemeSize(result.css);
      }

      const chromeApi = globalThis.chrome;
      if (isChromeExtension && chromeApi?.permissions) {
        const origin = `${parsedUrl.origin}/*`;
        const hasPermission = await chromeApi.permissions.contains({ origins: [origin] });
        if (!hasPermission) {
          const granted = await chromeApi.permissions.request({ origins: [origin] });
          if (!granted) throw new Error("Permission for this theme host was not granted.");
        }
      }

      if (isNativeCapacitor()) {
        const response = await CapacitorHttp.get({ url: parsedUrl.toString() });
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`Theme request failed (${response.status}).`);
        }
        return assertRemoteThemeSize(response.data);
      }

      const response = await fetch(parsedUrl.toString(), { cache: "no-store" });
      if (!response.ok) throw new Error(`Theme request failed (${response.status}).`);
      return assertRemoteThemeSize(await response.text());
    },

    async writeClipboard(text) {
      if (electron?.writeClipboard) {
        return electron.writeClipboard(text);
      }

      if (isNativeCapacitor()) {
        await Clipboard.write({ string: String(text || "") });
        return { ok: true };
      }

      await navigator.clipboard.writeText(String(text || ""));
      return { ok: true };
    },

    async openExternalLink(url) {
      if (electron?.openExternalLink) {
        return electron.openExternalLink(url);
      }
      const opened = window.open(String(url || ""), "_blank", "noopener");
      return { ok: Boolean(opened) };
    },

    async fetchUpdateManifest(url) {
      if (electron?.fetchUpdateManifest) {
        return electron.fetchUpdateManifest(url);
      }

      const response = await fetch(`${url}?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.text();
    },

    async fetchChangelogFeed(url) {
      if (electron?.fetchChangelogFeed) {
        const response = await electron.fetchChangelogFeed();
        if (!response?.ok) {
          throw new Error(response?.error || "Could not load the changelog.");
        }
        return response.text;
      }

      if (isNativeCapacitor()) {
        const response = await CapacitorHttp.get({ url });
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`HTTP ${response.status}`);
        }
        return typeof response.data === "string"
          ? response.data
          : String(response.data || "");
      }

      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.text();
    },

    async showNotification(details = {}) {
      if (electron?.showNotification) {
        return electron.showNotification(details);
      }

      if (isNativeCapacitor()) {
        const permitted = await requestLocalNotificationPermission();
        if (!permitted) {
          return { ok: false, denied: true };
        }

        const notificationKey =
          details.id ||
          `${details.kind || "notification"}-${Date.now()}-${Math.random()}`;
        await LocalNotifications.schedule({
          notifications: [
            {
              id: getAndroidNotificationId(notificationKey),
              title: details.title || "Aero P2P Chat",
              body: details.body || "",
              // Android requires a monochrome small icon in the status bar.
              // This resource is our Aero chat mark, not Capacitor's info icon.
              smallIcon: "ic_stat_aero",
              schedule: { at: new Date(Date.now() + 100) },
              sound: details.silent ? undefined : "default",
              extra: {
                ...(details.extra && typeof details.extra === "object"
                  ? details.extra
                  : {}),
                id: details.id || "",
                kind: details.kind || "",
                peerId: details.peerId || "",
                callId: details.callId || "",
              },
            },
          ],
        });
        return { ok: true };
      }

      return showWebNotification(details);
    },

    async closeNotification(id) {
      if (electron?.closeNotification) {
        return electron.closeNotification(id);
      }
      if (isNativeCapacitor() && id) {
        await LocalNotifications.cancel({
          notifications: [{ id: getAndroidNotificationId(id) }],
        });
      }
      return { ok: true };
    },

    async getNotificationState() {
      if (electron?.getNotificationState) {
        return electron.getNotificationState();
      }
      return {
        appFocused:
          document.visibilityState === "visible" && document.hasFocus(),
        systemDnd: false,
      };
    },

    async getScreenSources() {
      if (electron?.getScreenSources) {
        return electron.getScreenSources();
      }

      if (!navigator.mediaDevices?.getDisplayMedia) {
        return [];
      }

      return [
        {
          id: "display-media",
          name: "Screen",
          displayId: "",
          thumbnail: "",
          appIcon: "",
          webDisplayMedia: true,
        },
      ];
    },

    async getDisplayMedia(options = {}) {
      const displayMedia = navigator.mediaDevices?.getDisplayMedia?.bind(
        navigator.mediaDevices,
      );
      if (!displayMedia) {
        throw new Error("Screen capture is not available on this platform.");
      }

      const profile = options.profile || {};
      const video = {
        frameRate: { ideal: options.fps || 30, max: options.fps || 30 },
      };
      if (profile.height > 0) {
        video.height = { ideal: profile.height };
      }

      return displayMedia({
        video,
        audio: Boolean(options.audio),
      });
    },

    async installUpdate(details) {
      if (electron?.installUpdate) {
        return electron.installUpdate(details);
      }

      if (isAndroid) {
        if (!details.url) {
          throw new Error("No download URL provided for Android update.");
        }

        let progressListener = null;
        if (androidUpdateProgressCallback) {
          progressListener = await Filesystem.addListener(
            "progress",
            (progress) => {
              const percent =
                progress.contentLength > 0
                  ? Math.round((progress.bytes / progress.contentLength) * 100)
                  : 0;
              androidUpdateProgressCallback({ phase: "download", percent });
            },
          );
        }

        try {
          const downloadResult = await Filesystem.downloadFile({
            url: details.url,
            path: "update.apk",
            directory: Directory.Cache,
            progress: true,
          });

          if (androidUpdateProgressCallback) {
            androidUpdateProgressCallback({ phase: "install" });
          }

          await FileOpener.open({
            filePath: downloadResult.path,
            contentType: "application/vnd.android.package-archive",
          });

          if (progressListener) {
            await progressListener.remove();
          }
          return { ok: true };
        } catch (error) {
          if (progressListener) {
            await progressListener.remove();
          }
          throw error;
        }
      }

      throw new Error("Native updates are not available here.");
    },

    windowControl(action) {
      return (
        electron?.windowControl?.(action) || Promise.resolve({ ok: false })
      );
    },

    updateTrayState(state) {
      electron?.updateTrayState?.(state);
    },

    realtimeCleanupComplete() {
      electron?.realtimeCleanupComplete?.();
    },

    onUpdateProgress(callback) {
      if (electron?.onUpdateProgress) {
        return electron.onUpdateProgress(callback);
      }

      if (isAndroid) {
        androidUpdateProgressCallback = callback;
        return () => {
          if (androidUpdateProgressCallback === callback) {
            androidUpdateProgressCallback = null;
          }
        };
      }

      return null;
    },

    onCheckForUpdates(callback) {
      return electron?.onCheckForUpdates?.(callback) || null;
    },

    onDisconnect(callback) {
      return electron?.onDisconnect?.(callback) || null;
    },

    onNotificationAction(callback) {
      return electron?.onNotificationAction?.(callback) || null;
    },

    onSystemShutdown(callback) {
      return electron?.onSystemShutdown?.(callback) || null;
    },

    onTrayAction(callback) {
      return electron?.onTrayAction?.(callback) || null;
    },

    async vibrate(style = "light") {
      if (!isNativeCapacitor()) return;
      const hapticStyle =
        style === "heavy"
          ? ImpactStyle.Heavy
          : style === "medium"
          ? ImpactStyle.Medium
          : ImpactStyle.Light;
      try {
        await Haptics.impact({ style: hapticStyle });
      } catch (e) {}
    },

    onBackButton(callback) {
      if (!isNativeCapacitor()) return;
      App.addListener("backButton", callback);
    },

    async minimizeApp() {
      if (!isNativeCapacitor()) return;
      await App.minimizeApp();
    },

    async initMobile() {
      if (!isNativeCapacitor()) return;
      try {
        await applyMobileSystemTheme(
          document.documentElement.dataset.theme || "light",
        );

        LocalNotifications.addListener(
          "localNotificationActionPerformed",
          (notificationAction) => {
            const extra = notificationAction.notification.extra;
            if (extra && extra.peerId) {
              window.dispatchEvent(
                new CustomEvent("aero:open-chat", {
                  detail: { peerId: extra.peerId },
                }),
              );
            }
          },
        );
      } catch (e) {}
    },

    async setSystemTheme(theme) {
      try {
        await applyMobileSystemTheme(theme);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error?.message || String(error) };
      }
    },

    async enableBackgroundMode(activeConnections = 0) {
      if (!isNativeCapacitor()) return { ok: false, unsupported: true };
      const permitted = await requestLocalNotificationPermission();
      if (!permitted) {
        return { ok: false, denied: true };
      }
      try {
        await BackgroundMode.enable({
          title: "Aero P2P Chat",
          text:
            activeConnections === 1
              ? "1 aktive Verbindung"
              : `${activeConnections} aktive Verbindungen`,
          hidden: false,
          silent: false,
          icon: "ic_stat_aero",
          allowClose: true,
          closeTitle: "Beenden",
          disableWebViewOptimization: true,
        });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error?.message || String(error) };
      }
    },

    async disableBackgroundMode() {
      if (!isNativeCapacitor()) return { ok: false, unsupported: true };
      try {
        await BackgroundMode.disable();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error?.message || String(error) };
      }
    },

    async updateBackgroundNotification(activeConnections = 0) {
      if (!isNativeCapacitor()) return;
      try {
        await BackgroundMode.updateNotification({
          title: "Aero P2P Chat",
          text:
            activeConnections === 1
              ? "1 aktive Verbindung"
              : `${activeConnections} aktive Verbindungen`,
          icon: "ic_stat_aero",
        });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error?.message || String(error) };
      }
    },
  };
}
