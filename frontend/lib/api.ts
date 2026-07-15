import type {
  Category,
  CategoryStat,
  DailyTaskView,
  DayView,
  HistoryEntry,
  Settings,
  TaskTemplate,
  YoutubeDayStat,
  YoutubeWeekStat,
} from '@/types/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

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

export function addDaily(date: string, text: string): Promise<DailyTaskView> {
  return request(`/days/${date}/dailies`, { method: 'POST', body: JSON.stringify({ text }) });
}

export function updateDaily(id: number, data: { done?: boolean; text?: string }): Promise<DailyTaskView> {
  return request(`/dailies/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function deleteDaily(id: number): Promise<{ id: number }> {
  return request(`/dailies/${id}`, { method: 'DELETE' });
}

export function updateYoutube(date: string, data: { delta?: number; reset?: boolean }): Promise<DayView> {
  return request(`/days/${date}/youtube`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function setEveningClosed(date: string, eveningClosed: boolean): Promise<DayView> {
  return request(`/days/${date}`, { method: 'PATCH', body: JSON.stringify({ eveningClosed }) });
}

export function getHistory(limit: number): Promise<HistoryEntry[]> {
  return request(`/history?limit=${limit}`);
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
