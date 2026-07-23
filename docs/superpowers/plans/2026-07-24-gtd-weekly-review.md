# GTD C.1 — воскресное напоминание Weekly Review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить воскресное напоминание о Weekly Review — новая функция окна `isWeeklyReviewWindow`, ветка уведомления в `Dashboard` (один раз за воскресенье через `localStorage`) и баннер на GTD-экране по воскресеньям.

**Architecture:** Полностью на существующем фронт-цикле уведомлений (без крона/бэкенда). Чистая логика окна — в `lib/notifications.ts` (TDD); подключение — правки `Dashboard.tsx` и `GtdScreen.tsx`.

**Tech Stack:** Next.js + React, Bun, Jest. Спека: `docs/superpowers/specs/2026-07-24-gtd-weekly-review-design.md`.

## Global Constraints

- Рантайм — **Bun** (`bunx jest`, `bun run build`).
- Время окон — **локальное** (`getDay`/`getHours`), не UTC (как `isMorningWindow`/`isEveningWindow`).
- CSS — только дизайн-токены из `app/globals.css` (`--accent`, `--accent-soft`, `--radius`, `--text`, …). Без хардкода цветов.
- Компоненты не юнит-тестятся — гейт `bun run build`; логика окна покрыта в `lib/`.
- Коммиты частые, по одному на задачу; **без** trailer `Co-Authored-By`.

**Предусловие:** `bun install` во `frontend/`. Команды — из `frontend/`.

---

### Task 1: `isWeeklyReviewWindow` в `lib/notifications.ts`

**Files:**
- Modify: `frontend/lib/notifications.ts`
- Test: `frontend/lib/notifications.spec.ts`

**Interfaces:**
- Produces: `isWeeklyReviewWindow(now: Date): boolean` — `true`, если воскресенье и локальный час `>= 11`.

- [ ] **Step 1: Написать падающие тесты**

Добавить в `frontend/lib/notifications.spec.ts` (в конец файла; если нет импорта — добавить `isWeeklyReviewWindow` в строку импорта из `./notifications`):

```ts
import { isWeeklyReviewWindow } from './notifications';

describe('isWeeklyReviewWindow', () => {
  // Даты — локальные: new Date(year, monthIndex, day, hour, min). 2026-07-26 — воскресенье.
  it('is false on Sunday before 11:00', () => {
    expect(isWeeklyReviewWindow(new Date(2026, 6, 26, 10, 59))).toBe(false);
  });
  it('is true on Sunday at 11:00', () => {
    expect(isWeeklyReviewWindow(new Date(2026, 6, 26, 11, 0))).toBe(true);
  });
  it('is true on Sunday in the evening', () => {
    expect(isWeeklyReviewWindow(new Date(2026, 6, 26, 18, 0))).toBe(true);
  });
  it('is false on a weekday', () => {
    // 2026-07-27 — понедельник
    expect(isWeeklyReviewWindow(new Date(2026, 6, 27, 12, 0))).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run (из `frontend/`): `bunx jest notifications.spec.ts`
Expected: FAIL — `isWeeklyReviewWindow is not a function`.

- [ ] **Step 3: Реализовать**

В `frontend/lib/notifications.ts` добавить в конец:

```ts
export function isWeeklyReviewWindow(now: Date): boolean {
  return now.getDay() === 0 && now.getHours() >= 11;
}
```

- [ ] **Step 4: Запустить — проходит**

Run (из `frontend/`): `bunx jest notifications.spec.ts`
Expected: PASS (все тесты файла).

- [ ] **Step 5: Коммит**

```bash
git add frontend/lib/notifications.ts frontend/lib/notifications.spec.ts
git commit -m "feat(frontend): isWeeklyReviewWindow — Sunday 11:00+ local window"
```

---

### Task 2: Уведомление в `Dashboard` + баннер на `GtdScreen`

**Files:**
- Modify: `frontend/components/Dashboard.tsx`
- Modify: `frontend/components/GtdScreen.tsx`, `frontend/components/GtdScreen.module.css`

**Interfaces:**
- Consumes: `isWeeklyReviewWindow` (Task 1), `todayLocal` (уже импортирован в Dashboard).

- [ ] **Step 1: Импорт в `Dashboard.tsx`**

В `frontend/components/Dashboard.tsx` в импорте из `@/lib/notifications` добавить `isWeeklyReviewWindow`. Было:
```ts
import { isEveningWindow, isMorningWindow } from '@/lib/notifications';
```
Стало:
```ts
import { isEveningWindow, isMorningWindow, isWeeklyReviewWindow } from '@/lib/notifications';
```

- [ ] **Step 2: Ветка уведомления в `check()`**

В `frontend/components/Dashboard.tsx`, внутри функции `check` (notification-`useEffect`), добавить после существующих веток (после помидорной, перед закрывающей `}` функции `check`):

```ts
      if (isWeeklyReviewWindow(now)) {
        const key = todayLocal();
        if (localStorage.getItem('weeklyReviewNotified') !== key) {
          new Notification('Воскресенье — время для Weekly Review: разбери Корзину, пройдись по Бэклогу и Проектам');
          localStorage.setItem('weeklyReviewNotified', key);
        }
      }
```

- [ ] **Step 3: Баннер в `GtdScreen.tsx`**

В `frontend/components/GtdScreen.tsx`, в `return (...)`, сразу после открывающего `<div className={styles.screen}>` (перед `<nav className={styles.buckets}>`) добавить:

```tsx
      {new Date().getDay() === 0 && (
        <div className={styles.reviewBanner}>🗓 Воскресный разбор — время для Weekly Review</div>
      )}
```

- [ ] **Step 4: Стиль баннера**

В `frontend/components/GtdScreen.module.css` добавить:

```css
.reviewBanner {
  background: var(--accent-soft);
  border: 1px solid var(--accent);
  color: var(--accent);
  border-radius: var(--radius);
  padding: 8px 12px;
  font-size: 12.5px;
}
```

- [ ] **Step 5: Сборка + тесты**

Run (из `frontend/`): `bun run build` → чисто; `bunx jest` → всё зелёное.

- [ ] **Step 6: Коммит**

```bash
git add frontend/components/Dashboard.tsx frontend/components/GtdScreen.tsx frontend/components/GtdScreen.module.css
git commit -m "feat(frontend): Sunday Weekly Review reminder + GTD banner"
```

---

## Self-Review

**Spec coverage:**
- `isWeeklyReviewWindow` (воскресенье, 11:00+, локально) + тесты → Task 1. ✅
- Уведомление один раз за воскресенье через `localStorage`, в существующем `check()` → Task 2 Steps 1–2. ✅
- Баннер на GTD-экране по воскресеньям + стиль из токенов → Task 2 Steps 3–4. ✅
- Вне объёма (C.2 приоритет/дедлайн, C.3 Obsidian, чек-лист ревью, UI-настройка времени, бэкенд/крон) — не трогается. ✅

**Placeholder scan:** конкретный код/команды в каждом шаге; дата воскресенья (`2026-07-26`) в тестах — реальная.

**Type consistency:** `isWeeklyReviewWindow(now: Date): boolean` объявлена в Task 1 и вызывается в Task 2 из `Dashboard`. `todayLocal()` (строка `YYYY-MM-DD`) используется как ключ `localStorage`. Баннер использует `new Date().getDay() === 0` (локальный день) — согласуется с логикой окна.
