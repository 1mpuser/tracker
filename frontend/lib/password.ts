// Алфавит без похожих символов (0/O, 1/l/I, 5/S): выданный устно пароль не
// должен разбираться неоднозначно. Убраны и скобки/кавычки, чтобы пароль не
// ломал вёрстку и оболочки.
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Чистая функция генерации пароля новой учётки: crypto.getRandomValues из web
// crypto глобальна и в браузере, и в Node/bun. Отбрасываем старшие байты, у
// которых остаток от деления был бы смещён (отбор без модульного смещения).
export function generatePassword(length = 16): string {
  const alphabetSize = ALPHABET.length;
  const maxOk = Math.floor(256 / alphabetSize) * alphabetSize;
  const out: string[] = [];
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (out.length >= length) break;
      if (b >= maxOk) continue;
      out.push(ALPHABET[b % alphabetSize]);
    }
  }
  return out.join('');
}
