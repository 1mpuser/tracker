import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, formatDate, parseDateParam, todayDate } from '../common/date.util';

// Индексация как у Date#getUTCDay(): 0 — воскресенье.
const WEEKDAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

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

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  async categoryStats(days: number) {
    const end = todayDate();
    const start = addDays(end, -(days - 1));

    const [categories, statuses] = await Promise.all([
      this.prisma.category.findMany({ where: { archived: false }, orderBy: { order: 'asc' } }),
      this.prisma.dayCategoryStatus.findMany({
        where: { day: { date: { gte: start, lte: end } } },
        select: { categoryId: true, done: true },
      }),
    ]);

    const doneCountByCategory = new Map<number, number>();
    for (const s of statuses) {
      if (s.done) {
        doneCountByCategory.set(s.categoryId, (doneCountByCategory.get(s.categoryId) ?? 0) + 1);
      }
    }

    return categories.map((c) => {
      const doneCount = doneCountByCategory.get(c.id) ?? 0;
      return {
        key: c.key,
        label: c.label,
        doneCount,
        totalDays: days,
        pct: Math.round((doneCount / days) * 100),
      };
    });
  }

  async youtubeWeeklyStats(weeks: number) {
    const settings = await this.prisma.settings.findUnique({ where: { id: 1 } });
    const budget = settings?.youtubeBudget ?? 60;

    const todayMonday = this.mondayOf(todayDate());
    const firstMonday = addDays(todayMonday, -(weeks - 1) * 7);

    const days = await this.prisma.day.findMany({
      where: { date: { gte: firstMonday, lte: addDays(todayMonday, 6) } },
      select: { date: true, youtubeMinutes: true },
    });
    const minutesByDate = new Map(days.map((d) => [formatDate(d.date), d.youtubeMinutes]));

    const result = [];
    for (let w = 0; w < weeks; w++) {
      const weekStart = addDays(firstMonday, w * 7);
      let sum = 0;
      for (let i = 0; i < 7; i++) {
        sum += minutesByDate.get(formatDate(addDays(weekStart, i))) ?? 0;
      }
      result.push({
        weekStart: formatDate(weekStart),
        avgMinutes: Math.round((sum / 7) * 10) / 10,
        budget,
      });
    }
    return result;
  }

  async youtubeDailyStats(days: number) {
    const end = todayDate();
    const start = addDays(end, -(days - 1));

    const [settings, dayRows] = await Promise.all([
      this.prisma.settings.findUnique({ where: { id: 1 } }),
      this.prisma.day.findMany({
        where: { date: { gte: start, lte: end } },
        select: { date: true, youtubeMinutes: true },
      }),
    ]);
    const budget = settings?.youtubeBudget ?? 60;
    const minutesByDate = new Map(dayRows.map((d) => [formatDate(d.date), d.youtubeMinutes]));

    const result = [];
    for (let i = 0; i < days; i++) {
      const date = formatDate(addDays(start, i));
      const minutes = minutesByDate.get(date) ?? 0;
      result.push({
        date,
        minutes,
        budget,
        pct: budget > 0 ? Math.round((minutes / budget) * 100) : 0,
      });
    }
    return result;
  }

  async weekStats(endDateStr: string): Promise<WeekStats> {
    const monday = this.mondayOf(parseDateParam(endDateStr));
    const sunday = addDays(monday, 6);

    const [settings, categories, dayRows, statuses] = await Promise.all([
      this.prisma.settings.findUnique({ where: { id: 1 } }),
      this.prisma.category.findMany({ where: { archived: false }, orderBy: { order: 'asc' } }),
      this.prisma.day.findMany({
        where: { date: { gte: monday, lte: sunday } },
        select: { date: true, pomodoros: true, rating: true, eveningClosed: true, youtubeMinutes: true },
      }),
      this.prisma.dayCategoryStatus.findMany({
        where: { day: { date: { gte: monday, lte: sunday } } },
        select: { categoryId: true, done: true },
      }),
    ]);

    const rowByDate = new Map(dayRows.map((d) => [formatDate(d.date), d]));

    // Неделя всегда ровно 7 точек: пропущенный день — это ноль, а не дырка,
    // иначе график на фронте поедет по оси X.
    const days: WeekDayStat[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      const key = formatDate(date);
      const row = rowByDate.get(key);
      days.push({
        date: key,
        weekday: WEEKDAY_SHORT[date.getUTCDay()],
        pomodoros: row?.pomodoros ?? 0,
        rating: row?.rating ?? null,
        closed: row?.eveningClosed ?? false,
      });
    }

    const totalPomodoros = days.reduce((sum, d) => sum + d.pomodoros, 0);
    const rated = days.filter((d) => d.rating != null);

    // Строгое «больше» оставляет за собой самый ранний из равных дней.
    let bestDay: WeekStats['bestDay'] = null;
    for (const d of days) {
      if (d.pomodoros > 0 && (!bestDay || d.pomodoros > bestDay.pomodoros)) {
        bestDay = { date: d.date, weekday: d.weekday, pomodoros: d.pomodoros };
      }
    }

    const doneByCategory = new Map<number, number>();
    for (const s of statuses) {
      if (s.done) doneByCategory.set(s.categoryId, (doneByCategory.get(s.categoryId) ?? 0) + 1);
    }

    const youtubeTotal = dayRows.reduce((sum, d) => sum + d.youtubeMinutes, 0);

    return {
      weekStart: formatDate(monday),
      weekEnd: formatDate(sunday),
      days,
      totalPomodoros,
      // Делим на 7, а не на число закрытых дней: пропущенный день — это ноль
      // продуктивности, а не отсутствие данных.
      avgPomodoros: Math.round((totalPomodoros / 7) * 10) / 10,
      bestDay,
      avgRating:
        rated.length > 0
          ? Math.round((rated.reduce((sum, d) => sum + (d.rating ?? 0), 0) / rated.length) * 10) / 10
          : null,
      ratedDays: rated.length,
      categories: categories.map((c) => ({ label: c.label, doneCount: doneByCategory.get(c.id) ?? 0 })),
      youtubeAvgMinutes: Math.round((youtubeTotal / 7) * 10) / 10,
      youtubeBudget: settings?.youtubeBudget ?? 60,
    };
  }

  private mondayOf(date: Date): Date {
    const day = date.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    return addDays(date, diff);
  }
}
