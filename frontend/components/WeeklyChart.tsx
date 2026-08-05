'use client';

import { forwardRef } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, XAxis, YAxis } from 'recharts';
import type { ChartPoint } from '@/lib/weekly';
import { POMODORO_MIN } from '@/lib/pomodoro';

export const WEEKLY_CHART_WIDTH = 800;
export const WEEKLY_CHART_HEIGHT = 400;

// Литеральные hex вместо var(--…): при сериализации SVG в отрыве от документа
// CSS-переменные не разрешаются, и график уехал бы чёрно-белым.
const BG = '#1a1d24';
// Цвет столбика значит «день в зачёте», а не «сколько помидорок»: яркий —
// набрал минимум, приглушённый — нет. Так сводка подсвечивает засчитанное,
// а не орёт красным на каждый провал.
const BAR_QUALIFIED = '#ff6f5c';
const BAR_MISSED = '#2f343d';
const TEXT = '#888d98';
const GRID = '#2a2e37';

interface WeeklyChartProps {
  data: ChartPoint[];
  title: string;
}

// forwardRef, чтобы владелец мог достать смонтированный SVG и снять с него PNG.
const WeeklyChart = forwardRef<HTMLDivElement, WeeklyChartProps>(function WeeklyChart({ data, title }, ref) {
  return (
    // background здесь только для превью на экране (если этот div вдруг
    // окажется видимым) — на экспортированную картинку он не влияет: PNG
    // непрозрачным делает заливка холста в chart-export.ts, а не этот div.
    // Не убирать эту заливку холста как "дублирующую" — SVG сам по себе
    // прозрачен, и без неё фон картинки в Telegram превратится в дыру.
    <div ref={ref} style={{ width: WEEKLY_CHART_WIDTH, height: WEEKLY_CHART_HEIGHT, background: BG }}>
      <BarChart
        width={WEEKLY_CHART_WIDTH}
        height={WEEKLY_CHART_HEIGHT}
        data={data}
        margin={{ top: 48, right: 90, left: 8, bottom: 16 }}
      >
        <text x={32} y={32} fill={TEXT} fontSize={18} fontFamily="sans-serif">
          {title}
        </text>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="weekday"
          tick={{ fill: TEXT, fontSize: 14, fontFamily: 'sans-serif' }}
          axisLine={{ stroke: GRID }}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: TEXT, fontSize: 14, fontFamily: 'sans-serif' }}
          axisLine={false}
          tickLine={false}
        />
        <ReferenceLine
          y={POMODORO_MIN}
          stroke={TEXT}
          strokeDasharray="4 4"
          label={{
            value: `минимум ${POMODORO_MIN}`,
            position: 'right',
            fill: TEXT,
            fontSize: 12,
            fontFamily: 'sans-serif',
          }}
        />
        {/* Анимацию обязательно выключить: снимок поймал бы промежуточный кадр
            и в канал уехал бы график с недорисованными столбиками. */}
        <Bar dataKey="pomodoros" isAnimationActive={false} radius={[4, 4, 0, 0]}>
          <LabelList dataKey="pomodoros" position="top" fill={TEXT} fontSize={13} fontFamily="sans-serif" />
          {data.map((point) => (
            <Cell key={point.weekday} fill={point.qualified ? BAR_QUALIFIED : BAR_MISSED} />
          ))}
        </Bar>
      </BarChart>
    </div>
  );
});

export default WeeklyChart;
