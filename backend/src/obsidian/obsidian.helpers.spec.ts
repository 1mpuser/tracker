import { noteContent, noteFilename } from './obsidian.helpers';

describe('noteFilename', () => {
  it('keeps a normal title and appends -id.md', () => {
    expect(noteFilename({ id: 5, title: 'Полезная ссылка' })).toBe('Полезная ссылка-5.md');
  });
  it('sanitizes filesystem-unsafe characters', () => {
    expect(noteFilename({ id: 6, title: 'a/b:c*?' })).toBe('a-b-c-6.md');
  });
  it('falls back to zametka for an empty/blank title', () => {
    expect(noteFilename({ id: 7, title: '   ' })).toBe('zametka-7.md');
  });
  it('truncates very long titles to <= 80 slug chars', () => {
    const long = 'x'.repeat(200);
    const name = noteFilename({ id: 8, title: long });
    expect(name.endsWith('-8.md')).toBe(true);
    expect(name.length).toBeLessThanOrEqual(80 + '-8.md'.length);
  });
});

describe('noteContent', () => {
  it('builds frontmatter + notes body', () => {
    const md = noteContent({ id: 5, title: 'Ссылка', notes: 'тело заметки' }, '2026-07-24');
    expect(md).toContain('title: "Ссылка"');
    expect(md).toContain('gtdId: 5');
    expect(md).toContain('source: tracker-gtd');
    expect(md).toContain('exported: 2026-07-24');
    expect(md.trimEnd().endsWith('тело заметки')).toBe(true);
  });
  it('uses an empty body when notes is null', () => {
    const md = noteContent({ id: 9, title: 'T', notes: null }, '2026-07-24');
    expect(md).toContain('gtdId: 9');
    expect(md.split('---')[2].trim()).toBe('');
  });
});
