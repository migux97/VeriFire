// Only a salted PBKDF2 hash of the password is stored, and the key that opens the Cavos signing key on another device
// is derived from the same password: both are computed here and the password itself is never kept.
import type { PasswordHash, StoredUser } from './account';
import { base64ToBytes, bytesToBase64, bytesToHex } from './bytes';

const PASSWORD_ITERATIONS = 310000;

const deriveBits = async (password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) => {
  if (!window.crypto?.subtle) {
    throw new Error('Abrí Verifire con HTTPS (o localhost) para poder proteger tu contraseña.');
  }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
};

export const hashPassword = async (
  password: string,
  salt = crypto.getRandomValues(new Uint8Array(16)),
  iterations = PASSWORD_ITERATIONS
): Promise<PasswordHash> => ({
  salt: bytesToBase64(salt),
  hash: bytesToBase64(await deriveBits(password, salt, iterations)),
  iterations
});

export const verifyPassword = async (user: StoredUser | null, password: string) => {
  if (user?.passwordHash) {
    const { salt, hash, iterations } = user.passwordHash;
    return (await hashPassword(password, base64ToBytes(salt), iterations)).hash === hash;
  }
  return Boolean(user?.password) && user?.password === password;
};

// The multi-device factor: the same on every device for the same email and password.
export const deviceCodeFor = async (email: string, password: string) => {
  const salt = new TextEncoder().encode(`verifire-device-v1:${email.trim().toLowerCase()}`);
  return bytesToHex(await deriveBits(password, salt, PASSWORD_ITERATIONS));
};
