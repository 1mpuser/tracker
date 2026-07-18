# Трекер помидорок (Pomodoro) — дизайн

## Мотивация

Нужен ещё один ежедневный трекер: сколько «помидорок» (завершённых фокус-сессий) сделано за день, с вечерним напоминанием, если не добран минимум. Плюс 30-дневный хитмап количества по дням и две «серии» подряд-дней — по минимуму (4+) и по оптимуму (8+).

Архитектурно это близнец существующего YouTube-трекинга (числовой per-day счётчик `Day.youtubeMinutes` + панель + 30-дневный хитмап), с одним отличием: вместо одного порога-бюджета — два зашитых порога и две серии.

## Решения (зафиксировано на брейншторме)

- **Ручной счётчик**, а не таймер: пользователь сам жмёт **+1** после завершённого помидора (как ручной ввод минут YouTube). Кнопки: `+1`, `−1` (исправить промах — у YouTube её нет, но там шаги 10/25/50 + сброс, а тут по 1), `сбросить`.
- **Пороги зашиты константами**: минимум `POMODORO_MIN = 4`, оптимум `POMODORO_OPT = 8`. Никаких новых полей в `Settings`.
- **Хитмап = 30 дней**, одна **градиентная** шкала по количеству (не два бинарных хитмапа).
- **Две серии** (числа): подряд-дней с `≥4` и с `≥8`.
- **Сквозная иерархия достижения** (хитмап, серии, панель): минимум (`≥4`) выглядит хорошо — плотный accent, «молодец»; оптимум (`≥8`) выглядит заметно круче — свечение через `--accent-glow` + яркий бордер/цвет, «заебись». Оптимум везде визуально доминирует над минимумом.
- **Напоминание вечером**: переиспользуем существующее вечернее окно (`isEveningWindow`, 21:30+). Если `pomodoros < POMODORO_MIN` — одно уведомление «Осталось N помидорок до минимума».

## Модель данных

Одно новое поле:

```prisma
model Day {
  // ...
  pomodoros Int @default(0)
}
```

Новая миграция Prisma (`add_day_pomodoros`). Пороги в БД не хранятся.

## Backend

Зеркалит YouTube там, где это возможно.

- **`DaysService`**
  - `DayView` получает поле `pomodoros: number` (в `getDay`).
  - `HistoryEntry` получает поле `pomodoros: number` (в `getHistory`). Это ключевой выбор: хитмап и обе серии на фронте питаются из уже загруженной 84-дневной истории (как `completed`/`total`), **без** отдельного stats-эндпоинта.
  - `updatePomodoros(dateStr, delta?, reset?)` — метод-близнец `updateYoutube`: `reset ? 0 : Math.max(0, day.pomodoros + (delta ?? 0))` (клампится в 0).
- **`DaysController`**: `PATCH /days/:date/pomodoros`, тело — `UpdatePomodorosDto { delta?, reset? }` (копия `UpdateYoutubeDto`: `@IsOptional @IsInt delta`, `@IsOptional @IsBoolean reset`).
- Порог для напоминания на бэкенде не нужен — уведомление считается на фронте.

## Frontend — логика (`lib/`)

- **`lib/pomodoro.ts`** (новый):
  - `POMODORO_MIN = 4`, `POMODORO_OPT = 8`.
  - `computePomodoroStreak(history: HistoryEntry[], today: {date: string; pomodoros: number}, threshold: number): number` — считает подряд-дней с `pomodoros >= threshold`, по **всей** переданной истории (84 дня), не по 30 — чтобы серия длиннее 30 дней отображалась числом корректно. Логика идентична `computeStreak` (тот же backward-loop от вчера + отдельная проверка `today`), но по `pomodoros` и произвольному порогу.
- **`lib/streak.ts`**: чтобы не дублировать backward-loop, выносится приватный дженерик `streakByThreshold(history, today, getValue, threshold)`; `computeStreak` (сферы) становится тонкой обёрткой над ним с `getValue = h => h.completed` и `STREAK_THRESHOLD`. Публичная сигнатура `computeStreak` и его тесты не меняются. `computePomodoroStreak` из `pomodoro.ts` вызывает тот же дженерик.
- **`lib/heatmap.ts`**: `pomodoroHeatmapColor(count, min, opt): string` — заливка (`background`): `0` → `var(--panel-alt)`; `1..min-1` → `var(--accent-soft)` (бледный, «начал»); `min..opt-1` → `rgba(224, 164, 88, 0.6)` — плотный золотой accent, «молодец»; `>= opt` → `var(--accent)` (полный золотой, «оптимум»). Свечение оптимума фоном не выражается (это `box-shadow`) — см. компонент.

## Frontend — компоненты

- **`PomodoroPanel`** (чистый props/callback-компонент, без хуков — по образцу `YoutubePanel`), 4-я карточка в верхней сетке `Dashboard`:
  - Большое число `N`, прогресс-бар к оптимуму (`min(100, count/opt*100)`) с визуальной меткой на минимуме (4).
  - Кнопки `+1`, `−1`, `сбросить`.
  - Две компактные серии с той же иерархией достижения, что и хитмап: `серия ≥4: X` — обычный accent («молодец»); `серия ≥8: Y` — со свечением (`text-shadow`/`box-shadow` через `--accent-glow` + яркий цвет), «заебись». ≥8-серия всегда выделена сильнее ≥4-серии.
  - **Celebratory-состояние сегодняшнего дня:** когда `count >= POMODORO_OPT`, число `N` и прогресс-бар получают то же свечение (`--accent-glow`) — панель «горит», как оптимум-клетка в хитмапе. При `min <= count < opt` — плотный accent без свечения. Ниже минимума — приглушённо.
  - Props: `count`, `streakMin`, `streakOpt`, `onAdd(delta)`, `onReset()`.
- **`PomodoroHeatmap`** (в `StatsPanel`, после `YoutubeDailyHeatmap`): 30 дней из `history.slice(-30)`, заливка `pomodoroHeatmapColor`. **Иерархия достижения:** клетки-оптимумы (`count >= POMODORO_OPT`) дополнительно получают CSS-класс `.optimum` — свечение `box-shadow: 0 0 6px var(--accent-glow)` + лёгкий яркий бордер (`1px solid var(--accent)`), так что оптимумы визуально «горят» на фоне обычных «молодец»-клеток. Легенда: `≥4: A/30 дней · ≥8: B/30 дней`. Принимает `history` пропсом (не self-fetch — данные уже есть в `Dashboard`), как `StreakHeatmap`/`CategoryHeatmap`.

## Data flow / Dashboard

- Состояние `day`/`history` уже есть; добавляется поле `pomodoros` в их типах.
- `addPomodoro(delta)` / `resetPomodoro()` → `updatePomodoros(date, {delta})` / `{reset:true}` → `setDay(...)` + `refreshHistory()` (как `addYoutubeMinutes`/`resetYoutube`).
- Серии считаются в `Dashboard` с живым сегодняшним значением: `computePomodoroStreak(history, {date, pomodoros: day.pomodoros}, 4|8)` — и прокидываются в `PomodoroPanel` (как стрик сфер считается через `computeStreak` и уходит в `Header`).
- **Напоминание**: в существующий вечерний `useEffect`-чек добавляется ветка — если `isEveningWindow(now)` и `day.pomodoros < POMODORO_MIN` → `new Notification('Осталось ${POMODORO_MIN - day.pomodoros} помидорок до минимума')`.

## Прошлые дни (`DayDetailModal`)

- Просмотр (`view`): строка `Помидорок: N` в секции рядом с `YouTube: … мин`.
- Редактирование (`edit`): мини-редактор `+1 / −1 / сбросить` по образцу существующего `ytEditor` — эндпоинт `/days/:date/pomodoros` и так принимает любую дату.

## API-клиент и типы (`frontend/`)

- `lib/api.ts`: `updatePomodoros(date, {delta?, reset?}): Promise<DayView>` — `PATCH /days/:date/pomodoros`, копия `updateYoutube`.
- `types/api.ts`: `DayView.pomodoros: number`, `HistoryEntry.pomodoros: number`.

## Тесты (TDD)

- **Backend** (`days.service.spec.ts`, по образцу youtube-тестов):
  - `updatePomodoros` с `delta` (инкремент), с отрицательным `delta` (кламп в 0), с `reset:true` (в 0).
  - `getDay` возвращает `pomodoros`.
  - `getHistory` включает `pomodoros` в записи.
- **Frontend**:
  - `pomodoro.spec.ts`: `computePomodoroStreak` — серия по порогу, исключение сегодняшней записи из истории (как в `streak.spec.ts`), разрыв серии.
  - `heatmap.spec.ts`: `pomodoroHeatmapColor` — граничные значения `0 / min-1 / min / opt-1 / opt`.
  - `api.spec.ts`: `updatePomodoros` дёргает правильный путь/метод/тело.

## Не входит в объём

- Никакого встроенного таймера/обратного отсчёта — только ручной счётчик.
- Пороги не выносятся в `Settings` и не редактируются из UI (меняются правкой констант + деплой).
- Никаких новых stats-эндпоинтов и `pomodoroDailyStats` — 30-дневный хитмап и серии считаются из общей 84-дневной `/history`.
- `seed.ts` не меняется (нет новых настроек).
