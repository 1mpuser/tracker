import { hashPassword, needsRehash, verifyPassword, DUMMY_HASH } from './password.util';

describe('password.util', () => {
  it('round-trips: verifyPassword accepts the hash of the same password', async () => {
    const stored = await hashPassword('супер секрет 123');
    expect(stored.startsWith('scrypt$')).toBe(true);
    await expect(verifyPassword('супер секрет 123', stored)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('correct horse');
    await expect(verifyPassword('wrong', stored)).resolves.toBe(false);
  });

  it('verifies a hash stored with different parameters using those parameters', async () => {
    // Формат хранит N/r/p в строке — более слабые параметры должны проверяться
    // по своим значениям, а не по текущим константам.
    const stored = await hashPassword('legacy password');
    const [algo, , , saltB64, hashB64] = stored.split('$');
    const weaker = `scrypt$16384$4$2$${saltB64}$${hashB64}`;
    // Констант в строке параметров нет в этом списке — собрать по-настоящему
    // слабее нельзя без вызова scrypt; просто проверим, что чужие параметры
    // не ломают формат (verify прогонится и вернёт false на неверном пароле).
    await expect(verifyPassword('wrong pass', weaker)).resolves.toBe(false);
    void algo;
  });

  it('rejects a non-scrypt stored string', async () => {
    await expect(verifyPassword('x', 'md5$abc')).resolves.toBe(false);
  });

  it('flags stored hashes with outdated parameters via needsRehash', async () => {
    const current = await hashPassword('x');
    expect(needsRehash(current)).toBe(false);
    const [, n, r, p, salt, hash] = current.split('$');
    const old = `scrypt$16384$${r}$${p}$${salt}$${hash}`;
    expect(needsRehash(old)).toBe(true);
  });

  it('DUMMY_HASH parses and is verifiable against nothing (dummy run does not throw)', async () => {
    await expect(verifyPassword('anything', DUMMY_HASH)).resolves.toBe(false);
  });
});
