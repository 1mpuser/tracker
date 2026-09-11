import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DAVClient, DAVCalendar } from 'tsdav';
import { redactSecret } from '../common/redact.util';

export interface ICloudCredentials {
  appleId: string;
  appPassword: string;
}

// Кэш на пользователя. fingerprint = sha256(appleId + ':' + appPassword):
// сменили учётку → fingerprint другой → новый client. Неудачный логин НЕ
// кэшируется (правило из git-истории): иначе следующий запрос думал бы, что
// залогинен, и падал глубже.
@Injectable()
export class CalDavClient {
  private readonly logger = new Logger(CalDavClient.name);
  private clients = new Map<number, { fingerprint: string; client: DAVClient }>();
  private calendars = new Map<string, DAVCalendar>();

  private redact(message: string, password: string): string {
    return password ? redactSecret(message, password) : message;
  }

  private fingerprint(creds: ICloudCredentials): string {
    return createHash('sha256').update(`${creds.appleId}:${creds.appPassword}`).digest('hex');
  }

  async getClient(userId: number, creds: ICloudCredentials): Promise<DAVClient | null> {
    const fp = this.fingerprint(creds);
    const cached = this.clients.get(userId);
    if (cached && cached.fingerprint === fp) return cached.client;
    try {
      // Присваиваем только после успешного login(): если он бросил, в кэш
      // ничего не попадает, и следующий вызов повторит попытку.
      const client = new DAVClient({
        serverUrl: 'https://caldav.icloud.com',
        credentials: { username: creds.appleId, password: creds.appPassword },
        authMethod: 'Basic',
        defaultAccountType: 'caldav',
      });
      await client.login();
      this.clients.set(userId, { fingerprint: fp, client });
      return client;
    } catch (e) {
      this.logger.warn(`iCloud login failed: ${this.redact(String(e), creds.appPassword)}`);
      return null;
    }
  }

  async findCalendar(userId: number, creds: ICloudCredentials, name: string): Promise<DAVCalendar | null> {
    // Ключ — пользователь + отпечаток учётки + имя: у разных пользователей могут
    // быть списки с одинаковыми именами, а после смены Apple ID не должен
    // подхватываться кэш старой учётки. forget() всё ещё работает по префиксу
    // `${userId}:` — отпечаток не ломает сброс кэша пользователя.
    const key = `${userId}:${this.fingerprint(creds)}:${name}`;
    const cached = this.calendars.get(key);
    if (cached) return cached;
    const client = await this.getClient(userId, creds);
    if (!client) return null;
    try {
      const calendars = await client.fetchCalendars();
      const found = calendars.find((c) => c.displayName === name);
      if (!found) {
        this.logger.warn(`iCloud calendar "${name}" not found`);
        return null;
      }
      this.calendars.set(key, found);
      return found;
    } catch (e) {
      this.logger.warn(`iCloud calendar discovery failed: ${this.redact(String(e), creds.appPassword)}`);
      return null;
    }
  }

  // Сброс кэша пользователя: смена/удаление учётки.
  forget(userId: number) {
    this.clients.delete(userId);
    for (const key of [...this.calendars.keys()]) {
      if (key.startsWith(`${userId}:`)) this.calendars.delete(key);
    }
  }
}
