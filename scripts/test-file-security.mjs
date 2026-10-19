import assert from "node:assert/strict";
import {
  inspectFileBlob,
  inspectFileMetadata,
  sanitizeTransferFileName,
} from "../src/renderer/file-security.mjs";

assert.equal(sanitizeTransferFileName("../../report?.pdf"), "report_.pdf");
assert.equal(inspectFileMetadata({ name: "notes.txt", size: 12, mimeType: "text/plain" }).level, "safe");
assert.equal(inspectFileMetadata({ name: "photo.jpg.exe", size: 12, mimeType: "application/octet-stream" }).level, "unsafe");
assert.equal(inspectFileMetadata({ name: "invoice.exe.pdf", size: 12, mimeType: "application/pdf" }).level, "blocked");
assert.equal(inspectFileMetadata({ name: "installer.exe", size: 12, mimeType: "application/x-msdownload" }).level, "unsafe");
assert.equal(inspectFileMetadata({ name: "bundle.zip", size: 12, mimeType: "application/zip" }).level, "warning");
assert.equal(inspectFileMetadata({ name: "large.txt", size: 500 * 1024 * 1024 * 1024, mimeType: "text/plain" }).level, "safe");

const textResult = await inspectFileBlob(
  new Blob(["A harmless text note."], { type: "text/plain" }),
  { name: "note.txt", mimeType: "text/plain" },
);
assert.equal(textResult.level, "safe");

const executableResult = await inspectFileBlob(
  new Blob([new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00])]),
  { name: "renamed.dat", mimeType: "application/octet-stream" },
);
assert.equal(executableResult.level, "blocked");

const explicitExecutableResult = await inspectFileBlob(
  new Blob([new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00])]),
  { name: "installer.exe", mimeType: "application/x-msdownload" },
);
assert.equal(explicitExecutableResult.level, "unsafe");

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const imageResult = await inspectFileBlob(
  new Blob([tinyPng], { type: "image/png" }),
  { name: "pixel.png", mimeType: "image/png" },
);
assert.equal(imageResult.level, "safe");
assert.equal(imageResult.canPreview, true);
assert.equal(imageResult.previewKind, "image");

const wavHeader = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
  0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
  0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x40, 0x1f, 0x00, 0x00, 0x40, 0x1f, 0x00, 0x00,
  0x01, 0x00, 0x08, 0x00, 0x64, 0x61, 0x74, 0x61,
  0x00, 0x00, 0x00, 0x00,
]);
const audioResult = await inspectFileBlob(
  new Blob([wavHeader], { type: "audio/wav" }),
  { name: "sample.wav", mimeType: "audio/wav" },
);
assert.equal(audioResult.level, "safe");
assert.equal(audioResult.previewKind, "audio");

const disguisedAudioResult = await inspectFileBlob(
  new Blob([wavHeader], { type: "audio/wav" }),
  { name: "sample.mp3", mimeType: "audio/mpeg" },
);
assert.equal(disguisedAudioResult.level, "blocked");
assert.equal(disguisedAudioResult.previewKind, "");

console.log("File security tests passed.");
