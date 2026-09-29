import { defineConfig } from "vite";
import { resolve } from "node:path";
import projectConfig from "./config.json" with { type: "json" };
import ringtonePresetTools from "./scripts/ringtone-presets.cjs";

const { getRingtonePresets } = ringtonePresetTools;

export default defineConfig({
  base: "./",
  define: {
    __PROJECT_CONFIG__: JSON.stringify(projectConfig),
    __RINGTONE_PRESETS__: JSON.stringify(getRingtonePresets(import.meta.dirname)),
  },
  root: resolve("src/renderer"),
  publicDir: resolve("public"),
  plugins: [
    {
      name: "chrome-extension-policy",
      transformIndexHtml(html) {
        // Manifest V3 supplies the extension-page CSP. The Electron/web policy
        // contains directives that Chrome extensions are not allowed to use.
        // UserJot loads a remote script. It remains available in the desktop
        // and desktop clients, but Chrome Web Store extensions must ship all
        // executable code in their package.
        return html
          .replace(
            /\s*<meta http-equiv="Content-Security-Policy"[^>]*>\s*/,
            "\n",
          )
          .replace(
            /\s*<!-- UserJot Widget -->[\s\S]*?<!-- End UserJot Widget -->\s*/,
            "\n",
          );
      },
    },
  ],
  build: {
    outDir: resolve("dist/build/chrome-extension/unpacked"),
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        index: resolve("src/renderer/index.html"),
      },
    },
  },
});
