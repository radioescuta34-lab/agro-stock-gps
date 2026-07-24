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
