import { Injectable, Logger } from '@nestjs/common';
import { buildDaySummary, DaySummaryInput } from './telegram.helpers';
import { fitsInCaption } from './weekly.helpers';

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

  // number — id опубликованного поста, null — не настроено или не отправилось.
  // Картинка необязательна: без неё уходит текстовый пост, чтобы недельный
  // итог не потерялся из-за сбоя рендера на фронте.
  async postWeeklySummary(text: string, chartPngBase64?: string | null): Promise<number | null> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return null;

    try {
      if (!chartPngBase64) {
        return await this.sendText(token, chatId, text);
      }

      // Подпись длиннее лимита Telegram молча обрежет, поэтому в этом случае
      // отправляем фото без подписи и текст отдельным сообщением.
      const asCaption = fitsInCaption(text);
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('photo', new Blob([Buffer.from(chartPngBase64, 'base64')], { type: 'image/png' }), 'week.png');
      if (asCaption) {
        form.append('caption', text);
        form.append('parse_mode', 'HTML');
      }

      const photoId = await this.postForm(token, 'sendPhoto', form);
      if (photoId === null) return null;
      if (asCaption) return photoId;

      // Фото уже опубликовано в канале — если добивочный текст не дойдёт,
      // это нельзя превратить в null: вызывающий код трактует null как
      // «ничего не отправлено» и повторит попытку, задвоив фото в канале.
      // Поэтому неудачу текста только логируем и всё равно отдаём photoId.
      try {
        const textId = await this.sendText(token, chatId, text);
        if (textId === null) {
          this.logger.warn('Telegram postWeeklySummary: photo sent, follow-up caption text was rejected');
        }
      } catch (e) {
        this.logger.warn(
          `Telegram postWeeklySummary: photo sent, follow-up caption text failed: ${String(e).split(token).join('<redacted>')}`,
        );
      }
      return photoId;
    } catch (e) {
      this.logger.warn(`Telegram postWeeklySummary failed: ${String(e).split(token).join('<redacted>')}`);
      return null;
    }
  }

  private async sendText(token: string, chatId: string, text: string): Promise<number | null> {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      signal: AbortSignal.timeout(10000),
    });
    return this.readMessageId(response, 'sendMessage');
  }

  private async postForm(token: string, method: string, form: FormData): Promise<number | null> {
    // Картинка может весить сотни килобайт — таймаут щедрее, чем у текста.
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(20000),
    });
    return this.readMessageId(response, method);
  }

  private async readMessageId(response: Response, method: string): Promise<number | null> {
    if (!response.ok) {
      this.logger.warn(`Telegram ${method} failed: ${response.status} ${await response.text()}`);
      return null;
    }
    const body = (await response.json()) as { ok: boolean; description?: string; result?: { message_id: number } };
    if (!body.ok || !body.result) {
      this.logger.warn(`Telegram ${method} rejected: ${body.description ?? 'unknown error'}`);
      return null;
    }
    return body.result.message_id;
  }
}
