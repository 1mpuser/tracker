import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService, TelegramChatInfo } from './telegram.service';
import { isUniqueViolation } from '../common/prisma-errors';
import { decryptSecret, encryptSecret, isEncrypted, loadEncryptionKey } from '../common/crypto.util';

export interface TelegramBotView {
  configured: boolean;
  source: 'db' | null;
  username: string | null;
  tokenHint: string | null;
}

const TOKEN_FORMAT = /^\d+:[A-Za-z0-9_-]{30,}$/;
const TEST_MESSAGE = '✅ Трекер подключён к этому чату';

@Injectable()
export class TelegramConfigService implements OnModuleInit {
  private readonly logger = new Logger(TelegramConfigService.name);
  private readonly encKey = loadEncryptionKey();

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
  ) {}

  // Одноразовая миграция при старте: открытые токены (оставшиеся от
  // однопользовательской версии) шифруются. Значение в логи не пишется.
  async onModuleInit() {
    const withToken = await this.prisma.settings.findMany({
      where: { telegramBotToken: { not: null } },
      select: { id: true, userId: true, telegramBotToken: true },
    });
    for (const row of withToken) {
      const value = row.telegramBotToken;
      if (value && !isEncrypted(value)) {
        await this.prisma.settings.update({
          where: { userId: row.userId },
          data: { telegramBotToken: encryptSecret(value, this.encKey) },
        });
        this.logger.log(`Токен Telegram пользователя #${row.userId} зашифрован`);
      }
    }
  }

  private async settingsRow(userId: number) {
    const settings = await this.prisma.settings.findUnique({ where: { userId } });
    if (settings) return settings;
    return this.prisma.settings.create({ data: { userId } });
  }

  // Токен только из настроек пользователя. Env-фоллбэков нет: в
  // многопользовательском режиме чужие действия шли бы в Telegram владельца.
  // Сменённый APP_ENCRYPTION_KEY не роняет запросы: не расшифровалось →
  // бот считается не настроенным (нужно ввести заново).
  async resolveToken(userId: number): Promise<string | null> {
    const stored = (await this.settingsRow(userId)).telegramBotToken;
    if (!stored) return null;
    if (!isEncrypted(stored)) return stored;
    try {
      return decryptSecret(stored, this.encKey);
    } catch (e) {
      // Токен в лог не пишем: только пользователь и факт расшифровки.
      this.logger.warn(`Токен Telegram пользователя #${userId} не расшифровывается, бот считается ненастроенным: ${e}`);
      return null;
    }
  }

  async recipients(userId: number, kind: 'day' | 'week'): Promise<string[]> {
    const chats = await this.prisma.telegramChat.findMany({
      where: { userId },
      select: { chatId: true, daily: true, weekly: true },
    });
    return chats
      .filter((c) => (kind === 'day' ? c.daily : c.weekly))
      .map((c) => c.chatId);
  }

  async getBot(userId: number): Promise<TelegramBotView> {
    const token = await this.resolveToken(userId);
    if (!token) {
      return { configured: false, source: null, username: null, tokenHint: null };
    }
    const me = await this.telegram.getMe(token);
    return {
      configured: true,
      source: 'db',
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
      data: { telegramBotToken: encryptSecret(trimmed, this.encKey) },
    });
    return this.getBot(userId);
  }

  async clearBotToken(userId: number): Promise<TelegramBotView> {
    await this.prisma.settings.update({ where: { userId }, data: { telegramBotToken: null } });
    return this.getBot(userId);
  }

  async listChats(userId: number): Promise<{ chats: unknown[] }> {
    const chats = await this.prisma.telegramChat.findMany({ where: { userId }, orderBy: { id: 'asc' } });
    return { chats };
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
