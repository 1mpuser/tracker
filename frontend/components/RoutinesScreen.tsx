'use client';

import { useEffect, useState } from 'react';
import type { Category, RoutineHistoryWeek, RoutinesWeek } from '@/types/api';
import { archiveRoutine, createRoutine, getCategories, getRoutines, getRoutinesHistory, removeRoutineLog, setRoutineLog, updateRoutine } from '@/lib/api';
import { dayCount, isDayFull, nextCount, routineRatioColor, weekDays } from '@/lib/routines';
import { todayLocal } from '@/lib/date';
import styles from './RoutinesScreen.module.css';

const DAY_LABELS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

export default function RoutinesScreen() {
  const [week, setWeek] = useState<RoutinesWeek | null>(null);
  const [history, setHistory] = useState<RoutineHistoryWeek[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGoal, setNewGoal] = useState(3);
  const [newCategoryId, setNewCategoryId] = useState<number | null>(null);
  // Одно сообщение об ошибке на весь экран: отметка — единственная ценность
  // этой вкладки, и потерянный запрос не должен выглядеть как «ничего не
  // произошло».
  const [error, setError] = useState<string | null>(null);
  const today = todayLocal();

  useEffect(() => {
    // Якорь — локальное «сегодня»: без него бэкенд якорит неделю на свою
    // UTC-дату, и ночью (когда в UTC ещё вчерашняя неделя) экран рисовал бы
    // прошлую неделю, в которой сегодняшнего дня просто нет.
    const anchor = todayLocal();
    // Неделя — единственный блокирующий запрос: без неё экран нечего рисовать.
    getRoutines(anchor)
      .then(setWeek)
      .catch(() => setError('Не удалось загрузить рутины'));
    // История и список сфер второстепенны. Общий Promise.all с ними отбирал
    // отметку дня из-за отказа любого из них, поэтому они грузятся отдельно и
    // лишь дописывают сообщение в то же поле ошибки (`prev ?? …`), не затирая
    // блокирующее: экран рисуется и днями можно отмечаться.
    getRoutinesHistory(8, anchor)
      .then(setHistory)
      .catch(() => setError((prev) => prev ?? 'Не удалось загрузить историю недель'));
    getCategories()
      .then(setCategories)
      .catch(() => setError((prev) => prev ?? 'Не удалось загрузить список сфер'));
  }, []);

  async function setDay(routineId: number, date: string, count: number) {
    if (busy !== null) return;
    setBusy(routineId);
    setError(null);
    try {
      try {
        // Ноль отправляем отдельным эндпоинтом снятия: он же чистит строку дня.
        setWeek(count === 0 ? await removeRoutineLog(routineId, date) : await setRoutineLog(routineId, date, count));
      } catch {
        setError(count === 0 ? 'Не удалось снять отметку' : 'Не удалось отметить день');
        return;
      }
      // Отдельный catch: отсюда отметка уже записана и неделя перерисована.
      try {
        setHistory(await getRoutinesHistory(8, today));
      } catch {
        setError(count === 0 ? 'Отметка снята, но история недель не обновилась' : 'День отмечен, но история недель не обновилась');
      }
    } finally {
      setBusy(null);
    }
  }

  async function reload() {
    setWeek(await getRoutines(today));
    setHistory(await getRoutinesHistory(8, today));
  }

  async function add() {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setError(null);
    const goal = Math.min(7, Math.max(1, Math.round(newGoal) || 1));
    try {
      await createRoutine(trimmed, goal, newCategoryId);
      setNewTitle('');
      setNewGoal(3);
      setNewCategoryId(null);
      await reload();
    } catch {
      setError('Не удалось добавить рутину');
    }
  }

  async function patch(id: number, p: { title?: string; weeklyGoal?: number; categoryId?: number | null }) {
    setError(null);
    try {
      await updateRoutine(id, p);
      await reload();
    } catch {
      setError('Не удалось сохранить изменение');
    }
  }

  async function archive(id: number, title: string) {
    // Кнопка стоит вплотную к полю названия, а пути назад из архива в
    // интерфейсе нет — промах мышью не должен уносить рутину молча.
    if (!window.confirm(`Убрать «${title}» в архив? Вернуть её через интерфейс будет нельзя.`)) return;
    setError(null);
    try {
      await archiveRoutine(id);
      await reload();
    } catch {
      setError('Не удалось убрать рутину в архив');
    }
  }

  if (!week) return <div className={styles.empty}>{error ?? 'загрузка…'}</div>;

  const days = weekDays(week.weekStart);

  return (
    <div className={styles.screen}>
      {week.routines.length === 0 && (
        <div className={styles.empty}>Рутин пока нет — заведи первую ниже.</div>
      )}

      {week.routines.map((r) => {
        const todayCount = dayCount(r, today);
        const todayFull = isDayFull(r, today);
        return (
          <div key={r.id} className={styles.row}>
            <div className={styles.title}>{r.title}</div>

            <div className={styles.dots}>
              {days.map((d, i) => {
                const count = dayCount(r, d);
                const future = d > today;
                // Доля дня: при норме 1 точка либо пуста, либо залита целиком —
                // ровно как было до появления дневной нормы.
                const ratio = Math.min(1, count / r.timesPerDay);
                return (
                  <button
                    key={d}
                    type="button"
                    className={styles.dot}
                    style={{
                      background:
                        ratio === 0
                          ? undefined
                          : `linear-gradient(to top, var(--accent) ${ratio * 100}%, var(--panel-alt) ${ratio * 100}%)`,
                      borderColor: ratio >= 1 ? 'var(--accent)' : undefined,
                    }}
                    disabled={future || busy !== null}
                    title={`${DAY_LABELS[i]} ${d}: ${count} из ${r.timesPerDay}`}
                    aria-label={`${r.title}, ${DAY_LABELS[i]}, ${count} из ${r.timesPerDay}`}
                    onClick={() => setDay(r.id, d, nextCount(count, r.timesPerDay))}
                  />
                );
              })}
            </div>

            <div className={`${styles.count} ${r.done >= r.daysPerWeek ? styles.countDone : ''}`}>
              {r.done}/{r.daysPerWeek}
            </div>

            <button
              type="button"
              className={styles.markBtn}
              disabled={busy !== null}
              onClick={() => setDay(r.id, today, nextCount(todayCount, r.timesPerDay))}
            >
              {todayFull
                ? '✓ сегодня закрыт'
                : r.timesPerDay > 1
                  ? `+ отметить (${todayCount} из ${r.timesPerDay})`
                  : '+ отметить сегодня'}
            </button>
          </div>
        );
      })}

      {history.length > 0 && week.routines.length > 0 && (
        <div className={styles.history}>
          <div className={styles.historyTitle}>Последние {history.length} недель</div>
          {week.routines.map((r) => (
            <div key={r.id} className={styles.historyRow}>
              <div className={styles.historyName}>{r.title}</div>
              <div className={styles.dots}>
                {history.map((w) => {
                  const item = w.items.find((i) => i.routineId === r.id);
                  const done = item?.done ?? 0;
                  const goal = item?.daysPerWeek ?? r.daysPerWeek;
                  return (
                    <span
                      key={w.weekStart}
                      className={styles.weekCell}
                      style={{ background: routineRatioColor(done, goal) }}
                      title={`неделя с ${w.weekStart}: ${done}/${goal}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <button type="button" className={styles.settingsToggle} onClick={() => setSettingsOpen(!settingsOpen)}>
        {settingsOpen ? 'Свернуть настройку' : 'Настроить рутины'}
      </button>

      {settingsOpen && (
        <div className={styles.settings}>
          {week.routines.map((r) => (
            <div key={r.id} className={styles.settingsRow}>
              <input
                className={styles.settingsInput}
                defaultValue={r.title}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== r.title) patch(r.id, { title: v });
                }}
              />
              <label className={styles.settingsLabel}>
                норма
                <input
                  type="number"
                  min={1}
                  max={7}
                  className={styles.settingsNumber}
                  defaultValue={r.weeklyGoal}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v >= 1 && v <= 7 && v !== r.weeklyGoal) patch(r.id, { weeklyGoal: v });
                  }}
                />
              </label>
              <select
                className={styles.settingsSelect}
                value={r.categoryId ?? ''}
                onChange={(e) => patch(r.id, { categoryId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">без сферы</option>
                {/* Сферу могли убрать в архив: getCategories отдаёт только
                    активные, а categoryId рутины при архивации не обнуляется —
                    и отметка продолжает ставить галочку этой сферы. Без своего
                    варианта селект показал бы «без сферы», а первое же
                    прикосновение к нему молча стёрло бы живую привязку. */}
                {r.categoryId !== null && !categories.some((c) => c.id === r.categoryId) && (
                  <option value={r.categoryId}>сфера в архиве</option>
                )}
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <button type="button" className={styles.archiveBtn} onClick={() => archive(r.id, r.title)}>
                в архив
              </button>
            </div>
          ))}

          <div className={styles.settingsRow}>
            <input
              className={styles.settingsInput}
              placeholder="Новая рутина…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add();
              }}
            />
            <label className={styles.settingsLabel}>
              норма
              <input
                type="number"
                min={1}
                max={7}
                className={styles.settingsNumber}
                value={newGoal}
                onChange={(e) => setNewGoal(Number(e.target.value))}
              />
            </label>
            <select
              className={styles.settingsSelect}
              value={newCategoryId ?? ''}
              onChange={(e) => setNewCategoryId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">без сферы</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <button type="button" className={styles.markBtn} onClick={add}>
              добавить
            </button>
          </div>
        </div>
      )}

      {/* Внизу экрана: так сообщение видно и после клика по точке, и после
          неудачного добавления — форма добавления стоит прямо над ним. */}
      {error && <div className={styles.empty}>{error}</div>}
    </div>
  );
}
