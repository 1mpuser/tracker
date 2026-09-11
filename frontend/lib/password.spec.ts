import { generatePassword } from './password';

// В алфавите генератора нет похожих символов: без l/I, 0/O и 1.
const ALLOWED = /^[a-km-zA-HJ-NP-Z2-9]+$/;

describe('generatePassword', () => {
  it('генерирует 16 символов по умолчанию', () => {
    expect(generatePassword()).toHaveLength(16);
  });

  it('состоит только из «безопасного» алфавита', () => {
    for (let i = 0; i < 100; i++) {
      expect(generatePassword()).toMatch(ALLOWED);
    }
  });

  it('уважает запрошенную длину', () => {
    expect(generatePassword(8)).toHaveLength(8);
    expect(generatePassword(24)).toHaveLength(24);
  });

  it('не повторяется между вызовами', () => {
    const a = generatePassword();
    const b = generatePassword();
    expect(a).not.toBe(b);
  });
});
