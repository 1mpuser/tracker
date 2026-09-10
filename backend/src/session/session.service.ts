import { Injectable, Logger } from '@nestjs/common';
import { CalDavClient } from '../icloud/caldav.client';
import { IntegrationsService } from '../integrations/integrations.service';
import { redactSecret } from '../common/redact.util';
import { countPomodoros, dayWindow, parseEvents } from './session.helpers';
import { AuthUser } from '../auth/auth-user';

const DEFAULT_MIN_MINUTES = 20;

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly caldav: CalDavClient,
    private readonly integrations: IntegrationsService,
  ) {}

  private async configFor(user: AuthUser): Promise<{ calendarName: string; minMinutes: number } | null> {
    const stored = await this.integrations.getSession(user.id);
    if (!stored.calendarName) return null;
    return {
      calendarName: stored.calendarName,
      minMinutes: stored.minMinutes > 0 ? stored.minMinutes : DEFAULT_MIN_MINUTES,
    };
  }

  // Есть ли у пользователя и учётка iCloud, и имя календаря Session.
  async isEnabledFor(user: AuthUser): Promise<boolean> {
    const cfg = await this.configFor(user);
    if (!cfg) return false;
    return (await this.integrations.icloudCredentials(user.id)) !== null;
  }

  // Число — календарь ответил. null — не настроено или чтение не удалось;
  // вызывающий обязан не трогать счётчик, иначе сетевой сбой обнулил бы день.
  async syncDate(user: AuthUser, date: string): Promise<number | null> {
    if (!(await this.isEnabledFor(user))) return null;
    try {
      const creds = await this.integrations.icloudCredentials(user.id);
      if (!creds) return null;
      const cfg = await this.configFor(user);
      if (!cfg) return null;
      const calendar = await this.caldav.findCalendar(user.id, creds, cfg.calendarName);
      const client = await this.caldav.getClient(user.id, creds);
      if (!calendar || !client) return null;

      // Окна дня — в часовом поясе пользователя, а не контейнера.
      const timeZone = user.timezone;
      const window = dayWindow(date, timeZone);
      const objects = await client.fetchCalendarObjects({
        calendar,
        timeRange: { start: window.start.toISOString(), end: window.end.toISOString() },
      });

      const events = objects.flatMap((o) => parseEvents(o.data ?? '', timeZone));
      // session.helpers.ts — чистый модуль без NestJS/Logger, поэтому не может
      // сам сообщить о пропущенных VEVENT. Считаем разницу снаружи: сколько
      // VEVENT было в ответе календаря против скольких распарсились.
      const totalVevents = objects.reduce(
        (sum, o) => sum + ((o.data ?? '').match(/BEGIN:VEVENT/g)?.length ?? 0),
        0,
      );
      const skipped = totalVevents - events.length;
      if (skipped > 0) {
        this.logger.debug(`Session syncDate(${date}): пропущено ${skipped} нераспознанных VEVENT`);
      }
      return countPomodoros(events, window, cfg.minMinutes);
    } catch (e) {
      this.logger.warn(`Session syncDate(${date}) failed: ${this.redactFor(user, String(e))}`);
      return null;
    }
  }

  // Текст ошибки от tsdav/fetch может содержать URL с учётными данными —
  // вырезаем пароль приложения, чтобы он не осел в логах.
  private async redactFor(user: AuthUser, message: string): Promise<string> {
    const creds = await this.integrations.icloudCredentials(user.id);
    return creds ? redactSecret(message, creds.appPassword) : message;
  }
}
