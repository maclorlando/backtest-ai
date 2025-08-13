export type EncryptedSecret = {
  version: 1;
  saltB64: string;
  ivB64: string;
  cipherTextB64: string;
};

export type GeneratedWallet = {
  privateKey: `0x${string}`;
  address: `0x${string}`;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

async function deriveKey(password: string, salt: Uint8Array) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: 150_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  return key;
}

export async function generateWallet(): Promise<GeneratedWallet> {
  const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  
  return {
    privateKey,
    address: account.address,
  };
}

export async function encryptSecret(secret: string, password: string): Promise<EncryptedSecret> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(secret)
  );
  return {
    version: 1,
    saltB64: btoa(String.fromCharCode(...salt)),
    ivB64: btoa(String.fromCharCode(...iv)),
    cipherTextB64: btoa(String.fromCharCode(...new Uint8Array(cipherBuf))),
  };
}

export async function decryptSecret(enc: EncryptedSecret, password: string): Promise<string> {
  const salt = Uint8Array.from(atob(enc.saltB64), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(enc.ivB64), c => c.charCodeAt(0));
  const cipher = Uint8Array.from(atob(enc.cipherTextB64), c => c.charCodeAt(0));
  const key = await deriveKey(enc.version === 1 ? password : password, salt);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return textDecoder.decode(plainBuf);
}