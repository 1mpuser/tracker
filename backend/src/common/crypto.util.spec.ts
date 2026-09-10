import { decryptSecret, encryptSecret, isEncrypted, loadEncryptionKey } from './crypto.util';

const KEY = Buffer.from(new Array(32).fill(7)).toString('base64'); // 32 байта
const OTHER = Buffer.from(new Array(32).fill(9)).toString('base64');

describe('crypto.util', () => {
  it('round-trips a secret', () => {
    const stored = encryptSecret('супер-секрет', KEY);
    expect(stored.startsWith('enc:v1:')).toBe(true);
    expect(decryptSecret(stored, KEY)).toBe('супер-секрет');
  });

  it('produces a different ciphertext each time (random iv) yet decrypts the same', () => {
    const a = encryptSecret('помидорки', KEY);
    const b = encryptSecret('помидорки', KEY);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, KEY)).toBe('помидорки');
    expect(decryptSecret(b, KEY)).toBe('помидорки');
  });

  it('cannot be decrypted with another key', () => {
    const stored = encryptSecret('секрет', KEY);
    expect(() => decryptSecret(stored, OTHER)).toThrow();
  });

  it('fails on a corrupted byte (auth tag mismatch)', () => {
    const stored = encryptSecret('секрет', KEY);
    const raw = Buffer.from(stored.slice('enc:v1:'.length), 'base64');
    raw[raw.length - 1] = raw[raw.length - 1] ^ 0xff;
    const corrupted = `enc:v1:${raw.toString('base64')}`;
    expect(() => decryptSecret(corrupted, KEY)).toThrow();
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => encryptSecret('x', 'c2hvcnQ=')).toThrow();
    expect(() => loadEncryptionKey({ APP_ENCRYPTION_KEY: 'c2hvcnQ=' })).toThrow();
  });

  it('isEncrypted distinguishes plaintext from ciphertext', () => {
    expect(isEncrypted('123456:AAAA')).toBe(false);
    expect(isEncrypted('enc:v1:' + Buffer.from('x').toString('base64'))).toBe(true);
  });

  it('loadEncryptionKey returns the env key when valid', () => {
    const valid = Buffer.from(new Array(32).fill(3)).toString('base64');
    expect(loadEncryptionKey({ APP_ENCRYPTION_KEY: valid })).toBe(valid);
  });

  it('loadEncryptionKey throws in production without the key', () => {
    expect(() => loadEncryptionKey({ NODE_ENV: 'production' })).toThrow(/APP_ENCRYPTION_KEY/);
  });

  it('loadEncryptionKey falls back to a dev key outside production', () => {
    expect(loadEncryptionKey({})).toBeTruthy();
  });
});
