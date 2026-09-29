import { defineConfig } from "vite";
import { resolve } from "node:path";
import projectConfig from "./config.json" with { type: "json" };
import ringtonePresetTools from "./scripts/ringtone-presets.cjs";

const { getRingtonePresets } = ringtonePresetTools;

export default defineConfig({
  define: {
    __PROJECT_CONFIG__: JSON.stringify(projectConfig),
    __RINGTONE_PRESETS__: JSON.stringify(getRingtonePresets(import.meta.dirname)),
  },
  root: resolve("src/renderer"),
  publicDir: resolve("public"),
  build: {
    outDir: resolve("dist/build/web/renderer"),
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        index: resolve("src/renderer/index.html"),
        
      },
    },
  },
});
