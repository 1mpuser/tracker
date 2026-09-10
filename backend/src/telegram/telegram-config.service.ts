import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService, TelegramChatInfo } from './telegram.service';
import { isUniqueViolation } from '../common/prisma-errors';

export interface TelegramBotView {
  configured: boolean;
  source: 'db' | 'env' | null;
  username: string | null;
  tokenHint: string | null;
}

export interface TelegramRecipient {
  chatId: string;
  daily: boolean;
  weekly: boolean;
}

const TOKEN_FORMAT = /^\d+:[A-Za-z0-9_-]{30,}$/;
const TEST_MESSAGE = '✅ Трекер подключён к этому чату';

// Пустая строка в env — это «не задано»: docker-compose подставляет '' через ${VAR:-}.
function envValue(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? v : null;
}

@Injectable()
export class TelegramConfigService {
  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
  ) {}

  // Внимание: env-фоллбэки ниже — только на время Фазы 1 (однопользовательской
  // разработки). В многопользовательском режиме (Task 3.2) они удаляются:
  // иначе чужие действия уходили бы в Telegram владельца.
  private async settingsRow(userId: number) {
    const settings = await this.prisma.settings.findUnique({ where: { userId } });
    if (settings) return settings;
    return this.prisma.settings.create({ data: { userId } });
  }

  // Токен из БД → из env → null.
  async resolveToken(userId: number): Promise<string | null> {
    const dbToken = (await this.settingsRow(userId)).telegramBotToken;
    return dbToken ?? envValue('TELEGRAM_BOT_TOKEN');
  }

  // chatId всех чатов пользователя с видом kind=true; env-фоллбэк — только
  // если у пользователя таблица пуста.
  async recipients(userId: number, kind: 'day' | 'week'): Promise<string[]> {
    const chats = await this.prisma.telegramChat.findMany({
      where: { userId },
      select: { chatId: true, daily: true, weekly: true },
    });
    const enabled = chats
      .filter((c) => (kind === 'day' ? c.daily : c.weekly))
      .map((c) => c.chatId);
    if (enabled.length > 0) return enabled;
    const envChat = envValue('TELEGRAM_CHAT_ID');
    return envChat && chats.length === 0 ? [envChat] : [];
  }

  async getBot(userId: number): Promise<TelegramBotView> {
    const dbSettings = await this.settingsRow(userId);
    const dbToken = dbSettings.telegramBotToken;
    const envToken = envValue('TELEGRAM_BOT_TOKEN');
    const token = dbToken ?? envToken;
    if (!token) {
      return { configured: false, source: null, username: null, tokenHint: null };
    }

    const source: TelegramBotView['source'] = dbToken ? 'db' : 'env';
    const me = await this.telegram.getMe(token);
    return {
      configured: true,
      source,
      username: me.ok ? me.username : null,
      tokenHint: `…${token.slice(-4)}`,
    };
  }

  async setBotToken(userId: number, token: string): Promise<TelegramBotView> {
    const trimmed = token.trim();
    if (!TOKEN_FORMAT.test(trimmed)) {
      throw new BadRequestException('Токен не похож на токен бота: ожидается «123456789:AA…»');
    }
    const me = await this.telegram.getMe(trimmed);
    if (!me.ok) {
      throw new BadRequestException('Telegram не принял токен: ' + me.error);
    }
    await this.prisma.settings.update({
      where: { userId },
      data: { telegramBotToken: trimmed },
    });
    return this.getBot(userId);
  }

  async clearBotToken(userId: number): Promise<TelegramBotView> {
    await this.prisma.settings.update({ where: { userId }, data: { telegramBotToken: null } });
    return this.getBot(userId);
  }

  async listChats(userId: number): Promise<{ chats: unknown[]; envFallback: string | null }> {
    const [chats, count] = await Promise.all([
      this.prisma.telegramChat.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
      this.prisma.telegramChat.count({ where: { userId } }),
    ]);
    return { chats, envFallback: count === 0 ? envValue('TELEGRAM_CHAT_ID') : null };
  }

  async createChat(userId: number, dto: { title: string; chatId: string; daily?: boolean; weekly?: boolean }) {
    try {
      return await this.prisma.telegramChat.create({
        data: {
          userId,
          title: dto.title.trim(),
          chatId: dto.chatId.trim(),
          daily: dto.daily ?? true,
          weekly: dto.weekly ?? true,
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException('Чат с таким chatId уже добавлен');
      }
      throw e;
    }
  }

  async updateChat(userId: number, id: number, dto: { title?: string; daily?: boolean; weekly?: boolean }) {
    const existing = await this.prisma.telegramChat.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Чат не найден');
    return this.prisma.telegramChat.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.daily !== undefined ? { daily: dto.daily } : {}),
        ...(dto.weekly !== undefined ? { weekly: dto.weekly } : {}),
      },
    });
  }

  async deleteChat(userId: number, id: number): Promise<void> {
    const existing = await this.prisma.telegramChat.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Чат не найден');
    await this.prisma.telegramChat.delete({ where: { id } });
  }

  async testChat(userId: number, id: number): Promise<void> {
    const token = await this.resolveToken(userId);
    if (!token) {
      throw new ConflictException('Сначала подключите бота во вкладке «Telegram-бот»');
    }
    const chat = await this.prisma.telegramChat.findFirst({ where: { id, userId } });
    if (!chat) throw new NotFoundException('Чат не найден');
    const result = await this.telegram.sendText(token, chat.chatId, TEST_MESSAGE);
    if (!result.ok) {
      throw new BadGatewayException(`Telegram не ответил: ${result.error}`);
    }
  }

  async discover(userId: number): Promise<TelegramChatInfo[]> {
    const token = await this.resolveToken(userId);
    if (!token) {
      throw new ConflictException('Сначала подключите бота во вкладке «Telegram-бот»');
    }
    const seen = await this.prisma.telegramChat.findMany({ where: { userId }, select: { chatId: true } });
    const seenSet = new Set(seen.map((c) => c.chatId));
    const found = await this.telegram.getUpdatesChats(token);
    return found.filter((c) => !seenSet.has(c.chatId));
  }
}
