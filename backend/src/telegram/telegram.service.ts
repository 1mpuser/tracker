import { Injectable, Logger } from '@nestjs/common';
import { buildDaySummary, DaySummaryInput } from './telegram.helpers';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  async postDaySummary(day: DaySummaryInput): Promise<number | null> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return null;

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: buildDaySummary(day),
          parse_mode: 'HTML',
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        this.logger.warn(`Telegram sendMessage failed: ${response.status} ${await response.text()}`);
        return null;
      }

      const body = (await response.json()) as { ok: boolean; description?: string; result?: { message_id: number } };
      if (!body.ok || !body.result) {
        this.logger.warn(`Telegram sendMessage rejected: ${body.description ?? 'unknown error'}`);
        return null;
      }

      return body.result.message_id;
    } catch (e) {
      // fetch() иногда включает саму запрошенную строку URL в текст ошибки
      // (например TypeError при "плохом" URL) — вырезаем токен, чтобы он не
      // осел в логах, если TELEGRAM_BOT_TOKEN вставлен с лишним пробелом/переносом.
      const message = String(e).split(token).join('<redacted>');
      this.logger.warn(`Telegram sendMessage(${day.date}) failed: ${message}`);
      return null;
    }
  }
}
