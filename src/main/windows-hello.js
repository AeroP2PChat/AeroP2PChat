const { spawn } = require("node:child_process");
const { join } = require("node:path");

const WINDOWS_HELLO_RESULTS = new Set([
  "Available",
  "DeviceNotPresent",
  "NotConfiguredForUser",
  "DisabledByPolicy",
  "DeviceBusy",
  "Verified",
  "RetriesExhausted",
  "Canceled",
]);

function getPowerShellPath() {
  const windowsRoot = process.env.SystemRoot || "C:\\Windows";
  return join(windowsRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

function encodePowerShell(script) {
  return Buffer.from(script, "utf16le").toString("base64");
}

function runWindowsHelloScript(script, timeoutMs = 30_000) {
  if (process.platform !== "win32") {
    return Promise.resolve({ ok: false, result: "UnsupportedPlatform" });
  }
  return new Promise((resolve) => {
    const child = spawn(
      getPowerShellPath(),
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodePowerShell(script)],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${chunk}`.slice(-4096);
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4096);
    });
    child.once("error", () => finish({ ok: false, result: "Unavailable" }));
    child.once("close", (code) => {
      const result = stdout.trim().split(/\r?\n/).at(-1) || "Unavailable";
      finish({
        ok: code === 0 && WINDOWS_HELLO_RESULTS.has(result),
        result,
        error: code === 0 ? "" : stderr.trim().slice(0, 500),
      });
    });
    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, result: "TimedOut" });
    }, timeoutMs);
    timer.unref?.();
  });
}

const awaitWinRt = String.raw`
Add-Type -AssemblyName System.Runtime.WindowsRuntime
function Wait-WinRt($Operation, $ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
    Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}
$verifier = [Windows.Security.Credentials.UI.UserConsentVerifier,Windows.Security.Credentials.UI,ContentType=WindowsRuntime]
`;

async function getWindowsHelloAvailability() {
  const response = await runWindowsHelloScript(`${awaitWinRt}
$result = Wait-WinRt ($verifier::CheckAvailabilityAsync()) ([Windows.Security.Credentials.UI.UserConsentVerifierAvailability])
[Console]::Out.WriteLine($result.ToString())
`);
  return response.ok ? response.result : "Unavailable";
}

async function requestWindowsHello(prompt = "Unlock Aero P2P Chat") {
  const safePrompt = Buffer.from(String(prompt).slice(0, 160), "utf8").toString("base64");
  const response = await runWindowsHelloScript(`${awaitWinRt}
$prompt = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${safePrompt}'))
$result = Wait-WinRt ($verifier::RequestVerificationAsync($prompt)) ([Windows.Security.Credentials.UI.UserConsentVerificationResult])
[Console]::Out.WriteLine($result.ToString())
`, 90_000);
  return {
    ok: response.ok && response.result === "Verified",
    result: response.result,
  };
}

module.exports = {
  getWindowsHelloAvailability,
  requestWindowsHello,
};
