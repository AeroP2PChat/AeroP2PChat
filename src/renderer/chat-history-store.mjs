import { openDB } from "idb";

const DATABASE_NAME = "aero-p2p-chat-history";
const DATABASE_VERSION = 1;
const STORE_NAME = "conversations";
const MAX_STORED_MESSAGES = 2000;

const databasePromise = openDB(DATABASE_NAME, DATABASE_VERSION, {
  upgrade(database) {
    const store = database.createObjectStore(STORE_NAME, { keyPath: "key" });
    store.createIndex("identityId", "identityId");
  },
});

function conversationKey(identityId, peerId) {
  return `${identityId}::${peerId}`;
}

function cloneSerializable(value) {
  if (value === undefined) return undefined;
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function serializeMessage(message) {
  const stored = {
    id: String(message.id || "").slice(0, 128),
    text: String(message.text || ""),
    sender: message.sender === "me" ? "me" : "them",
    peerId: String(message.peerId || ""),
    time: String(message.time || ""),
    replyTo: cloneSerializable(message.replyTo) || null,
    deliveryStatus: String(message.deliveryStatus || ""),
    createdAt: Number(message.createdAt) || Date.now(),
    sentAt: Number(message.sentAt) || null,
    receivedAt: Number(message.receivedAt) || null,
    deliveredAt: Number(message.deliveredAt) || null,
    readAt: Number(message.readAt) || null,
    payloadBytes: Number(message.payloadBytes) || 0,
    roundTripMs: Number.isFinite(message.roundTripMs)
      ? message.roundTripMs
      : null,
    reactions: Array.isArray(message.reactions)
      ? cloneSerializable(message.reactions.slice(0, 8))
      : [],
  };

  if (message.file) {
    stored.file = {
      id: String(message.file.id || ""),
      name: String(message.file.name || "file"),
      mimeType: String(message.file.mimeType || "application/octet-stream"),
      size: Number(message.file.size) || 0,
      sha256: String(message.file.sha256 || ""),
      security: cloneSerializable(message.file.security),
      downloadState: "released",
      transferStatus: "File is no longer cached after restart",
    };
  }

  if (message.voice) {
    stored.voice = {
      id: String(message.voice.id || ""),
      mimeType: String(message.voice.mimeType || "audio/webm"),
      size: Number(message.voice.size) || 0,
      duration: Number(message.voice.duration) || 0,
      sha256: String(message.voice.sha256 || ""),
      downloadState: "released",
      transferStatus: "Voice message is no longer cached after restart",
    };
  }

  return stored;
}

export async function loadStoredConversations(identityId) {
  if (!identityId) return [];
  const database = await databasePromise;
  const records = await database.getAllFromIndex(
    STORE_NAME,
    "identityId",
    identityId,
  );
  return records
    .filter((record) => record?.peerId && Array.isArray(record.messages))
    .map((record) => ({
      peerId: record.peerId,
      messages: record.messages.slice(-MAX_STORED_MESSAGES),
    }));
}

export async function storeConversation(identityId, peerId, messages) {
  if (!identityId || !peerId) return;
  const database = await databasePromise;
  const serialized = messages
    .slice(-MAX_STORED_MESSAGES)
    .map(serializeMessage);
  await database.put(STORE_NAME, {
    key: conversationKey(identityId, peerId),
    identityId,
    peerId,
    messages: serialized,
    updatedAt: Date.now(),
  });
}

export async function deleteStoredConversation(identityId, peerId) {
  if (!identityId || !peerId) return;
  const database = await databasePromise;
  await database.delete(STORE_NAME, conversationKey(identityId, peerId));
}

export async function clearStoredConversations(identityId = "") {
  const database = await databasePromise;
  const keys = identityId
    ? await database.getAllKeysFromIndex(STORE_NAME, "identityId", identityId)
    : await database.getAllKeys(STORE_NAME);
  if (!keys.length) return 0;
  const transaction = database.transaction(STORE_NAME, "readwrite");
  await Promise.all(keys.map((key) => transaction.store.delete(key)));
  await transaction.done;
  return keys.length;
}
