'use client';

import { useCallback, useRef, useState } from 'react';
import type { WeekStats } from '@/types/api';
import { getWeekStats, postWeeklySummary } from '@/lib/api';
import { formatWeekRangeShort, isSunday, toChartSeries } from '@/lib/weekly';
import { svgToPngBase64 } from '@/lib/chart-export';
import WeeklyChart, { WEEKLY_CHART_HEIGHT, WEEKLY_CHART_WIDTH } from '@/components/WeeklyChart';

export function useWeeklySummary() {
  const [stats, setStats] = useState<WeekStats | null>(null);
  const holderRef = useRef<HTMLDivElement | null>(null);

  const sendIfSunday = useCallback(async (date: string) => {
    if (!isSunday(date)) return;

    try {
      const weekStats = await getWeekStats(date);
      setStats(weekStats);

      // Ждём кадр, чтобы React успел смонтировать график до снятия PNG.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const svg = holderRef.current?.querySelector('svg');
      const chartPng = svg
        ? await svgToPngBase64(svg as SVGSVGElement, WEEKLY_CHART_WIDTH, WEEKLY_CHART_HEIGHT)
        : null;

      // Картинка необязательна: не сняли — уходит текстовый пост, недельный
      // итог важнее графика.
      await postWeeklySummary(date, chartPng);
    } catch {
      // Сводка — побочный эффект закрытия дня. Упала отправка или рендер —
      // день всё равно закрыт, интерфейсу об этом сообщать нечего.
    } finally {
      setStats(null);
    }
  }, []);

  const chartNode = stats ? (
    <div style={{ position: 'absolute', left: -10000, top: 0 }} aria-hidden>
      <WeeklyChart
        ref={holderRef}
        data={toChartSeries(stats)}
        title={`Помидорки · ${formatWeekRangeShort(stats.weekStart, stats.weekEnd)}`}
      />
    </div>
  ) : null;

  return { sendIfSunday, chartNode };
}
