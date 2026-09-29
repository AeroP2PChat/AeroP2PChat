const { defineConfig } = require("electron-vite");
const { resolve } = require("node:path");
const projectConfig = require("./config.json");
const { getRingtonePresets } = require("./scripts/ringtone-presets.cjs");
const { getLegalInformation } = require("./scripts/legal-notices.cjs");

const defineProjectConfig = {
  __PROJECT_CONFIG__: JSON.stringify(projectConfig),
};
const ringtonePresets = getRingtonePresets(__dirname);
const legalInformation = getLegalInformation(__dirname);

module.exports = defineConfig({
  main: {
    define: defineProjectConfig,
    build: {
      rolldownOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.js"),
        },
      },
    },
  },
  preload: {
    build: {
      rolldownOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.js"),
        },
      },
    },
  },
  renderer: {
    define: {
      ...defineProjectConfig,
      __RINGTONE_PRESETS__: JSON.stringify(ringtonePresets),
      __LEGAL_INFORMATION__: JSON.stringify(legalInformation),
    },
    root: resolve(__dirname, "src/renderer"),
    publicDir: resolve(__dirname, "public"),
    build: {
      rolldownOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
          toast: resolve(__dirname, "src/renderer/toast.html"),
          callHealth: resolve(__dirname, "src/renderer/call-health.html"),
        },
        output: {
          manualChunks(id) {
            if (id.includes("node_modules")) {
              if (
                id.includes("node_modules/qrcode/") ||
                id.includes("node_modules/jsqr/") ||
                id.includes("node_modules/dijkstrajs/")
              ) {
                // Keep opt-in QR features out of the renderer's startup chunk.
                return undefined;
              }
              return "vendor";
            }
          },
        },
      },
    },
  },
});
