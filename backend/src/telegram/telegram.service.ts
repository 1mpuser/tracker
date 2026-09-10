import { Injectable, Logger } from '@nestjs/common';
import { buildDaySummary, DaySummaryInput } from './telegram.helpers';
import { fitsInCaption } from './weekly.helpers';

export type TelegramSendResult = { ok: true; messageId: number } | { ok: false; error: string };
export interface TelegramChatInfo { chatId: string; title: string; type: string }

function redact(message: string, token: string): string {
  return token ? message.split(token).join('<redacted>') : message;
}

// Тупой HTTP-клиент Telegram: ничего не знает про env, настройки и «кому и когда
// слать». Токен и чат передаются явно в каждом вызове. Кто зовёт — решает
// TelegramConfigService. Методы никогда не бросают: все ошибки превращаются в
// { ok: false, error } с вырезанным токеном.
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  async getMe(token: string): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        return { ok: false, error: `getMe: ${response.status} ${await response.text()}` };
      }
      const body = (await response.json()) as {
        ok: boolean;
        description?: string;
        result?: { username: string };
      };
      if (!body.ok || !body.result) {
        return { ok: false, error: `getMe rejected: ${body.description ?? 'unknown error'}` };
      }
      return { ok: true, username: body.result.username };
    } catch (e) {
      const message = redact(String(e), token);
      this.logger.warn(`Telegram getMe failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  // Чаты, которые бот видел в апдейтах последних ~24 часов. Уникальные по
  // chatId; при ошибке — пустой список, чтобы discover не упал из-за сети.
  async getUpdatesChats(token: string): Promise<TelegramChatInfo[]> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return [];
      const body = (await response.json()) as {
        ok: boolean;
        result?: Array<{
          message?: { chat: unknown };
          channel_post?: { chat: unknown };
          my_chat_member?: { chat: unknown };
        }>;
      };
      if (!body.ok || !body.result) return [];

      const seen = new Map<string, TelegramChatInfo>();
      for (const update of body.result) {
        const raw = (update.message ?? update.channel_post ?? update.my_chat_member)?.chat as
          | {
              id: number | string;
              type: string;
              title?: string;
              first_name?: string;
              last_name?: string;
              username?: string;
            }
          | undefined;
        if (!raw) continue;
        const chatId = String(raw.id);
        if (seen.has(chatId)) continue;
        const title = (raw.title ?? [raw.first_name, raw.last_name].filter(Boolean).join(' ')) || (raw.username ? `@${raw.username}` : chatId);
        seen.set(chatId, { chatId, title, type: raw.type });
      }
      return [...seen.values()];
    } catch (e) {
      this.logger.warn(`Telegram getUpdatesChats failed: ${redact(String(e), token)}`);
      return [];
    }
  }

  async sendText(token: string, chatId: string, text: string): Promise<TelegramSendResult> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
        signal: AbortSignal.timeout(10000),
      });
      return this.readResult(response, 'sendMessage', token);
    } catch (e) {
      const message = redact(String(e), token);
      this.logger.warn(`Telegram sendMessage failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  async sendDaySummary(token: string, chatId: string, day: DaySummaryInput): Promise<TelegramSendResult> {
    return this.sendText(token, chatId, buildDaySummary(day));
  }

  // number — id опубликованного поста, null — не настроено или не отправилось.
  // Картинка необязательна: без неё уходит текстовый пост, чтобы недельный
  // итог не потерялся из-за сбоя рендера на фронте.
  async sendWeeklySummary(
    token: string,
    chatId: string,
    text: string,
    chartPngBase64: string | null,
  ): Promise<TelegramSendResult> {
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

      const photoResult = await this.postForm(token, 'sendPhoto', form);
      if (!photoResult.ok) return photoResult;
      if (asCaption) return photoResult;

      // Фото уже опубликовано в канале — если добивочный текст не дойдёт,
      // это нельзя превратить в null: вызывающий код трактует null как
      // «ничего не отправлено» и повторит попытку, задвоив фото в канале.
      // Поэтому неудачу текста только логируем и всё равно отдаём photoId.
      const textResult = await this.sendText(token, chatId, text);
      if (!textResult.ok) {
        this.logger.warn(
          `Telegram sendWeeklySummary: photo sent, follow-up caption text rejected: ${textResult.error}`,
        );
      }
      return photoResult;
    } catch (e) {
      const message = redact(String(e), token);
      this.logger.warn(`Telegram sendWeeklySummary failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  private async postForm(token: string, method: string, form: FormData): Promise<TelegramSendResult> {
    // Картинка может весить сотни килобайт — таймаут щедрее, чем у текста.
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(20000),
      });
      return this.readResult(response, method, token);
    } catch (e) {
      const message = redact(String(e), token);
      this.logger.warn(`Telegram ${method} failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  private async readResult(response: Response, method: string, token: string): Promise<TelegramSendResult> {
    if (!response.ok) {
      const error = `${method} failed: ${response.status} ${await response.text()}`;
      this.logger.warn(`Telegram ${error}`);
      return { ok: false, error: redact(error, token) };
    }
    const body = (await response.json()) as { ok: boolean; description?: string; result?: { message_id: number } };
    if (!body.ok || !body.result) {
      const error = `${method} rejected: ${body.description ?? 'unknown error'}`;
      this.logger.warn(`Telegram ${error}`);
      return { ok: false, error: redact(error, token) };
    }
    return { ok: true, messageId: body.result.message_id };
  }

  // ↓ Временные обёртки над новым клиентом с env-учёткой — сохраняют зелёным
  // `days.service.ts` до Task 5 (рассылка по чатам). Удаляются в Task 5.
  isConfigured(): boolean {
    return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
  }

  private envCreds(): { token: string; chatId: string } | null {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return null;
    return { token, chatId };
  }

  async postDaySummary(day: DaySummaryInput): Promise<number | null> {
    const creds = this.envCreds();
    if (!creds) return null;
    const result = await this.sendDaySummary(creds.token, creds.chatId, day);
    return result.ok ? result.messageId : null;
  }

  async postWeeklySummary(text: string, chartPngBase64?: string | null): Promise<number | null> {
    const creds = this.envCreds();
    if (!creds) return null;
    const result = await this.sendWeeklySummary(creds.token, creds.chatId, text, chartPngBase64 ?? null);
    return result.ok ? result.messageId : null;
  }
}
