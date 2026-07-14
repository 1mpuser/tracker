import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { addDays, formatDate, parseDateParam, todayDate } from '../common/date.util';

export interface DayCategoryView {
  key: string;
  label: string;
  done: boolean;
}

export interface DayView {
  date: string;
  youtubeMinutes: number;
  eveningClosed: boolean;
  categories: DayCategoryView[];
  dailies: { id: number; text: string; done: boolean; order: number }[];
}

export interface HistoryEntry {
  date: string;
  completed: number;
  total: number;
  ytOver: boolean;
}

@Injectable()
export class DaysService {
  constructor(
    private prisma: PrismaService,
    private categoriesService: CategoriesService,
  ) {}

  async getOrCreateDayId(dateStr: string): Promise<number> {
    const date = parseDateParam(dateStr);
    const existing = await this.prisma.day.findUnique({ where: { date } });
    if (existing) return existing.id;
    const created = await this.prisma.day.create({ data: { date } });
    return created.id;
  }

  async getDay(dateStr: string): Promise<DayView> {
    const date = parseDateParam(dateStr);
    let day = await this.prisma.day.findUnique({
      where: { date },
      include: { categories: true, dailies: { orderBy: { order: 'asc' } } },
    });
    if (!day) {
      day = await this.prisma.day.create({
        data: { date },
        include: { categories: true, dailies: { orderBy: { order: 'asc' } } },
      });
    }

    const activeCategories = await this.categoriesService.findActive();
    const statusByCategoryId = new Map(day.categories.map((s) => [s.categoryId, s]));

    return {
      date: formatDate(day.date),
      youtubeMinutes: day.youtubeMinutes,
      eveningClosed: day.eveningClosed,
      categories: activeCategories.map((c) => ({
        key: c.key,
        label: c.label,
        done: statusByCategoryId.get(c.id)?.done ?? false,
      })),
      dailies: day.dailies.map((t) => ({ id: t.id, text: t.text, done: t.done, order: t.order })),
    };
  }

  async setCategoryStatus(dateStr: string, key: string, done: boolean): Promise<DayView> {
    const dayId = await this.getOrCreateDayId(dateStr);
    const category = await this.prisma.category.findUnique({ where: { key } });
    if (!category) {
      throw new NotFoundException(`Category "${key}" not found`);
    }
    await this.prisma.dayCategoryStatus.upsert({
      where: { dayId_categoryId: { dayId, categoryId: category.id } },
      update: { done },
      create: { dayId, categoryId: category.id, done },
    });
    return this.getDay(dateStr);
  }

  async updateYoutube(dateStr: string, delta?: number, reset?: boolean): Promise<DayView> {
    const dayId = await this.getOrCreateDayId(dateStr);
    const day = await this.prisma.day.findUniqueOrThrow({ where: { id: dayId } });
    const nextMinutes = reset ? 0 : Math.max(0, day.youtubeMinutes + (delta ?? 0));
    await this.prisma.day.update({ where: { id: dayId }, data: { youtubeMinutes: nextMinutes } });
    return this.getDay(dateStr);
  }

  async setEveningClosed(dateStr: string, eveningClosed: boolean): Promise<DayView> {
    const dayId = await this.getOrCreateDayId(dateStr);
    await this.prisma.day.update({ where: { id: dayId }, data: { eveningClosed } });
    return this.getDay(dateStr);
  }

  async getHistory(limit: number): Promise<HistoryEntry[]> {
    const end = todayDate();
    const start = addDays(end, -(limit - 1));

    const [days, categories, settings] = await Promise.all([
      this.prisma.day.findMany({
        where: { date: { gte: start, lte: end } },
        include: { categories: true },
      }),
      this.prisma.category.findMany(),
      this.prisma.settings.findUnique({ where: { id: 1 } }),
    ]);

    const budget = settings?.youtubeBudget ?? 60;
    const dayByDate = new Map(days.map((d) => [formatDate(d.date), d]));

    const result: HistoryEntry[] = [];
    for (let i = 0; i < limit; i++) {
      const date = formatDate(addDays(start, i));
      const day = dayByDate.get(date);
      const statusByCategoryId = new Map((day?.categories ?? []).map((s) => [s.categoryId, s]));
      const activeSet = categories.filter((c) => !c.archived || statusByCategoryId.has(c.id));
      const completed = activeSet.filter((c) => statusByCategoryId.get(c.id)?.done).length;
      const youtubeMinutes = day?.youtubeMinutes ?? 0;
      result.push({
        date,
        completed,
        total: activeSet.length,
        ytOver: youtubeMinutes > budget,
      });
    }
    return result;
  }
}
