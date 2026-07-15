import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, formatDate, todayDate } from '../common/date.util';

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

  private mondayOf(date: Date): Date {
    const day = date.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    return addDays(date, diff);
  }
}
