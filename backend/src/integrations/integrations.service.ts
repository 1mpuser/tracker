import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalDavClient, ICloudCredentials } from '../icloud/caldav.client';
import { decryptSecret, encryptSecret, loadEncryptionKey } from '../common/crypto.util';
import type { AuthUser } from '../auth/auth-user';

export interface ReminderItemLike {
  id: number;
  title: string;
  status: string;
  dueDate: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  priority: boolean;
}

// Учётные данные iCloud и настройки Session живут в Settings пользователя.
// Пароль приложения всегда зашифрован (enc:v1:...), ни один метод не отдаёт
// его наружу — только расширенные значения внутрь ICloudService/SessionService.
@Injectable()
export class IntegrationsService {
  private readonly encKey = loadEncryptionKey();
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private prisma: PrismaService,
    private caldav: CalDavClient,
  ) {}

  private async settingsRow(userId: number) {
    const settings = await this.prisma.settings.findUnique({ where: { userId } });
    if (settings) return settings;
    return this.prisma.settings.create({ data: { userId } });
  }

  // Расшифрованные учётные данные — только для внутреннего использования.
  // Сменённый APP_ENCRYPTION_KEY не должен ронять запросы: расшифровка не
  // удалась → интеграция считается ненастроенной (нужно ввести заново).
  async icloudCredentials(userId: number): Promise<ICloudCredentials | null> {
    const settings = await this.settingsRow(userId);
    if (!settings.icloudAppleId || !settings.icloudAppPasswordEnc) return null;
    try {
      return {
        appleId: settings.icloudAppleId,
        appPassword: decryptSecret(settings.icloudAppPasswordEnc, this.encKey),
      };
    } catch (e) {
      // Без пароля/секрета в логе: сам факт — пользователю, подробности — разработчику.
      this.logger.warn(`iCloud-пароль пользователя #${userId} не расшифровывается, интеграция считается ненастроенной: ${e}`);
      return null;
    }
  }

  async getICloud(userId: number): Promise<{ configured: boolean; appleId: string | null; remindersList: string }> {
    const settings = await this.settingsRow(userId);
    const creds = await this.icloudCredentials(userId);
    return {
      configured: creds !== null,
      appleId: settings.icloudAppleId ?? null,
      remindersList: settings.icloudRemindersList,
    };
  }

  async setICloud(userId: number, dto: { appleId: string; appPassword: string; remindersList?: string }) {
    const appleId = dto.appleId.trim();
    const listName = (dto.remindersList ?? 'GTD').trim() || 'GTD';
    const creds: ICloudCredentials = { appleId, appPassword: dto.appPassword };

    // Проверка живой учёткой ещё до записи: неверный логин или отсутствие
    // списка → понятный текст, в БД ничего не сохраняется.
    const client = await this.caldav.getClient(userId, creds);
    if (!client) {
      throw new BadRequestException('Не удалось войти в iCloud: проверьте Apple ID и пароль приложения');
    }
    const list = await this.caldav.findCalendar(userId, creds, listName);
    if (!list) {
      throw new BadRequestException(
        `В iCloud нет списка «${listName}» — создайте его в «Напоминаниях» или укажите другое имя`,
      );
    }

    await this.prisma.settings.update({
      where: { userId },
      data: {
        icloudAppleId: appleId,
        icloudAppPasswordEnc: encryptSecret(dto.appPassword, this.encKey),
        icloudRemindersList: listName,
      },
    });
    this.caldav.forget(userId);
    return this.getICloud(userId);
  }

  // clearICloud также глушит Session: без iCloud-учётки он не работает.
  // Напоминания в iCloud НЕ удаляются.
  async clearICloud(userId: number) {
    await this.prisma.settings.update({
      where: { userId },
      data: { icloudAppleId: null, icloudAppPasswordEnc: null, sessionCalendarName: null },
    });
    this.caldav.forget(userId);
    return this.getICloud(userId);
  }

  async getSession(userId: number): Promise<{
    configured: boolean;
    calendarName: string | null;
    minMinutes: number;
    icloudConfigured: boolean;
  }> {
    const [settings, creds] = await Promise.all([this.settingsRow(userId), this.icloudCredentials(userId)]);
    return {
      configured: creds !== null && Boolean(settings.sessionCalendarName),
      calendarName: settings.sessionCalendarName ?? null,
      minMinutes: settings.sessionMinMinutes,
      icloudConfigured: creds !== null,
    };
  }

  async setSession(userId: number, dto: { calendarName: string; minMinutes?: number }) {
    const creds = await this.icloudCredentials(userId);
    if (!creds) {
      throw new ConflictException('Сначала подключите iCloud во вкладке «iCloud»');
    }
    const calendar = await this.caldav.findCalendar(userId, creds, dto.calendarName.trim());
    if (!calendar) {
      throw new BadRequestException(`Календарь «${dto.calendarName}» не найден в iCloud`);
    }
    const parsedMin = Number(dto.minMinutes);
    await this.prisma.settings.update({
      where: { userId },
      data: {
        sessionCalendarName: dto.calendarName.trim(),
        ...(Number.isFinite(parsedMin) && parsedMin > 0 ? { sessionMinMinutes: Math.trunc(parsedMin) } : {}),
      },
    });
    return this.getSession(userId);
  }

  async clearSession(userId: number) {
    await this.prisma.settings.update({ where: { userId }, data: { sessionCalendarName: null } });
    return this.getSession(userId);
  }

  // Смотрим, настроена ли интеграция — для флагов в GET /settings.
  async icloudConfigured(userId: number): Promise<boolean> {
    return (await this.icloudCredentials(userId)) !== null;
  }

  async sessionSyncEnabled(userId: number): Promise<boolean> {
    const settings = await this.settingsRow(userId);
    return Boolean(settings.sessionCalendarName) && (await this.icloudCredentials(userId)) !== null;
  }

  toReminderItem(item: ReminderItemLike) {
    return item;
  }
}
