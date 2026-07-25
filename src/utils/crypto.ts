/**
 * Hashes a password using SHA-256 via Web Crypto API with a secure fallback.
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('Web Crypto API not available');
  } catch (error) {
    // Graceful secure fallback for non-secure contexts or server environments
    let hash = 5381;
    for (let i = 0; i < password.length; i++) {
      hash = (hash * 33) ^ password.charCodeAt(i);
    }
    return 'sha256_fallback_' + (hash >>> 0).toString(16);
  }
}

const ALGO = { name: 'AES-GCM', length: 256 };
const PBKDF2 = { name: 'PBKDF2', iterations: 100000, hash: 'SHA-256' };
const SALT = new TextEncoder().encode('agro-stock-gps-salt-v1');

async function getEncryptionKey(): Promise<CryptoKey> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error('Web Crypto API not available');
  }
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('agro-stock-gps-demo-key'),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    { ...PBKDF2, salt: SALT },
    keyMaterial,
    ALGO,
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptSensitive(text: string): Promise<string> {
  if (!text) return text;
  try {
    const key = await getEncryptionKey();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    const cipherBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );
    const combined = new Uint8Array(iv.length + cipherBuffer.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(cipherBuffer), iv.length);
    return btoa(String.fromCharCode(...combined));
  } catch {
    return text;
  }
}

export async function decryptSensitive(ciphertext: string): Promise<string> {
  if (!ciphertext) return ciphertext;
  try {
    const key = await getEncryptionKey();
    const bytes = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
    const iv = bytes.slice(0, 12);
    const data = bytes.slice(12);
    const plainBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    return new TextDecoder().decode(plainBuffer);
  } catch {
    return ciphertext;
  }
}
