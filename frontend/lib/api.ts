import type {
  Category,
  CategoryStat,
  DayView,
  GtdItem,
  GtdStatus,
  HistoryEntry,
  Routine,
  RoutineHistoryWeek,
  RoutinesWeek,
  Settings,
  TaskTemplate,
  WeekStats,
  YoutubeDayStat,
  YoutubeWeekStat,
} from '@/types/api';

// A page loaded over https://tracker.performance can't fetch() a plain
// http://localhost:3001 target — that's mixed active content, which Safari
// blocks outright (Chromium exempts localhost targets, Safari doesn't).
// Route through Caddy's same-origin /api proxy instead on that hostname.
function resolveApiUrl(): string {
  if (typeof window !== 'undefined' && window.location.hostname === 'tracker.performance') {
    return 'https://tracker.performance:4888/api';
  }
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
}

const API_URL = resolveApiUrl();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status} ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function getDay(date: string): Promise<DayView> {
  return request(`/days/${date}`);
}

export function setCategoryDone(date: string, key: string, done: boolean): Promise<DayView> {
  return request(`/days/${date}/categories/${key}`, {
    method: 'PATCH',
    body: JSON.stringify({ done }),
  });
}

export function getGtdItems(status?: GtdStatus): Promise<GtdItem[]> {
  return request(status ? `/gtd/items?status=${status}` : `/gtd/items`);
}

export function createGtdItem(title: string, parentId?: number): Promise<GtdItem> {
  return request(`/gtd/items`, { method: 'POST', body: JSON.stringify({ title, parentId }) });
}

export function updateGtdItem(
  id: number,
  patch: Partial<Pick<GtdItem, 'title' | 'notes' | 'status' | 'scheduledDate' | 'scheduledTime' | 'waitingFor' | 'plannedDate' | 'dueDate' | 'priority' | 'acceptanceCriteria' | 'discussWith'>>,
): Promise<GtdItem> {
  return request(`/gtd/items/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function deleteGtdItem(id: number): Promise<{ id: number }> {
  return request(`/gtd/items/${id}`, { method: 'DELETE' });
}

export function planForToday(title: string, date: string): Promise<GtdItem> {
  return request(`/gtd/items/today`, { method: 'POST', body: JSON.stringify({ title, date }) });
}

export function updateYoutube(date: string, data: { delta?: number; reset?: boolean }): Promise<DayView> {
  return request(`/days/${date}/youtube`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function updatePomodoros(date: string, data: { delta?: number; reset?: boolean }): Promise<DayView> {
  return request(`/days/${date}/pomodoros`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function syncSessionPomodoros(date: string): Promise<DayView> {
  return request(`/days/${date}/pomodoros/sync-session`, { method: 'POST' });
}

export function updateDay(
  date: string,
  data: { eveningClosed?: boolean; rating?: number; comment?: string },
): Promise<DayView> {
  return request(`/days/${date}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function getHistory(limit: number, end?: string): Promise<HistoryEntry[]> {
  return request(`/history?limit=${limit}${end ? `&end=${end}` : ''}`);
}

export function getCategories(): Promise<Category[]> {
  return request('/categories');
}

export function createCategory(key: string, label: string): Promise<Category> {
  return request('/categories', { method: 'POST', body: JSON.stringify({ key, label }) });
}

export function updateCategory(
  key: string,
  data: { label?: string; order?: number; archived?: boolean },
): Promise<Category> {
  return request(`/categories/${key}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function getTaskTemplates(): Promise<TaskTemplate[]> {
  return request('/task-templates');
}

export function createTaskTemplate(text: string): Promise<TaskTemplate> {
  return request('/task-templates', { method: 'POST', body: JSON.stringify({ text }) });
}

export function updateTaskTemplate(id: number, data: { text?: string; order?: number }): Promise<TaskTemplate> {
  return request(`/task-templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function deleteTaskTemplate(id: number): Promise<{ id: number }> {
  return request(`/task-templates/${id}`, { method: 'DELETE' });
}

export function getSettings(): Promise<Settings> {
  return request('/settings');
}

export function updateSettings(data: { youtubeBudget?: number; notificationsEnabled?: boolean }): Promise<Settings> {
  return request('/settings', { method: 'PATCH', body: JSON.stringify(data) });
}

export function getCategoryStats(days: number): Promise<CategoryStat[]> {
  return request(`/stats/categories?days=${days}`);
}

export function getYoutubeWeeklyStats(weeks: number): Promise<YoutubeWeekStat[]> {
  return request(`/stats/youtube?weeks=${weeks}`);
}

export function getYoutubeDailyStats(days: number): Promise<YoutubeDayStat[]> {
  return request(`/stats/youtube-daily?days=${days}`);
}

export function getWeekStats(end: string): Promise<WeekStats> {
  return request(`/stats/week?end=${end}`);
}

export function postWeeklySummary(
  date: string,
  chartPng: string | null,
): Promise<{ posted: boolean; withChart?: boolean; reason?: string }> {
  return request(`/days/${date}/weekly-summary`, {
    method: 'POST',
    body: JSON.stringify(chartPng ? { chartPng } : {}),
  });
}

export function getRoutines(week?: string): Promise<RoutinesWeek> {
  return request(week ? `/routines?week=${week}` : `/routines`);
}

// anchor — локальное «сегодня» вызывающего. Без него бэкенд берёт последнюю
// неделю от своей UTC-даты, и в ночные часы история уезжает на неделю назад
// относительно показанной недели.
export function getRoutinesHistory(weeks = 8, anchor?: string): Promise<RoutineHistoryWeek[]> {
  return request(`/routines/history?weeks=${weeks}${anchor ? `&anchor=${anchor}` : ''}`);
}

// Оба эндпоинта отдают сырую запись рутины, а не недельный срез: прогресс за
// неделю фронт всё равно перечитывает через getRoutines.
export function createRoutine(title: string, weeklyGoal: number, categoryId: number | null): Promise<Routine> {
  return request(`/routines`, { method: 'POST', body: JSON.stringify({ title, weeklyGoal, categoryId }) });
}

export function updateRoutine(
  id: number,
  patch: { title?: string; weeklyGoal?: number; categoryId?: number | null },
): Promise<Routine> {
  return request(`/routines/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function archiveRoutine(id: number): Promise<{ id: number }> {
  return request(`/routines/${id}`, { method: 'DELETE' });
}

export function addRoutineLog(id: number, date: string): Promise<RoutinesWeek> {
  return request(`/routines/${id}/log`, { method: 'POST', body: JSON.stringify({ date }) });
}

export function removeRoutineLog(id: number, date: string): Promise<RoutinesWeek> {
  return request(`/routines/${id}/log/${date}`, { method: 'DELETE' });
}
