import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramConfigService } from './telegram-config.service';
import { TelegramService, TelegramSendResult } from './telegram.service';
import type { DaySummaryInput } from './telegram.helpers';
import { isUniqueViolation } from '../common/prisma-errors';

export interface DeliveryReport {
  sent: number;
  failed: number;
  skipped: number; // уже было отправлено в этот чат
}

@Injectable()
export class TelegramDeliveryService {
  private readonly logger = new Logger(TelegramDeliveryService.name);

  constructor(
    private prisma: PrismaService,
    private config: TelegramConfigService,
    private telegram: TelegramService,
  ) {}

  async isConfigured(kind: 'day' | 'week'): Promise<boolean> {
    const [token, recipients] = await Promise.all([this.config.resolveToken(), this.config.recipients(kind)]);
    return Boolean(token) && recipients.length > 0;
  }

  deliverDay(dayId: number, summary: DaySummaryInput): Promise<DeliveryReport> {
    return this.deliver(dayId, 'day', (token, chatId) => this.telegram.sendDaySummary(token, chatId, summary));
  }

  deliverWeek(dayId: number, text: string, chartPngBase64: string | null): Promise<DeliveryReport> {
    return this.deliver(dayId, 'week', (token, chatId) =>
      this.telegram.sendWeeklySummary(token, chatId, text, chartPngBase64),
    );
  }

  private async deliver(
    dayId: number,
    kind: 'day' | 'week',
    send: (token: string, chatId: string) => Promise<TelegramSendResult>,
  ): Promise<DeliveryReport> {
    const report: DeliveryReport = { sent: 0, failed: 0, skipped: 0 };
    const token = await this.config.resolveToken();
    if (!token) return report;
    const recipients = await this.config.recipients(kind);

    // Дни, разосланные старым одноканальным кодом, помечены прямо в Day.
    // Кому именно они ушли, неизвестно — считаем, что всем, иначе
    // переоткрытие старого дня разослало бы его заново.
    const day = await this.prisma.day.findUnique({ where: { id: dayId } });
    const legacyId = kind === 'day' ? day?.telegramMessageId : day?.weeklyTelegramMessageId;
    if (legacyId != null) return { ...report, skipped: recipients.length };

    // Последовательно, а не Promise.all: чатов единицы, а так проще читать
    // логи и не упереться в лимиты Telegram на частоту сообщений.
    for (const chatId of recipients) {
      let slot: { id: number };
      try {
        // Уникальный индекс (dayId, chatId, kind) — атомарный захват: из
        // конкурентных закрытий дня строку создаст ровно один запрос.
        slot = await this.prisma.telegramPost.create({ data: { dayId, chatId, kind, messageId: 0 } });
      } catch (e) {
        if (isUniqueViolation(e)) {
          report.skipped++;
          continue;
        }
        throw e;
      }

      let result: TelegramSendResult;
      try {
        result = await send(token, chatId);
      } catch (e) {
        result = { ok: false, error: String(e).split(token).join('<redacted>') };
      }

      if (result.ok) {
        await this.prisma.telegramPost.update({ where: { id: slot.id }, data: { messageId: result.messageId } });
        report.sent++;
      } else {
        // Освобождаем слот: следующее закрытие дня попробует этот чат снова.
        await this.prisma.telegramPost.delete({ where: { id: slot.id } });
        this.logger.warn(`Telegram ${kind} → ${chatId} failed: ${result.error}`);
        report.failed++;
      }
    }
    return report;
  }
}
