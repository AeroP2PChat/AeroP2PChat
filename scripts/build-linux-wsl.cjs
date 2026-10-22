const packageInfo = require("../package.json");
const { runLinuxBuildInWsl } = require("./release-help.cjs");

if (process.platform !== "win32") {
  throw new Error("The WSL Linux build must be started from Windows.");
}

runLinuxBuildInWsl(packageInfo.version);
