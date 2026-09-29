const NEGATIVE_FRAME_LATENCY =
  /ERROR:components\/viz\/service\/display\/display\.cc:\d+\] Frame latency is negative:/;

function shouldShowRawChromiumLogs() {
  return process.env.AERO_CHAT_SHOW_CHROMIUM_LOGS === "1";
}

function attachFilteredDevStderr(child) {
  if (!child.stderr) return;

  let pending = "";
  let noticeShown = false;

  const writeLine = (line, newline = "") => {
    if (NEGATIVE_FRAME_LATENCY.test(line)) {
      if (!noticeShown) {
        process.stderr.write(
          "[Aero] Wiederholte Chromium-Frame-Timing-Meldungen werden ausgeblendet " +
            "(AERO_CHAT_SHOW_CHROMIUM_LOGS=1 zeigt sie an).\n",
        );
        noticeShown = true;
      }
      return;
    }
    process.stderr.write(line + newline);
  };

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop() || "";
    for (const line of lines) writeLine(line, "\n");
  });
  child.stderr.on("end", () => {
    if (pending) writeLine(pending);
    pending = "";
  });
}

module.exports = { attachFilteredDevStderr, shouldShowRawChromiumLogs };
