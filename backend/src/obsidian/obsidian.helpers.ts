export function noteFilename(item: { id: number; title: string }): string {
  let slug = item.title.replace(/[\/\\:*?"<>|\r\n]+/g, '-');
  slug = slug.replace(/-+/g, '-').replace(/^-+|-+$/g, '').trim();
  if (slug.length > 80) slug = slug.slice(0, 80).replace(/-+$/, '');
  if (!slug) slug = 'zametka';
  return `${slug}-${item.id}.md`;
}

export function noteContent(
  item: { id: number; title: string; notes: string | null },
  exported: string,
): string {
  const fm = [
    '---',
    `title: "${item.title.replace(/"/g, '\\"')}"`,
    `gtdId: ${item.id}`,
    'source: tracker-gtd',
    `exported: ${exported}`,
    '---',
    '',
    item.notes ?? '',
    '',
  ];
  return fm.join('\n');
}
