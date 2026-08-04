import { Injectable, Logger } from '@nestjs/common';
import { CalDavClient } from '../icloud/caldav.client';
import { redactSecret } from '../common/redact.util';
import { countPomodoros, dayWindow, parseEvents } from './session.helpers';

const DEFAULT_MIN_MINUTES = 20;

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(private readonly caldav: CalDavClient) {}

  private calendarName(): string {
    return (process.env.SESSION_CALENDAR_NAME ?? '').trim();
  }

  private minMinutes(): number {
    const parsed = Number(process.env.SESSION_MIN_MINUTES);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MIN_MINUTES;
  }

  private timeZone(): string {
    const tz = process.env.TZ || 'UTC';
    try {
      // Единственный дешёвый способ проверить имя пояса до того, как оно
      // взорвётся посреди разбора календаря: если Intl его не знает
      // (опечатка вроде "Europe/Moskow"), он бросает RangeError.
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return tz;
    } catch {
      this.logger.warn(`Session: TZ="${tz}" не распознан, откат на UTC`);
      return 'UTC';
    }
  }

  isEnabled(): boolean {
    return this.caldav.hasCredentials() && this.calendarName().length > 0;
  }

  // Число — календарь ответил. null — не настроено или чтение не удалось;
  // вызывающий обязан не трогать счётчик, иначе сетевой сбой обнулил бы день.
  async syncDate(date: string): Promise<number | null> {
    if (!this.isEnabled()) return null;
    try {
      const calendar = await this.caldav.findCalendar(this.calendarName());
      const client = await this.caldav.getClient();
      if (!calendar || !client) return null;

      const timeZone = this.timeZone();
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
      return countPomodoros(events, window, this.minMinutes());
    } catch (e) {
      this.logger.warn(`Session syncDate(${date}) failed: ${this.redact(String(e))}`);
      return null;
    }
  }

  // Текст ошибки от tsdav/fetch может содержать URL с учётными данными —
  // вырезаем пароль приложения, чтобы он не осел в логах.
  private redact(message: string): string {
    return redactSecret(message, process.env.ICLOUD_APP_PASSWORD);
  }
}
