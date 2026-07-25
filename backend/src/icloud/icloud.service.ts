import { Injectable, Logger } from '@nestjs/common';
import { DAVClient, DAVCalendar } from 'tsdav';
import { EffectiveDue, buildReminderIcs, effectiveDue, reminderUid } from './icloud.helpers';

interface ReminderItem {
  id: number;
  title: string;
  status: string;
  dueDate: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  priority: boolean;
}

@Injectable()
export class ICloudService {
  private readonly logger = new Logger(ICloudService.name);
  private client: DAVClient | null = null;
  private remindersCalendar: DAVCalendar | null = null;

  private credentials(): { username: string; password: string } | null {
    const username = process.env.ICLOUD_APPLE_ID;
    const password = process.env.ICLOUD_APP_PASSWORD;
    return username && password ? { username, password } : null;
  }

  private async getRemindersCalendar(): Promise<DAVCalendar | null> {
    const creds = this.credentials();
    if (!creds) return null;
    if (this.remindersCalendar) return this.remindersCalendar;
    try {
      if (!this.client) {
        // Assign only after a successful login — if login() throws, `this.client`
        // must stay null so the next call retries instead of reusing a permanently
        // unauthenticated instance (which would silently no-op forever).
        const client = new DAVClient({
          serverUrl: 'https://caldav.icloud.com',
          credentials: creds,
          authMethod: 'Basic',
          defaultAccountType: 'caldav',
        });
        await client.login();
        this.client = client;
      }
      const listName = process.env.ICLOUD_REMINDERS_LIST_NAME || 'GTD';
      const calendars = await this.client.fetchCalendars();
      const found = calendars.find((c) => c.displayName === listName);
      if (!found) {
        this.logger.warn(`iCloud reminders list "${listName}" not found`);
        return null;
      }
      this.remindersCalendar = found;
      return found;
    } catch (e) {
      this.logger.warn(`iCloud calendar discovery failed: ${e}`);
      return null;
    }
  }

  private async upsert(filename: string, iCalString: string): Promise<void> {
    const calendar = await this.getRemindersCalendar();
    if (!calendar || !this.client) return;
    const url = `${calendar.url}${filename}`;
    await this.client.deleteCalendarObject({ calendarObject: { url } }).catch(() => undefined);
    await this.client.createCalendarObject({ calendar, filename, iCalString });
  }

  async syncReminder(item: ReminderItem, due: EffectiveDue): Promise<void> {
    if (!this.credentials()) return;
    try {
      const uid = reminderUid(item.id);
      const ics = buildReminderIcs({ uid, title: `GTD: ${item.title}`, due, priority: item.priority, completed: false });
      await this.upsert(`${uid}.ics`, ics);
    } catch (e) {
      this.logger.warn(`iCloud syncReminder(${item.id}) failed: ${e}`);
    }
  }

  async completeReminder(id: number, item: ReminderItem, due: EffectiveDue): Promise<void> {
    if (!this.credentials()) return;
    try {
      const uid = reminderUid(id);
      const ics = buildReminderIcs({ uid, title: `GTD: ${item.title}`, due, priority: item.priority, completed: true });
      await this.upsert(`${uid}.ics`, ics);
    } catch (e) {
      this.logger.warn(`iCloud completeReminder(${id}) failed: ${e}`);
    }
  }

  async removeReminder(id: number): Promise<void> {
    const calendar = await this.getRemindersCalendar();
    if (!calendar || !this.client) return;
    try {
      const url = `${calendar.url}${reminderUid(id)}.ics`;
      await this.client.deleteCalendarObject({ calendarObject: { url } });
    } catch (e) {
      this.logger.warn(`iCloud removeReminder(${id}) failed: ${e}`);
    }
  }

  async syncAllOnStartup(items: ReminderItem[]): Promise<void> {
    for (const item of items) {
      const due = effectiveDue(item);
      if (due) await this.syncReminder(item, due);
    }
  }
}
