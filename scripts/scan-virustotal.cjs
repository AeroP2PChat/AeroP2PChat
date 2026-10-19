const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.join(__dirname, "..");
const config = require("../config.json");
const publicApiUrl = "https://www.virustotal.com/api/v3";
const smallUploadLimitBytes = 32 * 1024 * 1024;
const minimumRequestIntervalMs = 16_000;
const analysisPollIntervalMs = 20_000;
const analysisTimeoutMs = 20 * 60 * 1_000;
const defaultArtifactsDirectory = path.join(root, "dist", "release");

let lastRequestAt = 0;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function loadVirusTotalEnvironment() {
  const envPath = path.join(root, ".env.virustotal");
  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;

    const [, key, rawValue] = match;
    const value = rawValue.trim().replace(/^(['"])(.*)\1$/, "$2");
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs() {
  const options = {
    check: false,
    checkKey: false,
    submitOnly: false,
    source: defaultArtifactsDirectory,
    allowDetections: false,
    files: [],
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === "--check") options.check = true;
    else if (arg === "--check-key") options.checkKey = true;
    else if (arg === "--submit-only") options.submitOnly = true;
    else if (arg === "--allow-detections") options.allowDetections = true;
    else if (arg.startsWith("--file=")) {
      options.files.push(path.resolve(root, arg.slice("--file=".length)));
    }
    else if (arg.startsWith("--source=")) {
      options.source = path.resolve(root, arg.slice("--source=".length));
    } else {
      throw new Error(`Unknown VirusTotal option: ${arg}`);
    }
  }

  return options;
}

function assertApiKey() {
  if (!String(process.env.VIRUSTOTAL_API_KEY || "").trim()) {
    throw new Error(
      "Missing VIRUSTOTAL_API_KEY. Copy .env.virustotal.example or provide it as an environment variable.",
    );
  }
}

function artifactPaths(directory) {
  const assets = [
    config.release.windowsSetupAsset,
    config.release.linuxAppImageAsset,
    config.release.linuxRpmAsset,
    config.release.linuxDebAsset,
  ];
  const files = assets.map((name) => path.join(directory, name));
  const missing = files.filter((filePath) => !fs.existsSync(filePath));
  if (missing.length) {
    throw new Error(
      `Release artifacts are missing from ${directory}: ${missing
        .map((filePath) => path.basename(filePath))
        .join(", ")}`,
    );
  }
  return files;
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function waitForRequestSlot() {
  const waitMs = lastRequestAt + minimumRequestIntervalMs - Date.now();
  if (waitMs > 0) await sleep(waitMs);
}

async function virusTotalRequest(url, options = {}) {
  await waitForRequestSlot();
  lastRequestAt = Date.now();

  const response = await fetch(url, {
    ...options,
    headers: {
      "x-apikey": process.env.VIRUSTOTAL_API_KEY,
      ...(options.headers || {}),
    },
  });

  if (response.status === 429) {
    const retryAfterSeconds = Number(response.headers.get("retry-after")) || 60;
    console.log(`VirusTotal rate limit reached; waiting ${retryAfterSeconds}s...`);
    await sleep(retryAfterSeconds * 1_000);
    return virusTotalRequest(url, options);
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`VirusTotal request failed (${response.status}): ${detail}`);
  }

  return response.json();
}

async function uploadFile(filePath) {
  const size = fs.statSync(filePath).size;
  const uploadUrl =
    size > smallUploadLimitBytes
      ? (await virusTotalRequest(`${publicApiUrl}/files/upload_url`)).data
      : `${publicApiUrl}/files`;
  if (typeof uploadUrl !== "string" || !uploadUrl) {
    throw new Error("VirusTotal did not return a valid upload URL.");
  }

  const file = await fs.openAsBlob(filePath, {
    type: "application/octet-stream",
  });
  const formData = new FormData();
  formData.append("file", file, path.basename(filePath));

  const result = await virusTotalRequest(uploadUrl, {
    method: "POST",
    body: formData,
  });
  const analysisId = result?.data?.id;
  if (!analysisId) throw new Error("VirusTotal did not return an analysis ID.");
  return analysisId;
}

async function waitForAnalysis(analysisId) {
  const deadline = Date.now() + analysisTimeoutMs;
  while (Date.now() < deadline) {
    const result = await virusTotalRequest(
      `${publicApiUrl}/analyses/${encodeURIComponent(analysisId)}`,
    );
    const attributes = result?.data?.attributes;
    if (attributes?.status === "completed") return attributes;
    await sleep(analysisPollIntervalMs);
  }
  throw new Error("VirusTotal analysis did not finish within 20 minutes.");
}

function summarizeAnalysis(attributes) {
  const stats = attributes?.stats || {};
  const results = Object.values(attributes?.results || {});
  const detections = results
    .filter((result) => ["malicious", "suspicious"].includes(result.category))
    .map((result) => `${result.engine_name}: ${result.result || result.category}`);

  return {
    malicious: Number(stats.malicious || 0),
    suspicious: Number(stats.suspicious || 0),
    undetected: Number(stats.undetected || 0),
    harmless: Number(stats.harmless || 0),
    detections,
  };
}

async function scanFile(filePath) {
  console.log(`\nUploading ${path.basename(filePath)} (${formatSize(fs.statSync(filePath).size)})...`);
  const analysisId = await uploadFile(filePath);
  console.log("Waiting for VirusTotal analysis...");
  const summary = summarizeAnalysis(await waitForAnalysis(analysisId));
  console.log(
    `Result: ${summary.malicious} malicious, ${summary.suspicious} suspicious, ${summary.undetected} undetected.`,
  );
  if (summary.detections.length) {
    console.log(`Detected by: ${summary.detections.join("; ")}`);
  }
  return summary;
}

async function submitFile(filePath) {
  console.log(`\nUploading ${path.basename(filePath)} (${formatSize(fs.statSync(filePath).size)})...`);
  const [analysisId, sha256] = await Promise.all([
    uploadFile(filePath),
    sha256File(filePath),
  ]);
  console.log("Submitted for analysis (not waiting for the result).");
  console.log(`Report: https://www.virustotal.com/gui/file/${sha256}`);
  console.log(`Analysis ID: ${analysisId}`);
}

async function main() {
  const options = parseArgs();
  loadVirusTotalEnvironment();
  assertApiKey();
  if (options.checkKey) {
    console.log("VirusTotal API key is configured.");
    return;
  }
  const files = options.files.length ? options.files : artifactPaths(options.source);
  const missing = files.filter((filePath) => !fs.existsSync(filePath));
  if (missing.length) {
    throw new Error(`Files not found: ${missing.join(", ")}`);
  }

  if (options.check) {
    console.log("VirusTotal API key and release artifacts are configured.");
    return;
  }

  console.log(
    "VirusTotal public scans share these released files with VirusTotal and its partners.",
  );
  console.log(`Scanning ${files.length} release artifacts from ${path.relative(root, options.source)}...`);

  if (options.submitOnly) {
    for (const filePath of files) {
      await submitFile(filePath);
    }
    console.log("\nAll VirusTotal uploads were submitted. Reports will populate as analysis completes.");
    return;
  }

  const warnings = [];
  for (const filePath of files) {
    const summary = await scanFile(filePath);
    if (summary.malicious || summary.suspicious) {
      warnings.push({ filePath, summary });
    }
  }

  if (warnings.length) {
    console.error("\nVirusTotal reported detections. Review them before publishing.");
    if (!options.allowDetections) process.exitCode = 2;
    return;
  }

  console.log("\nVirusTotal scan completed without malicious or suspicious detections.");
}

main().catch((error) => {
  console.error(`VirusTotal scan failed: ${error.message || error}`);
  process.exit(1);
});
