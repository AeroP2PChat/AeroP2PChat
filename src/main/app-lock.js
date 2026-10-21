const {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} = require("node:crypto");

const APP_LOCK_VERSION = 1;
const RECOVERY_CODE_COUNT = 10;
const MAX_CREDENTIAL_LENGTH = 128;
const WEAK_PINS = new Set([
  "112233",
  "123321",
  "102030",
  "159753",
  "147258",
  "520131",
]);
const LEGACY_SCRYPT_OPTIONS = {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };

function normalizePin(value) {
  return String(value ?? "").trim();
}

function validatePin(value) {
  const pin = normalizePin(value);
  if (!/^\d{6,12}$/.test(pin)) {
    return { ok: false, error: "Use a PIN with 6 to 12 digits." };
  }
  if (
    /^(\d)\1+$/.test(pin) ||
    /^(\d{2,4})\1+$/.test(pin) ||
    WEAK_PINS.has(pin) ||
    "01234567890123456789".includes(pin) ||
    "98765432109876543210".includes(pin)
  ) {
    return { ok: false, error: "Choose a less predictable PIN." };
  }
  return { ok: true, pin };
}

function normalizeRecoveryCode(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function getPinScryptOptions(pinRecord = {}) {
  const kdf = pinRecord.kdf;
  if (kdf === undefined) return LEGACY_SCRYPT_OPTIONS;
  if (
    kdf?.name !== "scrypt" ||
    kdf.N !== SCRYPT_OPTIONS.N ||
    kdf.r !== SCRYPT_OPTIONS.r ||
    kdf.p !== SCRYPT_OPTIONS.p
  ) {
    throw new Error("The App Lock PIN parameters are invalid.");
  }
  return SCRYPT_OPTIONS;
}

function hashPin(pin, salt, options = SCRYPT_OPTIONS) {
  return scryptSync(pin, Buffer.from(salt, "base64"), 32, options);
}

function hashRecoveryCode(code, salt) {
  return createHash("sha256")
    .update(Buffer.from(salt, "base64"))
    .update(normalizeRecoveryCode(code), "utf8")
    .digest();
}

function generateRecoveryCodes() {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const value = randomBytes(8).toString("hex").toUpperCase();
    return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}-${value.slice(12)}`;
  });
}

function createRecoveryRecord(codes) {
  const salt = randomBytes(16).toString("base64");
  return {
    salt,
    hashes: codes.map((code) =>
      hashRecoveryCode(code, salt).toString("base64"),
    ),
  };
}

function createAppLockRecord(pinValue, now = Date.now()) {
  const validated = validatePin(pinValue);
  if (!validated.ok) throw new Error(validated.error);
  const pinSalt = randomBytes(16).toString("base64");
  const recoveryCodes = generateRecoveryCodes();
  return {
    record: {
      version: APP_LOCK_VERSION,
      enabled: true,
      pin: {
        salt: pinSalt,
        hash: hashPin(validated.pin, pinSalt).toString("base64"),
        kdf: {
          name: "scrypt",
          N: SCRYPT_OPTIONS.N,
          r: SCRYPT_OPTIONS.r,
          p: SCRYPT_OPTIONS.p,
        },
      },
      recovery: createRecoveryRecord(recoveryCodes),
      failedAttempts: 0,
      blockedUntil: 0,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    },
    recoveryCodes,
  };
}

function assertAppLockRecord(record) {
  if (
    !record ||
    record.version !== APP_LOCK_VERSION ||
    record.enabled !== true ||
    typeof record.pin?.salt !== "string" ||
    typeof record.pin?.hash !== "string" ||
    typeof record.recovery?.salt !== "string" ||
    !Array.isArray(record.recovery?.hashes)
  ) {
    throw new Error("The App Lock security record is invalid.");
  }
  getPinScryptOptions(record.pin);
  const validBase64Bytes = (value, bytes) => {
    if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
      return false;
    }
    return Buffer.from(value, "base64").length === bytes;
  };
  if (
    !validBase64Bytes(record.pin.salt, 16) ||
    !validBase64Bytes(record.pin.hash, 32) ||
    !validBase64Bytes(record.recovery.salt, 16) ||
    record.recovery.hashes.length > RECOVERY_CODE_COUNT ||
    !record.recovery.hashes.every((hash) => validBase64Bytes(hash, 32))
  ) {
    throw new Error("The App Lock security record is invalid.");
  }
  return record;
}

function getRetryDelayMs(failedAttempts) {
  if (failedAttempts < 5) return 0;
  return Math.min(15 * 60_000, 30_000 * 2 ** Math.min(failedAttempts - 5, 5));
}

function getAutoLockRemainingSeconds(
  durationSeconds,
  systemIdleSeconds,
  secondsSinceUnlock,
) {
  const duration = Math.max(1, Math.floor(Number(durationSeconds) || 0));
  const idle = Math.max(0, Math.floor(Number(systemIdleSeconds) || 0));
  const unlockedFor = Math.max(0, Math.floor(Number(secondsSinceUnlock) || 0));
  return Math.max(0, duration - Math.min(idle, unlockedFor));
}

function secureEqual(actual, expectedBase64) {
  const expected = Buffer.from(expectedBase64, "base64");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function verifyAppLockCredential(
  recordValue,
  credentialValue,
  now = Date.now(),
) {
  const record = assertAppLockRecord(recordValue);
  const blockedUntil = Number(record.blockedUntil) || 0;
  if (blockedUntil > now) {
    return {
      ok: false,
      blocked: true,
      retryAfterMs: blockedUntil - now,
      record,
    };
  }

  const credential = String(credentialValue ?? "")
    .trim()
    .slice(0, MAX_CREDENTIAL_LENGTH);
  let recoveryIndex = -1;
  let matched = false;
  let matchedPin = false;
  if (/^\d{6,12}$/.test(credential)) {
    matchedPin = secureEqual(
      hashPin(credential, record.pin.salt, getPinScryptOptions(record.pin)),
      record.pin.hash,
    );
    matched = matchedPin;
  } else {
    const recoveryHash = hashRecoveryCode(credential, record.recovery.salt);
    recoveryIndex = record.recovery.hashes.findIndex((hash) =>
      secureEqual(recoveryHash, hash),
    );
    matched = recoveryIndex >= 0;
  }

  if (matched) {
    const recoveryHashes = [...record.recovery.hashes];
    if (recoveryIndex >= 0) recoveryHashes.splice(recoveryIndex, 1);
    let pin = record.pin;
    if (matchedPin && record.pin.kdf === undefined) {
      const salt = randomBytes(16).toString("base64");
      pin = {
        salt,
        hash: hashPin(credential, salt).toString("base64"),
        kdf: {
          name: "scrypt",
          N: SCRYPT_OPTIONS.N,
          r: SCRYPT_OPTIONS.r,
          p: SCRYPT_OPTIONS.p,
        },
      };
    }
    return {
      ok: true,
      usedRecoveryCode: recoveryIndex >= 0,
      remainingRecoveryCodes: recoveryHashes.length,
      record: {
        ...record,
        pin,
        recovery: { ...record.recovery, hashes: recoveryHashes },
        failedAttempts: 0,
        blockedUntil: 0,
        updatedAt: new Date(now).toISOString(),
      },
    };
  }

  const failedAttempts = Math.max(0, Number(record.failedAttempts) || 0) + 1;
  const retryDelayMs = getRetryDelayMs(failedAttempts);
  return {
    ok: false,
    blocked: retryDelayMs > 0,
    retryAfterMs: retryDelayMs,
    record: {
      ...record,
      failedAttempts,
      blockedUntil: retryDelayMs ? now + retryDelayMs : 0,
      updatedAt: new Date(now).toISOString(),
    },
  };
}

function replaceAppLockPin(recordValue, pinValue, now = Date.now()) {
  const current = assertAppLockRecord(recordValue);
  const replacement = createAppLockRecord(pinValue, now);
  replacement.record.createdAt = current.createdAt;
  return replacement;
}

function regenerateRecoveryCodes(recordValue, now = Date.now()) {
  const record = assertAppLockRecord(recordValue);
  const recoveryCodes = generateRecoveryCodes();
  return {
    recoveryCodes,
    record: {
      ...record,
      recovery: createRecoveryRecord(recoveryCodes),
      updatedAt: new Date(now).toISOString(),
    },
  };
}

module.exports = {
  APP_LOCK_VERSION,
  assertAppLockRecord,
  createAppLockRecord,
  getAutoLockRemainingSeconds,
  regenerateRecoveryCodes,
  replaceAppLockPin,
  validatePin,
  verifyAppLockCredential,
};
