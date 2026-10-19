import { fileTypeFromBuffer } from "file-type";

export const FILE_NAME_MAX_LENGTH = 180;

const BLOCKED_EXTENSIONS = new Set([
  "apk",
  "app",
  "appimage",
  "bat",
  "bin",
  "cmd",
  "com",
  "command",
  "cpl",
  "deb",
  "desktop",
  "dll",
  "dmg",
  "dylib",
  "elf",
  "exe",
  "gadget",
  "hta",
  "img",
  "iso",
  "jar",
  "jse",
  "js",
  "lnk",
  "msi",
  "msp",
  "mst",
  "php",
  "pkg",
  "pl",
  "ps1",
  "psd1",
  "psm1",
  "py",
  "pyw",
  "rb",
  "reg",
  "rpm",
  "scr",
  "sh",
  "so",
  "sys",
  "url",
  "vb",
  "vbe",
  "vbs",
  "wsf",
  "wsh",
]);

const WARNING_EXTENSIONS = new Set([
  "7z",
  "ace",
  "cab",
  "doc",
  "docm",
  "docx",
  "dotm",
  "gz",
  "html",
  "htm",
  "mht",
  "mhtml",
  "odp",
  "ods",
  "odt",
  "pdf",
  "ppt",
  "pptm",
  "pptx",
  "rar",
  "rtf",
  "svg",
  "svgz",
  "tar",
  "tgz",
  "xls",
  "xlsm",
  "xlsx",
  "xltm",
  "zip",
]);

const SAFE_TEXT_EXTENSIONS = new Set([
  "csv",
  "json",
  "log",
  "md",
  "text",
  "txt",
  "xml",
  "yaml",
  "yml",
]);

const IMAGE_TYPES = new Map([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  ["avif", "image/avif"],
]);

const DOCUMENT_TYPES = new Map([
  ["pdf", "application/pdf"],
  [
    "docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  [
    "pptx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
]);

const MEDIA_TYPES = new Map([
  ["aac", new Set(["audio/aac"])],
  ["flac", new Set(["audio/flac"])],
  ["m4a", new Set(["audio/mp4"])],
  ["mp3", new Set(["audio/mpeg"])],
  ["oga", new Set(["audio/ogg"])],
  ["ogg", new Set(["audio/ogg", "video/ogg"])],
  ["opus", new Set(["audio/ogg"])],
  ["wav", new Set(["audio/wav", "audio/x-wav"])],
  ["wave", new Set(["audio/wav", "audio/x-wav"])],
  ["avi", new Set(["video/vnd.avi", "video/x-msvideo"])],
  ["m4v", new Set(["video/mp4"])],
  ["mkv", new Set(["video/x-matroska"])],
  ["mov", new Set(["video/quicktime"])],
  ["mp4", new Set(["video/mp4", "audio/mp4"])],
  ["mpeg", new Set(["video/mpeg"])],
  ["mpg", new Set(["video/mpeg"])],
  ["ogv", new Set(["video/ogg"])],
  ["webm", new Set(["video/webm", "audio/webm"])],
]);

function getMediaPreviewKind(extension, mimeType) {
  if (!MEDIA_TYPES.get(extension)?.has(mimeType)) return "";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "";
}

const BLOCKED_MIME_TYPES = new Set([
  "application/vnd.android.package-archive",
  "application/vnd.microsoft.portable-executable",
  "application/x-elf",
  "application/x-executable",
  "application/x-mach-binary",
  "application/x-msdownload",
  "application/x-sharedlib",
]);

const ARCHIVE_MIME_TYPES = new Set([
  "application/gzip",
  "application/vnd.rar",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/x-tar",
  "application/zip",
]);

const BIDI_OR_CONTROL_PATTERN =
  /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const PATH_SEPARATOR_PATTERN = /[\\/]/u;
const RISK_LEVELS = { safe: 0, warning: 1, unsafe: 2, blocked: 3 };

function raiseRiskLevel(current, next) {
  return RISK_LEVELS[next] > RISK_LEVELS[current] ? next : current;
}

export function getFileExtension(name) {
  const normalized = String(name || "")
    .trim()
    .toLowerCase();
  const index = normalized.lastIndexOf(".");
  return index > 0 && index < normalized.length - 1
    ? normalized.slice(index + 1)
    : "";
}

export function sanitizeTransferFileName(value) {
  const raw = String(value || "").normalize("NFKC");
  const leaf = raw.split(/[\\/]/u).pop() || "file";
  const cleaned = leaf
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/gu, "_")
    .replace(/[. ]+$/u, "")
    .trim();
  const safe =
    cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : "file";
  if (safe.length <= FILE_NAME_MAX_LENGTH) return safe;
  const extension = getFileExtension(safe);
  const suffix = extension ? `.${extension.slice(0, 20)}` : "";
  return `${safe.slice(0, FILE_NAME_MAX_LENGTH - suffix.length)}${suffix}`;
}

function addUnique(target, message) {
  if (message && !target.includes(message)) target.push(message);
}

function getNameAssessment(name) {
  const raw = String(name || "");
  const extension = getFileExtension(raw);
  const reasons = [];
  let level = "safe";

  if (
    !raw ||
    raw.length > FILE_NAME_MAX_LENGTH ||
    PATH_SEPARATOR_PATTERN.test(raw)
  ) {
    level = "blocked";
    addUnique(reasons, "The file name is invalid.");
  }
  if (BIDI_OR_CONTROL_PATTERN.test(raw)) {
    level = "blocked";
    addUnique(reasons, "The file name contains hidden or control characters.");
  }
  if (BLOCKED_EXTENSIONS.has(extension)) {
    level = raiseRiskLevel(level, "unsafe");
    addUnique(reasons, `.${extension} files can execute code.`);
  } else if (WARNING_EXTENSIONS.has(extension)) {
    level = raiseRiskLevel(level, "warning");
    addUnique(
      reasons,
      `.${extension} files may contain active or hidden content.`,
    );
  } else if (!extension) {
    level = raiseRiskLevel(level, "warning");
    addUnique(reasons, "The file has no extension.");
  }

  const parts = raw.toLowerCase().split(".").filter(Boolean);
  if (
    parts.length >= 3 &&
    BLOCKED_EXTENSIONS.has(parts.at(-2)) &&
    !BLOCKED_EXTENSIONS.has(extension)
  ) {
    level = "blocked";
    addUnique(reasons, "The file uses a misleading double extension.");
  }

  return { level, reasons, extension };
}

export function inspectFileMetadata({ name, size, mimeType } = {}) {
  const assessment = getNameAssessment(name);
  const normalizedMime = String(mimeType || "application/octet-stream")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  const normalizedSize = Number(size);
  const reasons = [...assessment.reasons];
  let level = assessment.level;

  if (!Number.isSafeInteger(normalizedSize) || normalizedSize < 1) {
    level = "blocked";
    addUnique(reasons, "The file is empty or has an invalid size.");
  }
  if (BLOCKED_MIME_TYPES.has(normalizedMime)) {
    level = raiseRiskLevel(level, "unsafe");
    addUnique(reasons, "The declared file type can execute code.");
  }
  if (ARCHIVE_MIME_TYPES.has(normalizedMime) && level !== "blocked") {
    level = raiseRiskLevel(level, "warning");
    addUnique(reasons, "Archives can contain files that Aero cannot inspect.");
  }

  return {
    level,
    reasons,
    extension: assessment.extension,
    mimeType: normalizedMime || "application/octet-stream",
  };
}

function beginsWith(bytes, signature) {
  return signature.every((value, index) => bytes[index] === value);
}

function inspectActiveContent(bytes, extension) {
  const reasons = [];
  let blocked = false;
  let unsafe = false;
  if (beginsWith(bytes, [0x4d, 0x5a])) {
    unsafe = true;
    addUnique(reasons, "Windows executable signature detected.");
  }
  if (beginsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) {
    unsafe = true;
    addUnique(reasons, "Linux executable signature detected.");
  }
  if (
    beginsWith(bytes, [0xfe, 0xed, 0xfa, 0xce]) ||
    beginsWith(bytes, [0xfe, 0xed, 0xfa, 0xcf]) ||
    beginsWith(bytes, [0xcf, 0xfa, 0xed, 0xfe]) ||
    beginsWith(bytes, [0xca, 0xfe, 0xba, 0xbe])
  ) {
    unsafe = true;
    addUnique(reasons, "Executable binary signature detected.");
  }

  const text = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes)
    .replace(/^\uFEFF/u, "")
    .trimStart()
    .toLowerCase();
  if (text.startsWith("#!") && !SAFE_TEXT_EXTENSIONS.has(extension)) {
    unsafe = true;
    addUnique(reasons, "Executable script header detected.");
  }
  if (
    !["html", "htm", "svg", "svgz", "xml"].includes(extension) &&
    (text.startsWith("<script") ||
      text.startsWith("<!doctype html") ||
      text.startsWith("<html"))
  ) {
    blocked = true;
    addUnique(reasons, "Active web content is disguised as another file type.");
  }
  return { blocked, unsafe, reasons };
}

function getImageDimensions(bytes, extension) {
  if (extension === "png" && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (extension === "gif" && bytes.length >= 10) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if ((extension === "jpg" || extension === "jpeg") && bytes.length >= 12) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      ) {
        return {
          height: (bytes[offset + 5] << 8) | bytes[offset + 6],
          width: (bytes[offset + 7] << 8) | bytes[offset + 8],
        };
      }
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (length < 2) break;
      offset += length + 2;
    }
  }
  if (extension === "webp" && bytes.length >= 30) {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === "VP8X") {
      return {
        width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
      };
    }
    if (
      chunk === "VP8 " &&
      bytes[23] === 0x9d &&
      bytes[24] === 0x01 &&
      bytes[25] === 0x2a
    ) {
      return {
        width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
        height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
      };
    }
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      return {
        width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
        height:
          1 +
          ((bytes[22] & 0xc0) >> 6) +
          (bytes[23] << 2) +
          ((bytes[24] & 0x0f) << 10),
      };
    }
  }
  if (extension === "avif" && bytes.length >= 32) {
    for (let index = 4; index + 16 <= bytes.length; index += 1) {
      if (
        bytes[index] === 0x69 &&
        bytes[index + 1] === 0x73 &&
        bytes[index + 2] === 0x70 &&
        bytes[index + 3] === 0x65
      ) {
        const view = new DataView(
          bytes.buffer,
          bytes.byteOffset,
          bytes.byteLength,
        );
        return {
          width: view.getUint32(index + 8),
          height: view.getUint32(index + 12),
        };
      }
    }
  }
  return null;
}

export async function inspectFileHeader(headerValue, metadata = {}) {
  const name = String(metadata.name || "file");
  const mimeType = String(metadata.mimeType || "application/octet-stream");
  const size = Number(metadata.size);
  const result = inspectFileMetadata({ name, size, mimeType });
  const header =
    headerValue instanceof Uint8Array
      ? headerValue
      : headerValue instanceof ArrayBuffer
        ? new Uint8Array(headerValue)
        : null;
  if (result.level === "blocked" || !header?.byteLength) {
    return {
      ...result,
      detectedExt: "",
      detectedMime: "",
      canPreview: false,
      previewKind: "",
    };
  }
  const active = inspectActiveContent(header, result.extension);
  if (active.blocked) result.level = "blocked";
  else if (active.unsafe && !BLOCKED_EXTENSIONS.has(result.extension)) {
    result.level = "blocked";
    addUnique(
      result.reasons,
      "Executable content is disguised as a different file type.",
    );
  } else if (active.unsafe) {
    result.level = raiseRiskLevel(result.level, "unsafe");
  }
  active.reasons.forEach((reason) => addUnique(result.reasons, reason));

  let detected = null;
  try {
    detected = await fileTypeFromBuffer(header);
  } catch {
    result.level = raiseRiskLevel(result.level, "warning");
    addUnique(
      result.reasons,
      "The binary file type could not be identified reliably.",
    );
  }

  const detectedExt = String(detected?.ext || "").toLowerCase();
  const detectedMime = String(detected?.mime || "").toLowerCase();
  if (
    BLOCKED_EXTENSIONS.has(detectedExt) ||
    BLOCKED_MIME_TYPES.has(detectedMime)
  ) {
    if (!BLOCKED_EXTENSIONS.has(result.extension)) {
      result.level = "blocked";
      addUnique(
        result.reasons,
        "Executable content is disguised as a different file type.",
      );
    } else {
      result.level = raiseRiskLevel(result.level, "unsafe");
      addUnique(result.reasons, "Executable content was detected in the file.");
    }
  }

  const expectedMime =
    IMAGE_TYPES.get(result.extension) || DOCUMENT_TYPES.get(result.extension);
  const expectedMediaMimes = MEDIA_TYPES.get(result.extension);
  if (
    (expectedMime && detectedMime && detectedMime !== expectedMime) ||
    (expectedMediaMimes &&
      detectedMime &&
      !expectedMediaMimes.has(detectedMime))
  ) {
    result.level = "blocked";
    addUnique(result.reasons, "The file content does not match its extension.");
  } else if (
    detectedExt &&
    result.extension &&
    detectedExt !== result.extension &&
    !(result.extension === "jpeg" && detectedExt === "jpg") &&
    result.level !== "blocked"
  ) {
    result.level = raiseRiskLevel(result.level, "warning");
    addUnique(
      result.reasons,
      `Detected .${detectedExt} content does not match the .${result.extension} name.`,
    );
  }

  if (
    !detected &&
    !SAFE_TEXT_EXTENSIONS.has(result.extension) &&
    !WARNING_EXTENSIONS.has(result.extension) &&
    result.level !== "blocked"
  ) {
    result.level = raiseRiskLevel(result.level, "warning");
    addUnique(result.reasons, "Aero does not recognize this file type.");
  }

  if (
    (ARCHIVE_MIME_TYPES.has(detectedMime) ||
      ["zip", "rar", "7z", "gz", "tar"].includes(detectedExt)) &&
    result.level !== "blocked"
  ) {
    result.level = raiseRiskLevel(result.level, "warning");
    addUnique(
      result.reasons,
      "Archive contents are not extracted or scanned by Aero.",
    );
  }

  const imageDimensions = getImageDimensions(header, detectedExt);
  const imageWithinPreviewLimits = Boolean(
    imageDimensions?.width > 0 &&
    imageDimensions?.height > 0 &&
    imageDimensions.width <= 12000 &&
    imageDimensions.height <= 12000 &&
    imageDimensions.width * imageDimensions.height <= 40_000_000,
  );
  if (
    detectedMime.startsWith("image/") &&
    !imageWithinPreviewLimits &&
    result.level !== "blocked"
  ) {
    result.level = raiseRiskLevel(result.level, "warning");
    addUnique(
      result.reasons,
      "Image preview was disabled because its dimensions could not be validated safely.",
    );
  }

  const mediaPreviewKind = getMediaPreviewKind(result.extension, detectedMime);
  const canPreviewImage = Boolean(
    result.level !== "blocked" &&
    size <= 12 * 1024 * 1024 &&
    IMAGE_TYPES.get(result.extension) === detectedMime &&
    imageWithinPreviewLimits,
  );

  return {
    ...result,
    detectedExt,
    detectedMime,
    canPreview: canPreviewImage,
    previewKind: canPreviewImage
      ? "image"
      : result.level !== "blocked"
        ? mediaPreviewKind
        : "",
  };
}

export async function inspectFileBlob(blob, metadata = {}) {
  if (!(blob instanceof Blob)) {
    return inspectFileHeader(null, metadata);
  }
  return inspectFileHeader(
    new Uint8Array(await blob.slice(0, 64 * 1024).arrayBuffer()),
    {
      ...metadata,
      name: metadata.name || blob.name || "file",
      mimeType: metadata.mimeType || blob.type || "application/octet-stream",
      size: blob.size,
    },
  );
}

export function getFileSecurityLabel(level) {
  if (level === "blocked") return "Blocked";
  if (level === "unsafe") return "Unsafe file type";
  if (level === "warning") return "Needs caution";
  return "Security check passed";
}
