import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { GtdService, GtdItemView } from '../gtd/gtd.service';
import { TelegramDeliveryService } from '../telegram/telegram-delivery.service';
import { StatsService } from '../stats/stats.service';
import { buildWeekSummary } from '../telegram/weekly.helpers';
import { addDays, formatDate, parseDateParam, todayDate } from '../common/date.util';

export interface DayCategoryView {
  key: string;
  label: string;
  done: boolean;
}

export interface DayView {
  date: string;
  distractionMinutes: number;
  pomodoros: number;
  eveningClosed: boolean;
  rating: number | null;
  comment: string | null;
  categories: DayCategoryView[];
  today: GtdItemView[];
}

export interface HistoryEntry {
  date: string;
  completed: number;
  total: number;
  pomodoros: number;
  distractionOver: boolean;
  rating: number | null;
}

export interface UpdateDayData {
  eveningClosed?: boolean;
  rating?: number;
  comment?: string;
}

@Injectable()
export class DaysService {
  constructor(
    private prisma: PrismaService,
    private categoriesService: CategoriesService,
    private gtdService: GtdService,
    private delivery: TelegramDeliveryService,
    private stats: StatsService,
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
      include: { categories: true },
    });
    if (!day) {
      day = await this.prisma.day.create({
        data: { date },
        include: { categories: true },
      });
    }

    const activeCategories = await this.categoriesService.findActive();
    const statusByCategoryId = new Map(day.categories.map((s) => [s.categoryId, s]));
    const today = await this.gtdService.getForDate(formatDate(day.date));

    return {
      date: formatDate(day.date),
      distractionMinutes: day.distractionMinutes,
      pomodoros: day.pomodoros,
      eveningClosed: day.eveningClosed,
      rating: day.rating,
      comment: day.comment,
      categories: activeCategories.map((c) => ({
        key: c.key,
        label: c.label,
        done: statusByCategoryId.get(c.id)?.done ?? false,
      })),
      today,
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

  async updateDistraction(dateStr: string, delta?: number, reset?: boolean): Promise<DayView> {
    const dayId = await this.getOrCreateDayId(dateStr);
    const day = await this.prisma.day.findUniqueOrThrow({ where: { id: dayId } });
    const nextMinutes = reset ? 0 : Math.max(0, day.distractionMinutes + (delta ?? 0));
    await this.prisma.day.update({ where: { id: dayId }, data: { distractionMinutes: nextMinutes } });
    return this.getDay(dateStr);
  }

  async updatePomodoros(dateStr: string, delta?: number, reset?: boolean): Promise<DayView> {
    const dayId = await this.getOrCreateDayId(dateStr);
    const day = await this.prisma.day.findUniqueOrThrow({ where: { id: dayId } });
    const nextCount = reset ? 0 : Math.max(0, day.pomodoros + (delta ?? 0));
    await this.prisma.day.update({ where: { id: dayId }, data: { pomodoros: nextCount } });
    return this.getDay(dateStr);
  }

  // Абсолютная запись — в отличие от updatePomodoros с его delta/reset.
  // Нужна синхронизации с календарём, где источник правды — число событий.
  async setPomodoros(dateStr: string, count: number): Promise<DayView> {
    const dayId = await this.getOrCreateDayId(dateStr);
    await this.prisma.day.update({ where: { id: dayId }, data: { pomodoros: Math.max(0, count) } });
    return this.getDay(dateStr);
  }

  async updateDay(dateStr: string, data: UpdateDayData): Promise<DayView> {
    const dayId = await this.getOrCreateDayId(dateStr);
    await this.prisma.day.update({ where: { id: dayId }, data });
    const view = await this.getDay(dateStr);

    if (data.eveningClosed === true) {
      // Идемпотентность «один пост на день на чат» обеспечивает
      // TelegramDeliveryService через таблицу TelegramPost. Отчёт игнорируем:
      // закрытие дня не должно падать из-за Telegram.
      await this.delivery.deliverDay(dayId, view);
    }

    return view;
  }

  // Публикует недельную сводку за неделю, заканчивающуюся этой (воскресной)
  // датой. Картинку рисует фронт и присылает готовым PNG — в контейнере
  // рисовать нечем; текст собираем здесь из базы, чтобы пост не разошёлся
  // с реальными числами, даже если клиент прислал что-то своё.
  async postWeeklySummary(
    dateStr: string,
    chartPngBase64?: string | null,
  ): Promise<{ posted: boolean; withChart: boolean; reason?: 'already-posted' | 'send-failed' }> {
    // Не создаём строку через getOrCreateDayId: эндпоинт самосогласован и
    // публикует сводку только для уже закрытого дня, иначе прямой вызов на
    // будущее воскресенье завёл бы пустую строку и навсегда занял неделю
    // сводкой из одних нулей.
    const date = parseDateParam(dateStr);
    const day = await this.prisma.day.findUnique({ where: { date } });
    if (!day || day.eveningClosed !== true) {
      throw new BadRequestException('Недельная сводка публикуется только для закрытого дня');
    }
    const dayId = day.id;
    const withChart = Boolean(chartPngBase64);

    const stats = await this.stats.weekStats(dateStr);
    const text = buildWeekSummary(stats);

    // Идемпотентность «один пост на неделю на чат» обеспечивает
    // TelegramDeliveryService через таблицу TelegramPost.
    const report = await this.delivery.deliverWeek(day.id, text, chartPngBase64 ?? null);

    if (report.sent > 0) return { posted: true, withChart };
    if (report.failed > 0) return { posted: false, withChart, reason: 'send-failed' };
    return { posted: false, withChart: false, reason: 'already-posted' };
  }

  async getHistory(limit: number, endDateStr?: string): Promise<HistoryEntry[]> {
    const end = endDateStr ? parseDateParam(endDateStr) : todayDate();
    const start = addDays(end, -(limit - 1));

    const [days, categories, settings] = await Promise.all([
      this.prisma.day.findMany({
        where: { date: { gte: start, lte: end } },
        include: { categories: true },
      }),
      this.prisma.category.findMany(),
      this.prisma.settings.findUnique({ where: { id: 1 } }),
    ]);

    const budget = settings?.distractionBudget ?? 60;
    const dayByDate = new Map(days.map((d) => [formatDate(d.date), d]));

    const result: HistoryEntry[] = [];
    for (let i = 0; i < limit; i++) {
      const date = formatDate(addDays(start, i));
      const day = dayByDate.get(date);
      const statusByCategoryId = new Map((day?.categories ?? []).map((s) => [s.categoryId, s]));
      const activeSet = categories.filter((c) => !c.archived || statusByCategoryId.has(c.id));
      const completed = activeSet.filter((c) => statusByCategoryId.get(c.id)?.done).length;
      const distractionMinutes = day?.distractionMinutes ?? 0;
      result.push({
        date,
        completed,
        total: activeSet.length,
        pomodoros: day?.pomodoros ?? 0,
        distractionOver: distractionMinutes > budget,
        rating: day?.rating ?? null,
      });
    }
    return result;
  }
}
