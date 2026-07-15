export interface CategoryView {
  key: string;
  label: string;
  done: boolean;
}

export interface DailyTaskView {
  id: number;
  text: string;
  done: boolean;
  order: number;
}

export interface DayView {
  date: string;
  youtubeMinutes: number;
  eveningClosed: boolean;
  categories: CategoryView[];
  dailies: DailyTaskView[];
}

export interface HistoryEntry {
  date: string;
  completed: number;
  total: number;
  ytOver: boolean;
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
