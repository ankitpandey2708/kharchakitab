const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const toBase64 = (buffer: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)));

const fromBase64 = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

export const generateKeyPair = async () =>
  crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );

export const exportPublicKey = async (key: CryptoKey) =>
  toBase64(await crypto.subtle.exportKey("raw", key));

export const importPublicKey = async (raw: string) =>
  crypto.subtle.importKey(
    "raw",
    fromBase64(raw),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );

export const deriveSharedKey = async (
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey
) =>
  crypto.subtle.deriveKey(
    { name: "ECDH", public: peerPublicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

export const exportAesKey = async (key: CryptoKey) =>
  toBase64(await crypto.subtle.exportKey("raw", key));

export const importAesKey = async (raw: string) =>
  crypto.subtle.importKey(
    "raw",
    fromBase64(raw),
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );

export const deriveSessionKey = async (
  sharedKeyRaw: string,
  nonce: string
): Promise<CryptoKey> => {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    fromBase64(sharedKeyRaw),
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: textEncoder.encode(nonce),
      info: textEncoder.encode("kharchakitab-sync-session"),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
};

// ---------------------------------------------------------------------------
// Compression helpers (browser-native CompressionStream / DecompressionStream)
// ---------------------------------------------------------------------------

const COMPRESSION_FLAG = 0x01; // 1-byte header: 0x01 = gzip-compressed
const NO_COMPRESSION_FLAG = 0x00;

const supportsCompression =
  typeof CompressionStream !== "undefined" &&
  typeof DecompressionStream !== "undefined";

const compressBytes = async (data: Uint8Array): Promise<Uint8Array> => {
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const compressed = await new Response(
    new Blob([buf]).stream().pipeThrough(new CompressionStream("gzip"))
  ).arrayBuffer();
  // Prepend 1-byte flag so receiver knows this is compressed
  const flagged = new Uint8Array(1 + compressed.byteLength);
  flagged[0] = COMPRESSION_FLAG;
  flagged.set(new Uint8Array(compressed), 1);
  return flagged;
};

const decompressBytes = async (data: Uint8Array): Promise<Uint8Array> => {
  const flag = data[0];
  if (flag === COMPRESSION_FLAG) {
    // Strip the 1-byte header, then decompress
    const compressed = data.slice(1);
    const compBuf = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength) as ArrayBuffer;
    const decompressed = await new Response(
      new Blob([compBuf]).stream().pipeThrough(new DecompressionStream("gzip"))
    ).arrayBuffer();
    return new Uint8Array(decompressed);
  }
  // No compression flag (or legacy uncompressed payload) — return as-is
  if (flag === NO_COMPRESSION_FLAG) return data.slice(1);
  // Fallback: no flag at all (old client) — entire buffer is the plaintext
  return data;
};

// ---------------------------------------------------------------------------
// Encrypt / Decrypt with transparent gzip compression
// ---------------------------------------------------------------------------

export const encryptPayload = async (key: CryptoKey, payload: unknown) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const jsonBytes = textEncoder.encode(JSON.stringify(payload));

  // Compress if the browser supports it
  const plaintext = supportsCompression
    ? await compressBytes(jsonBytes)
    : jsonBytes;

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new Uint8Array(plaintext) as BufferSource
  );
  return {
    iv: toBase64(iv.buffer),
    data: toBase64(ciphertext),
  };
};

export const decryptPayload = async <T>(
  key: CryptoKey,
  message: { iv: string; data: string }
): Promise<T> => {
  const iv = new Uint8Array(fromBase64(message.iv));
  const ciphertext = fromBase64(message.data);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  const raw = new Uint8Array(plaintext);

  // Check if the first byte is a compression flag
  let jsonBytes: Uint8Array;
  if (raw.length > 0 && (raw[0] === COMPRESSION_FLAG || raw[0] === NO_COMPRESSION_FLAG)) {
    if (raw[0] === COMPRESSION_FLAG && !supportsCompression) {
      throw new Error(
        "Received a compressed sync payload, but this browser does not support DecompressionStream. " +
        "Please update your browser to the latest version."
      );
    }
    jsonBytes = supportsCompression
      ? await decompressBytes(raw)
      : raw.slice(1); // NO_COMPRESSION_FLAG — just strip the flag byte
  } else {
    // Legacy uncompressed payload (no flag byte) — use as-is
    jsonBytes = raw;
  }

  const decoded = textDecoder.decode(jsonBytes);
  return JSON.parse(decoded) as T;
};
