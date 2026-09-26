const projectConfig = require("./config.json");

module.exports = {
  appId: projectConfig.app.id,
  productName: projectConfig.app.name,
  directories: {
    output: "dist/build/electron",
    buildResources: "assets",
  },
  files: [
    "out/**/*",
    "assets/**/*",
    "package.json",
    "!node_modules/**/ios/**/*",
    "!node_modules/**/*.podspec",
  ],
  // Keep native window/tray icons outside app.asar as well. Some desktop
  // shells cannot reliably resolve a taskbar icon from inside the archive.
  extraResources: [
    {
      from: "assets/app.ico",
      to: "app-icon.ico",
    },
    {
      from: "assets/linux-icons/512x512.png",
      to: "app-icon.png",
    },
    {
      from: "assets/status/peer-connected.png",
      to: "peer-connected.png",
    },
  ],
  win: {
    target: ["nsis"],
    icon: "assets/app.ico",
    artifactName: "Aero-P2P-Chat-Windows-${arch}-Setup.${ext}",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    createDesktopShortcut: "always",
    createStartMenuShortcut: true,
    shortcutName: projectConfig.app.name,
    uninstallDisplayName: projectConfig.app.name,
    deleteAppDataOnUninstall: false,
  },
  // This identity is assigned to Aero P2P Chat in Microsoft Partner Center.
  // The Store replaces the package signature after certification.
  appx: {
    artifactName: "Aero-P2P-Chat-Microsoft-Store-${arch}.${ext}",
    identityName: "Zorblock.AeroP2PChat",
    publisher: "CN=9C56695C-1431-40D0-A466-EAE7BFAE9231",
    publisherDisplayName: "Zorblock",
    displayName: projectConfig.app.name,
    backgroundColor: "transparent",
    languages: ["en-US", "de-DE"],
    capabilities: ["runFullTrust", "internetClient", "microphone", "webcam"],
  },

  linux: {
    target: ["AppImage", "rpm", "deb"],
    icon: "assets/linux-icons",
    category: "Network",
    artifactName: "Aero-P2P-Chat-Linux-x64.${ext}",
    syncDesktopName: true,
    desktop: {
      entry: {
        StartupWMClass: projectConfig.app.id,
      },
    },
  },
  electronLanguages: ["en-US"],
  asar: true,
};
