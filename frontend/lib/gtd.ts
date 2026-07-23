import type { GtdItem, GtdStatus } from '@/types/api';

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
