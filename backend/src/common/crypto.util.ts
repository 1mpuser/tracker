import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_BYTES = 32;

// Формат: "enc:v1:" + base64(iv(12) | tag(16) | ciphertext). Префикс отличает
// зашифрованное от открытого текста, оставшегося от однопользовательской версии.
export function encryptSecret(plain: string, keyB64: string): string {
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== KEY_BYTES) throw new Error('ENC-ключ должен быть 32 байта в base64');
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
}

export function decryptSecret(stored: string, keyB64: string): string {
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== KEY_BYTES) throw new Error('ENC-ключ должен быть 32 байта в base64');
  if (!isEncrypted(stored)) throw new Error('Не зашифрованные секреты расшифровать нельзя');
  const raw = Buffer.from(stored.slice('enc:v1:'.length), 'base64');
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith('enc:v1:');
}

export function loadEncryptionKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.APP_ENCRYPTION_KEY?.trim();
  if (key) {
    const bytes = Buffer.from(key, 'base64');
    if (bytes.length !== KEY_BYTES) {
      throw new Error('APP_ENCRYPTION_KEY должна быть 32 байта в base64 (openssl rand -base64 32)');
    }
    return key;
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('В production нужен APP_ENCRYPTION_KEY — без него секреты интеграций не расшифровать');
  }
  // Dev-ключ только для локальной разработки: в проде loadEncryptionKey упадёт выше.
  return 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
}
