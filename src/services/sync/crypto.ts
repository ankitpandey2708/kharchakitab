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

export const encryptPayload = async (key: CryptoKey, payload: unknown) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = textEncoder.encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
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
  const decoded = textDecoder.decode(plaintext);
  return JSON.parse(decoded) as T;
};
