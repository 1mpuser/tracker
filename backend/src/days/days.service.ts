import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { GtdService, GtdItemView } from '../gtd/gtd.service';
import { TelegramService } from '../telegram/telegram.service';
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
  youtubeMinutes: number;
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
  ytOver: boolean;
  rating: number | null;
}

export interface UpdateDayData {
  eveningClosed?: boolean;
  rating?: number;
  comment?: string;
}

// Telegram message_id всегда положителен, поэтому 0 безопасен как временная
// заявка «пост в процессе отправки», занимающая слот перед реальным запросом.
const TELEGRAM_CLAIMED = 0;

@Injectable()
export class DaysService {
  constructor(
    private prisma: PrismaService,
    private categoriesService: CategoriesService,
    private gtdService: GtdService,
    private telegram: TelegramService,
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
      youtubeMinutes: day.youtubeMinutes,
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

  async updateYoutube(dateStr: string, delta?: number, reset?: boolean): Promise<DayView> {
    const dayId = await this.getOrCreateDayId(dateStr);
    const day = await this.prisma.day.findUniqueOrThrow({ where: { id: dayId } });
    const nextMinutes = reset ? 0 : Math.max(0, day.youtubeMinutes + (delta ?? 0));
    await this.prisma.day.update({ where: { id: dayId }, data: { youtubeMinutes: nextMinutes } });
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
      // Атомарная заявка на публикацию: строку захватывает ровно один
      // конкурентный запрос (updateMany с условием в where — не read-then-write),
      // остальные получают count 0 и молчат. Ключ идемпотентности — сам
      // telegramMessageId, а не предыдущее значение eveningClosed: так
      // «один пост на дату» переживает переоткрытие дня.
      const claim = await this.prisma.day.updateMany({
        where: { id: dayId, telegramMessageId: null },
        data: { telegramMessageId: TELEGRAM_CLAIMED },
      });
      if (claim.count === 1) {
        const messageId = await this.telegram.postDaySummary(view);
        // Если процесс упадёт между заявкой и этой записью, строка так и
        // останется на сентинеле и эта дата больше никогда не запостится —
        // приемлемо для однопользовательского локального инструмента.
        // Отправка не удалась -> messageId null, сбрасываем обратно на null,
        // чтобы следующее закрытие этого дня попробовало снова.
        await this.prisma.day.update({ where: { id: dayId }, data: { telegramMessageId: messageId } });
      }
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
    const dayId = await this.getOrCreateDayId(dateStr);
    const withChart = Boolean(chartPngBase64);

    // Тот же атомарный захват, что у дневной сводки: строку занимает ровно
    // один конкурентный запрос, остальные получают count 0 и молчат.
    const claim = await this.prisma.day.updateMany({
      where: { id: dayId, weeklyTelegramMessageId: null },
      data: { weeklyTelegramMessageId: TELEGRAM_CLAIMED },
    });
    if (claim.count !== 1) {
      return { posted: false, withChart: false, reason: 'already-posted' };
    }

    const stats = await this.stats.weekStats(dateStr);
    const messageId = await this.telegram.postWeeklySummary(buildWeekSummary(stats), chartPngBase64 ?? null);

    // Не отправилось -> сбрасываем захват обратно в null, чтобы следующее
    // закрытие этого воскресенья попробовало снова.
    await this.prisma.day.update({ where: { id: dayId }, data: { weeklyTelegramMessageId: messageId } });

    return messageId === null
      ? { posted: false, withChart, reason: 'send-failed' }
      : { posted: true, withChart };
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
        pomodoros: day?.pomodoros ?? 0,
        ytOver: youtubeMinutes > budget,
        rating: day?.rating ?? null,
      });
    }
    return result;
  }
}
