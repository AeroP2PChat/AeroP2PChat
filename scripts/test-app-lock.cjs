const {
  createAppLockRecord,
  getAutoLockRemainingSeconds,
  regenerateRecoveryCodes,
  replaceAppLockPin,
  validatePin,
  verifyAppLockCredential,
} = require("../src/main/app-lock");
const { scryptSync } = require("node:crypto");

function assert(value, message) {
  if (!value) throw new Error(message);
}

assert(!validatePin("123456").ok, "A sequential PIN was accepted.");
assert(!validatePin("111111").ok, "A repeated PIN was accepted.");
assert(!validatePin("123123").ok, "A repeated-block PIN was accepted.");
assert(!validatePin("112233").ok, "A common PIN was accepted.");
assert(validatePin("604927").ok, "A valid PIN was rejected.");
assert(
  getAutoLockRemainingSeconds(300, 45, 120) === 255,
  "Auto-lock countdown did not use system idle time.",
);
assert(
  getAutoLockRemainingSeconds(300, 500, 20) === 280,
  "Auto-lock countdown ignored the post-unlock grace period.",
);
assert(
  getAutoLockRemainingSeconds(60, 60, 60) === 0,
  "Auto-lock countdown did not expire.",
);

const created = createAppLockRecord("604927", 1_000);
assert(created.recoveryCodes.length === 10, "Recovery code count is incorrect.");
assert(!JSON.stringify(created.record).includes("604927"), "PIN was stored in plaintext.");
assert(
  !JSON.stringify(created.record).includes(created.recoveryCodes[0]),
  "Recovery code was stored in plaintext.",
);

let result = verifyAppLockCredential(created.record, "604927", 2_000);
assert(result.ok && !result.usedRecoveryCode, "Correct PIN was rejected.");

const legacyRecord = JSON.parse(JSON.stringify(created.record));
delete legacyRecord.pin.kdf;
legacyRecord.pin.hash = scryptSync(
  "604927",
  Buffer.from(legacyRecord.pin.salt, "base64"),
  32,
  { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
).toString("base64");
const migratedLegacy = verifyAppLockCredential(legacyRecord, "604927", 2_500);
assert(migratedLegacy.ok, "A legacy App Lock PIN was rejected.");
assert(
  migratedLegacy.record.pin.kdf?.p === 3,
  "A legacy App Lock PIN was not upgraded after authentication.",
);

result = verifyAppLockCredential(result.record, created.recoveryCodes[0], 3_000);
assert(result.ok && result.usedRecoveryCode, "Recovery code was rejected.");
const afterRecovery = result.record;
result = verifyAppLockCredential(afterRecovery, created.recoveryCodes[0], 4_000);
assert(!result.ok, "A recovery code was accepted twice.");

let throttled = created.record;
for (let attempt = 0; attempt < 5; attempt += 1) {
  throttled = verifyAppLockCredential(throttled, "000000", 10_000).record;
}
result = verifyAppLockCredential(throttled, "604927", 10_001);
assert(result.blocked && result.retryAfterMs > 0, "Failed attempts were not throttled.");

const replaced = replaceAppLockPin(created.record, "804927", 20_000);
assert(verifyAppLockCredential(replaced.record, "804927", 21_000).ok, "New PIN failed.");
assert(!verifyAppLockCredential(replaced.record, "604927", 21_000).ok, "Old PIN still works.");

const regenerated = regenerateRecoveryCodes(created.record, 30_000);
assert(
  !verifyAppLockCredential(regenerated.record, created.recoveryCodes[1], 31_000).ok,
  "Old recovery code survived regeneration.",
);

console.log("App Lock hashing, recovery and throttling checks passed.");
