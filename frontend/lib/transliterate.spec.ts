import { transliterate } from './transliterate';

describe('transliterate', () => {
  it('converts Cyrillic letters to a lowercase Latin slug', () => {
    expect(transliterate('Чтение')).toBe('chtenie');
  });

  it('replaces spaces and punctuation with single hyphens', () => {
    expect(transliterate('Общение / свидания')).toBe('obschenie-svidaniya');
  });

  it('trims leading and trailing hyphens', () => {
    expect(transliterate('  Спорт!  ')).toBe('sport');
  });

  it('passes through already-Latin input, lowercased', () => {
    expect(transliterate('Reading')).toBe('reading');
  });

  it('truncates to 40 characters to satisfy the backend DTO limit', () => {
    const longLabel = 'а'.repeat(50);
    expect(transliterate(longLabel).length).toBeLessThanOrEqual(40);
  });

  it('falls back to a timestamp-based key when the label has no transliterable characters', () => {
    // CJK/emoji/pure punctuation collapse to nothing — an empty string would fail
    // the backend's @Matches(/^[a-z0-9_-]+$/), which requires at least one character.
    expect(transliterate('你好')).toMatch(/^category-[a-z0-9]+$/);
    expect(transliterate('!!!')).toMatch(/^category-[a-z0-9]+$/);
    expect(transliterate('')).toMatch(/^category-[a-z0-9]+$/);
  });
});
