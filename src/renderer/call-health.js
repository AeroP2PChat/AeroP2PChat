const $ = (selector) => document.querySelector(selector);
const fields = {
  quality: $("#quality"), state: $("#state"), latency: $("#latency"),
  loss: $("#loss"), bitrate: $("#bitrate"), outgoingBitrate: $("#outgoing-bitrate"), jitter: $("#jitter"),
  latencyGraph: $("#latency-graph"), lossGraph: $("#loss-graph"),
  incomingGraph: $("#incoming-graph"), outgoingGraph: $("#outgoing-graph"), jitterGraph: $("#jitter-graph"),
  connectionState: $("#connection-state"), iceState: $("#ice-state"), mediaKinds: $("#media-kinds"),
  incomingCodec: $("#incoming-codec"), outgoingCodec: $("#outgoing-codec"), playoutDelay: $("#playout-delay"),
  totalReceived: $("#total-received"), totalSent: $("#total-sent"), packetsReceived: $("#packets-received"),
  packetsSent: $("#packets-sent"), packetsLost: $("#packets-lost"), videoInfo: $("#video-info"),
};

function formatPercent(value) {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`;
}

function labelFor(quality, latency) {
  const label = { good: "Good", unstable: "Unstable", bad: "Poor", unknown: "Checking" }[quality] || "Checking";
  return Number.isFinite(latency) ? `${label} · ${Math.round(latency)} ms` : label;
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return "—";
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCount(value) {
  return Number.isFinite(value) ? Intl.NumberFormat().format(Math.round(value)) : "—";
}

function drawGraph(canvas, values, color, ceiling) {
  const box = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(box.width));
  const height = Math.max(1, Math.round(box.height));
  const scale = window.devicePixelRatio || 1;
  canvas.width = width * scale; canvas.height = height * scale;
  const context = canvas.getContext("2d");
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, width, height);
  context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--line").trim();
  context.lineWidth = 1; context.beginPath(); context.moveTo(0, height - .5); context.lineTo(width, height - .5); context.stroke();
  const points = values.filter(Number.isFinite); if (!points.length) return;
  const maximum = Math.max(ceiling, ...points); const gap = points.length > 1 ? width / (points.length - 1) : 0;
  context.strokeStyle = color; context.lineWidth = 2; context.lineJoin = "round"; context.lineCap = "round"; context.beginPath();
  points.forEach((value, index) => { const x = index * gap; const y = height - 3 - (Math.min(value, maximum) / maximum) * (height - 8); if (index) context.lineTo(x, y); else context.moveTo(x, y); });
  context.stroke();
}

function render(details = {}) {
  const colors = details.colors || {};
  Object.entries(colors).forEach(([name, value]) => document.documentElement.style.setProperty(`--${name}`, value));
  const quality = details.quality || "unknown";
  fields.quality.textContent = labelFor(quality, details.latencyMs);
  fields.quality.className = `quality ${quality}`;
  fields.state.textContent = details.state || "Waiting for media";
  fields.latency.textContent = Number.isFinite(details.latencyMs) ? `${Math.round(details.latencyMs)} ms` : "—";
  fields.loss.textContent = formatPercent(details.lossRatio);
  fields.bitrate.textContent = Number.isFinite(details.bitrateKbps) ? `${Math.round(details.bitrateKbps)} kbps` : "—";
  fields.outgoingBitrate.textContent = Number.isFinite(details.outgoingBitrateKbps) ? `${Math.round(details.outgoingBitrateKbps)} kbps` : "—";
  fields.jitter.textContent = Number.isFinite(details.jitterMs) ? `${Math.round(details.jitterMs)} ms` : "—";
  fields.connectionState.textContent = details.connectionState || "—";
  fields.iceState.textContent = details.iceState || "—";
  fields.mediaKinds.textContent = details.mediaKinds?.length ? details.mediaKinds.join(" + ") : "—";
  fields.incomingCodec.textContent = details.incomingCodec || "—";
  fields.outgoingCodec.textContent = details.outgoingCodec || "—";
  fields.playoutDelay.textContent = Number.isFinite(details.playoutDelayMs) ? `${Math.round(details.playoutDelayMs)} ms` : "—";
  fields.totalReceived.textContent = formatBytes(details.bytesReceived);
  fields.totalSent.textContent = formatBytes(details.bytesSent);
  fields.packetsReceived.textContent = formatCount(details.packetsReceived);
  fields.packetsSent.textContent = formatCount(details.packetsSent);
  fields.packetsLost.textContent = formatCount(details.packetsLost);
  fields.videoInfo.textContent = details.videoInfo || "—";
  const history = Array.isArray(details.history) ? details.history : [];
  drawGraph(fields.latencyGraph, history.map((item) => item.latencyMs), colors.accent || "#7654d9", 120);
  drawGraph(fields.lossGraph, history.map((item) => (item.lossRatio || 0) * 100), colors.warning || "#dba13c", 2);
  drawGraph(fields.incomingGraph, history.map((item) => item.incomingBitrateKbps), colors.success || "#39b97d", 64);
  drawGraph(fields.outgoingGraph, history.map((item) => item.outgoingBitrateKbps), colors.accent || "#7654d9", 64);
  drawGraph(fields.jitterGraph, history.map((item) => item.jitterMs), colors.danger || "#e25871", 20);
}

$("#close").addEventListener("click", () => window.aeroChat?.windowControl("close"));
window.addEventListener("keydown", (event) => { if (event.key === "Escape") window.aeroChat?.windowControl("close"); });
window.addEventListener("resize", () => window.aeroChat?.getCallHealthWindowData().then(render));
window.aeroChat?.onCallHealthUpdate(render);
window.aeroChat?.getCallHealthWindowData().then((details) => { if (details) render(details); });
