export interface CategoryView {
  key: string;
  label: string;
  done: boolean;
}

export interface DayView {
  date: string;
  youtubeMinutes: number;
  pomodoros: number;
  eveningClosed: boolean;
  rating: number | null;
  comment: string | null;
  categories: CategoryView[];
  today: GtdItem[];
}

export interface HistoryEntry {
  date: string;
  completed: number;
  total: number;
  pomodoros: number;
  ytOver: boolean;
  rating: number | null;
}

export interface Category {
  id: number;
  key: string;
  label: string;
  order: number;
  archived: boolean;
}

export interface TaskTemplate {
  id: number;
  text: string;
  order: number;
}

export interface Settings {
  id: number;
  youtubeBudget: number;
  notificationsEnabled: boolean;
}

export interface CategoryStat {
  key: string;
  label: string;
  doneCount: number;
  totalDays: number;
  pct: number;
}

export interface YoutubeWeekStat {
  weekStart: string;
  avgMinutes: number;
  budget: number;
}

export interface YoutubeDayStat {
  date: string;
  minutes: number;
  budget: number;
  pct: number;
}

export type GtdStatus =
  | 'inbox' | 'backlog' | 'calendar' | 'someday' | 'waiting' | 'project' | 'reference' | 'done' | 'archived';

export interface GtdItem {
  id: number;
  title: string;
  notes: string | null;
  status: GtdStatus;
  parentId: number | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  waitingFor: string | null;
  acceptanceCriteria: string | null;
  discussWith: string | null;
  plannedDate: string | null;
  dueDate: string | null;
  priority: boolean;
  order: number;
  completedAt: string | null;
}
