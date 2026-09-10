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
  TelegramBotView,
  TelegramChat,
  TelegramChatInfo,
  TelegramChatList,
  ICloudView,
  SessionView,
  WeekStats,
  DistractionDayStat,
  DistractionWeekStat,
} from '@/types/api';

// A page loaded over https://tracker.performance can't fetch() a plain
// http://localhost:3001 target — that's mixed active content, which Safari
// blocks outright (Chromium exempts localhost targets, Safari doesn't).
// Route through Caddy's same-origin /api proxy instead on that hostname.
// Значение, начинающееся с '/', — путь на своём origin (прод: фронт и API
// за одним доменом, API проксируется Caddy в /api).
function resolveApiUrl(): string {
  if (typeof window !== 'undefined' && window.location.hostname === 'tracker.performance') {
    return 'https://tracker.performance:4888/api';
  }
  const url = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  if (url.startsWith('/')) return url;
  return url;
}

const API_URL = resolveApiUrl();

// Эндпоинты аутентификации, на которых 401 не должен уводить на /login
// (иначе «Неверная почта или пароль» кидало бы на страницу входа).
const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/register/confirm', '/auth/register/resend', '/auth/forgot', '/auth/reset'];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (res.status === 401 && !AUTH_PATHS.some((p) => path.startsWith(p)) && typeof window !== 'undefined') {
    // Сессия протухла: уводим на вход и никогда не резолвимся — кода ниже
    // в этой сессии уже быть не должно.
    window.location.href = '/login';
    return new Promise<T>(() => {});
  }
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

export function updateDistraction(date: string, data: { delta?: number; reset?: boolean }): Promise<DayView> {
  return request(`/days/${date}/distraction`, { method: 'PATCH', body: JSON.stringify(data) });
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

export function updateSettings(data: {
  distractionBudget?: number;
  distractionLabel?: string;
  notificationsEnabled?: boolean;
}): Promise<Settings> {
  return request('/settings', { method: 'PATCH', body: JSON.stringify(data) });
}

export function getCategoryStats(days: number): Promise<CategoryStat[]> {
  return request(`/stats/categories?days=${days}`);
}

export function getDistractionWeeklyStats(weeks: number): Promise<DistractionWeekStat[]> {
  return request(`/stats/distraction?weeks=${weeks}`);
}

export function getDistractionDailyStats(days: number): Promise<DistractionDayStat[]> {
  return request(`/stats/distraction-daily?days=${days}`);
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
export function createRoutine(
  title: string,
  timesPerDay: number,
  daysPerWeek: number,
  categoryId: number | null,
): Promise<Routine> {
  return request(`/routines`, {
    method: 'POST',
    body: JSON.stringify({ title, timesPerDay, daysPerWeek, categoryId }),
  });
}

export function updateRoutine(
  id: number,
  patch: { title?: string; timesPerDay?: number; daysPerWeek?: number; categoryId?: number | null },
): Promise<Routine> {
  return request(`/routines/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function archiveRoutine(id: number): Promise<{ id: number }> {
  return request(`/routines/${id}`, { method: 'DELETE' });
}

// count — абсолютное число отметок за день, а не приращение.
export function setRoutineLog(id: number, date: string, count: number): Promise<RoutinesWeek> {
  return request(`/routines/${id}/log`, { method: 'POST', body: JSON.stringify({ date, count }) });
}

export function removeRoutineLog(id: number, date: string): Promise<RoutinesWeek> {
  return request(`/routines/${id}/log/${date}`, { method: 'DELETE' });
}

export interface AuthUser {
  id: number;
  email: string;
  timezone: string;
}

export function register(data: { email: string; password: string; timezone?: string }): Promise<void> {
  return request('/auth/register', { method: 'POST', body: JSON.stringify(data) });
}

export function confirmSignupByToken(token: string): Promise<{ user: AuthUser }> {
  return request('/auth/register/confirm', { method: 'POST', body: JSON.stringify({ token }) });
}

export function confirmSignupByCode(email: string, code: string): Promise<{ user: AuthUser }> {
  return request('/auth/register/confirm', { method: 'POST', body: JSON.stringify({ email, code }) });
}

export function resendSignup(email: string): Promise<void> {
  return request('/auth/register/resend', { method: 'POST', body: JSON.stringify({ email }) });
}

export function login(email: string, password: string): Promise<{ user: AuthUser }> {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export function forgotPassword(email: string): Promise<void> {
  return request('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) });
}

export function resetPassword(token: string, password: string): Promise<{ user: AuthUser }> {
  return request('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) });
}

export function getMe(): Promise<{ user: AuthUser }> {
  return request('/auth/me');
}

export function updateMe(timezone: string): Promise<{ user: AuthUser }> {
  return request('/auth/me', { method: 'PATCH', body: JSON.stringify({ timezone }) });
}

export function changePassword(current: string, next: string): Promise<void> {
  return request('/auth/password', { method: 'POST', body: JSON.stringify({ current, next }) });
}

export function logout(): Promise<void> {
  return request('/auth/logout', { method: 'POST' });
}

export function logoutAll(): Promise<void> {
  return request('/auth/logout-all', { method: 'POST' });
}

// NestJS отдаёт ошибки как {"message": "...", ...}; request() кладёт тело в текст Error.
export function apiErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const json = raw.slice(raw.indexOf('{'));
  try {
    const message = (JSON.parse(json) as { message?: string | string[] }).message;
    if (Array.isArray(message)) return message.join('; ');
    if (message) return message;
  } catch {
    // не JSON — отдаём как есть
  }
  return raw;
}

export function getTelegramBot(): Promise<TelegramBotView> {
  return request('/telegram/bot');
}

export function setTelegramBotToken(token: string): Promise<TelegramBotView> {
  return request('/telegram/bot', { method: 'PUT', body: JSON.stringify({ token }) });
}

export function clearTelegramBotToken(): Promise<TelegramBotView> {
  return request('/telegram/bot', { method: 'DELETE' });
}

export function getTelegramChats(): Promise<TelegramChatList> {
  return request('/telegram/chats');
}

export function createTelegramChat(data: {
  title: string;
  chatId: string;
  daily?: boolean;
  weekly?: boolean;
}): Promise<TelegramChat> {
  return request('/telegram/chats', { method: 'POST', body: JSON.stringify(data) });
}

export function updateTelegramChat(
  id: number,
  data: { title?: string; daily?: boolean; weekly?: boolean },
): Promise<TelegramChat> {
  return request(`/telegram/chats/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function deleteTelegramChat(id: number): Promise<void> {
  return request(`/telegram/chats/${id}`, { method: 'DELETE' });
}

export function testTelegramChat(id: number): Promise<{ ok: boolean }> {
  return request(`/telegram/chats/${id}/test`, { method: 'POST' });
}

export function discoverTelegramChats(): Promise<TelegramChatInfo[]> {
  return request('/telegram/discover');
}

export function getICloud(): Promise<ICloudView> {
  return request('/integrations/icloud');
}

export function setICloud(data: { appleId: string; appPassword: string; remindersList?: string }): Promise<ICloudView> {
  return request('/integrations/icloud', { method: 'PUT', body: JSON.stringify(data) });
}

export function clearICloud(): Promise<ICloudView> {
  return request('/integrations/icloud', { method: 'DELETE' });
}

export function resyncICloud(): Promise<{ synced: number }> {
  return request('/integrations/icloud/resync', { method: 'POST' });
}

export function getSession(): Promise<SessionView> {
  return request('/integrations/session');
}

export function setSession(data: { calendarName: string; minMinutes?: number }): Promise<SessionView> {
  return request('/integrations/session', { method: 'PUT', body: JSON.stringify(data) });
}

export function clearSession(): Promise<SessionView> {
  return request('/integrations/session', { method: 'DELETE' });
}
