import { defineConfig } from "vite";
import { resolve } from "node:path";
import projectConfig from "./config.json" with { type: "json" };

export default defineConfig({
  define: {
    __PROJECT_CONFIG__: JSON.stringify(projectConfig),
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
