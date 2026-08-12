import type { GtdItem, GtdStatus } from '@/types/api';
import { parseUTC } from './date';

export interface ClarifyRoute {
  status: GtdStatus;
  needs?: 'date' | 'waitingFor';
}
export interface ClarifyOption {
  label: string;
  route?: ClarifyRoute;
  next?: string;
}
export interface ClarifyQuestion {
  key: string;
  prompt: string;
  options: ClarifyOption[];
}

export const CLARIFY_START = 'actionable';

export const CLARIFY: Record<string, ClarifyQuestion> = {
  actionable: {
    key: 'actionable',
    prompt: 'С этим надо что-то делать?',
    options: [
      { label: 'Нет → Заметки', route: { status: 'reference' } },
      { label: 'Нет → Архив', route: { status: 'archived' } },
      { label: 'Да', next: 'mine' },
    ],
  },
  mine: {
    key: 'mine',
    prompt: 'Делать мне?',
    options: [
      { label: 'Нет → делегировать', route: { status: 'waiting', needs: 'waitingFor' } },
      { label: 'Да', next: 'when' },
    ],
  },
  when: {
    key: 'when',
    prompt: 'Когда?',
    options: [
      { label: 'На дату → Календарь', route: { status: 'calendar', needs: 'date' } },
      { label: 'Когда-нибудь', route: { status: 'someday' } },
      { label: 'В ближайшее', next: 'single' },
    ],
  },
  single: {
    key: 'single',
    prompt: 'Одношаговая или проект?',
    options: [
      { label: 'Проект', route: { status: 'project' } },
      { label: 'Одношаговая', next: 'fiveMin' },
    ],
  },
  fiveMin: {
    key: 'fiveMin',
    prompt: 'За 5 минут?',
    options: [
      { label: 'Да → сделал', route: { status: 'done' } },
      { label: 'Нет → Бэклог', route: { status: 'backlog' } },
    ],
  },
};

export const BUCKET_TABS: { status: GtdStatus; label: string }[] = [
  { status: 'inbox', label: 'Корзина' },
  { status: 'backlog', label: 'Бэклог' },
  { status: 'calendar', label: 'Календарь' },
  { status: 'project', label: 'Проекты' },
  { status: 'waiting', label: 'Ожидание' },
  { status: 'someday', label: 'Когда-нибудь' },
  { status: 'reference', label: 'Заметки' },
  { status: 'done', label: 'Done' },
  { status: 'archived', label: 'Архив' },
];

const ALL_STATUSES: GtdStatus[] = [
  'inbox', 'backlog', 'calendar', 'someday', 'waiting', 'project', 'reference', 'done', 'archived',
];

export function groupByStatus(items: GtdItem[]): Record<GtdStatus, GtdItem[]> {
  const grouped = Object.fromEntries(ALL_STATUSES.map((s) => [s, [] as GtdItem[]])) as Record<GtdStatus, GtdItem[]>;
  for (const item of items) {
    grouped[item.status].push(item);
  }
  return grouped;
}

export function sortGtdItems(items: GtdItem[]): GtdItem[] {
  return [...items].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    if (a.dueDate !== b.dueDate) {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    }
    return a.order - b.order;
  });
}

export function nextActionId(children: GtdItem[]): number | null {
  const backlog = children.filter((c) => c.status === 'backlog').sort((a, b) => a.order - b.order);
  return backlog[0]?.id ?? null;
}

export const STALE_AFTER_DAYS = 7;
export const ESCALATE_AFTER_DEFERS = 3;

/** Дата последнего решения о судьбе задачи: явное решение либо вытягивание в «сегодня». */
export function lastDecisionDate(item: GtdItem): string | null {
  const decided = item.decidedAt ? item.decidedAt.slice(0, 10) : null;
  const planned = item.plannedDate;
  if (!decided) return planned;
  if (!planned) return decided;
  return decided > planned ? decided : planned;
}

export function staleDays(item: GtdItem, today: string): number {
  const last = lastDecisionDate(item);
  if (!last) return Infinity;
  const ms = parseUTC(today).getTime() - parseUTC(last).getTime();
  return Math.floor(ms / 86_400_000);
}

export function isStale(item: GtdItem, today: string): boolean {
  if (item.status !== 'backlog') return false;
  return staleDays(item, today) >= STALE_AFTER_DAYS;
}

export function isOverdue(item: GtdItem, today: string): boolean {
  return item.status === 'calendar' && !!item.scheduledDate && item.scheduledDate < today;
}

export function needsEscalation(item: GtdItem): boolean {
  return item.deferCount >= ESCALATE_AFTER_DEFERS;
}

export function staleItems(items: GtdItem[], today: string): GtdItem[] {
  return items
    .filter((i) => isStale(i, today))
    .sort((a, b) => staleDays(b, today) - staleDays(a, today));
}

export function overdueItems(items: GtdItem[], today: string): GtdItem[] {
  return items
    .filter((i) => isOverdue(i, today))
    .sort((a, b) => (a.scheduledDate! < b.scheduledDate! ? -1 : 1));
}

const SIMILAR_EXCLUDED: GtdStatus[] = ['done', 'archived'];
const MIN_WORD_LENGTH = 4;

function significantWords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= MIN_WORD_LENGTH);
}

/**
 * Похожие живые задачи — предупреждение при захвате, не блокировка.
 * Ложные срабатывания допустимы: показать лишнюю строку дешевле, чем прозевать дубль.
 */
export function findSimilar(title: string, items: GtdItem[], limit = 3): GtdItem[] {
  const words = significantWords(title);
  if (words.length === 0) return [];
  return items
    .filter((i) => !SIMILAR_EXCLUDED.includes(i.status))
    .filter((i) => {
      const other = significantWords(i.title);
      return words.some((w) => other.some((o) => o.startsWith(w) || w.startsWith(o)));
    })
    .slice(0, limit);
}
