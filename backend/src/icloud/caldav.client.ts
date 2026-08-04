import { Injectable, Logger } from '@nestjs/common';
import { DAVClient, DAVCalendar } from 'tsdav';

@Injectable()
export class CalDavClient {
  private readonly logger = new Logger(CalDavClient.name);
  private client: DAVClient | null = null;
  private calendars = new Map<string, DAVCalendar>();

  hasCredentials(): boolean {
    return Boolean(process.env.ICLOUD_APPLE_ID && process.env.ICLOUD_APP_PASSWORD);
  }

  private credentials(): { username: string; password: string } | null {
    const username = process.env.ICLOUD_APPLE_ID;
    const password = process.env.ICLOUD_APP_PASSWORD;
    return username && password ? { username, password } : null;
  }

  async getClient(): Promise<DAVClient | null> {
    const creds = this.credentials();
    if (!creds) return null;
    if (this.client) return this.client;
    try {
      // Присваиваем только после успешного login(): если он бросил, this.client
      // должен остаться null, чтобы следующий вызов повторил попытку, а не
      // переиспользовал навсегда неаутентифицированный экземпляр.
      const client = new DAVClient({
        serverUrl: 'https://caldav.icloud.com',
        credentials: creds,
        authMethod: 'Basic',
        defaultAccountType: 'caldav',
      });
      await client.login();
      this.client = client;
      return client;
    } catch (e) {
      this.logger.warn(`iCloud login failed: ${e}`);
      return null;
    }
  }

  async findCalendar(name: string): Promise<DAVCalendar | null> {
    const cached = this.calendars.get(name);
    if (cached) return cached;
    const client = await this.getClient();
    if (!client) return null;
    try {
      const calendars = await client.fetchCalendars();
      const found = calendars.find((c) => c.displayName === name);
      if (!found) {
        this.logger.warn(`iCloud calendar "${name}" not found`);
        return null;
      }
      this.calendars.set(name, found);
      return found;
    } catch (e) {
      this.logger.warn(`iCloud calendar discovery failed: ${e}`);
      return null;
    }
  }
}
