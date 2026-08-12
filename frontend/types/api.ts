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
  sessionSyncEnabled: boolean;
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

export interface WeekDayStat {
  date: string;
  weekday: string;
  pomodoros: number;
  rating: number | null;
  closed: boolean;
}

export interface WeekStats {
  weekStart: string;
  weekEnd: string;
  days: WeekDayStat[];
  totalPomodoros: number;
  avgPomodoros: number;
  bestDay: { date: string; weekday: string; pomodoros: number } | null;
  avgRating: number | null;
  ratedDays: number;
  categories: { label: string; doneCount: number }[];
  youtubeAvgMinutes: number;
  youtubeBudget: number;
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
  decidedAt: string | null;
  deferCount: number;
}

export interface RoutineView {
  id: number;
  title: string;
  weeklyGoal: number;
  categoryId: number | null;
  done: number;
  days: string[];
  order: number;
}

export interface RoutinesWeek {
  weekStart: string;
  weekEnd: string;
  routines: RoutineView[];
}

export interface RoutineHistoryWeek {
  weekStart: string;
  items: { routineId: number; done: number; weeklyGoal: number }[];
}
