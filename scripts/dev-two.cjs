const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {
  attachFilteredDevStderr,
  shouldShowRawChromiumLogs,
} = require("./filter-dev-stderr.cjs");
const { createRuntimeLog } = require("./runtime-log.cjs");

const root = path.join(__dirname, "..");
const devDataRoot = path.join(root, ".dev-data");
const rendererUrl = "http://localhost:5173/";
const children = new Set();
const useRuntimeLogs = process.argv.includes("--logs");

function electronPath() {
  return require("electron");
}

function spawnChild(command, args, env, filterChromiumStderr = false) {
  const childEnv = {
    ...process.env,
    ...env,
  };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  const filterDevStderr =
    filterChromiumStderr && !shouldShowRawChromiumLogs();

  const child = spawn(command, args, {
    cwd: root,
    env: childEnv,
    stdio: filterDevStderr ? ["inherit", "inherit", "pipe"] : "inherit",
    shell: false,
  });

  if (filterDevStderr) attachFilteredDevStderr(child);

  children.add(child);
  child.on("exit", () => {
    children.delete(child);
  });
  return child;
}

function waitForRenderer() {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      const request = http.get(rendererUrl, (response) => {
        response.resume();
        resolve();
      });
      request.on("error", () => {
        if (Date.now() - startedAt > 30000) {
          console.error("Renderer dev server did not start within 30s.");
          process.exit(1);
        }
        setTimeout(check, 500);
      });
    };
    check();
  });
}

function waitForMainBundle() {
  const mainBundle = path.join(root, "out", "main", "index.js");
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      if (fs.existsSync(mainBundle)) {
        resolve(mainBundle);
        return;
      }
      if (Date.now() - startedAt > 30000) {
        console.error("Main bundle did not appear within 30s.");
        process.exit(1);
      }
      setTimeout(check, 500);
    };
    check();
  });
}

function stopAll() {
  for (const child of children) {
    child.kill();
  }
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(130);
});

process.on("SIGTERM", () => {
  stopAll();
  process.exit(143);
});

async function main() {
  fs.mkdirSync(devDataRoot, { recursive: true });
  const instanceOneLog = useRuntimeLogs
    ? createRuntimeLog(
        "dev-2-instance-1",
        "Aero P2P Chat - Dev Instanz 1",
        "left",
      )
    : null;
  const instanceTwoLog = useRuntimeLogs
    ? createRuntimeLog(
        "dev-2-instance-2",
        "Aero P2P Chat - Dev Instanz 2",
        "right",
      )
    : null;

  spawnChild(
    process.execPath,
    [path.join("scripts", "run-electron-vite.cjs"), "dev"],
    {
      AERO_CHAT_ALLOW_MULTI_INSTANCE: "1",
      AERO_CHAT_USER_DATA_DIR: path.join(devDataRoot, "instance-1"),
      ...(instanceOneLog
        ? {
            AERO_CHAT_RUNTIME_LOG_FILE: instanceOneLog.logPath,
            AERO_CHAT_DEV_LAYOUT: "left",
          }
        : {}),
    },
  );

  await Promise.all([waitForRenderer(), waitForMainBundle()]);

  spawnChild(
    electronPath(),
    [path.join(root, "out", "main", "index.js")],
    {
      ELECTRON_RENDERER_URL: rendererUrl,
      AERO_CHAT_ALLOW_MULTI_INSTANCE: "1",
      AERO_CHAT_USER_DATA_DIR: path.join(devDataRoot, "instance-2"),
      ...(instanceTwoLog
        ? {
            AERO_CHAT_RUNTIME_LOG_FILE: instanceTwoLog.logPath,
            AERO_CHAT_DEV_LAYOUT: "right",
          }
        : {}),
    },
    true,
  );
}

main().catch((error) => {
  console.error(error);
  stopAll();
  process.exit(1);
});
