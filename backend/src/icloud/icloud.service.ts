import { Injectable, Logger } from '@nestjs/common';
import { DAVCalendar } from 'tsdav';
import { CalDavClient } from './caldav.client';
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

  constructor(private readonly caldav: CalDavClient) {}

  private async getRemindersCalendar(): Promise<DAVCalendar | null> {
    const listName = process.env.ICLOUD_REMINDERS_LIST_NAME || 'GTD';
    return this.caldav.findCalendar(listName);
  }

  private async upsert(filename: string, iCalString: string): Promise<void> {
    const calendar = await this.getRemindersCalendar();
    const client = await this.caldav.getClient();
    if (!calendar || !client) return;
    const url = `${calendar.url}${filename}`;
    await client.deleteCalendarObject({ calendarObject: { url } }).catch(() => undefined);
    await client.createCalendarObject({ calendar, filename, iCalString });
  }

  async syncReminder(item: ReminderItem, due: EffectiveDue): Promise<void> {
    if (!this.caldav.hasCredentials()) return;
    try {
      const uid = reminderUid(item.id);
      const ics = buildReminderIcs({ uid, title: `GTD: ${item.title}`, due, priority: item.priority, completed: false });
      await this.upsert(`${uid}.ics`, ics);
    } catch (e) {
      this.logger.warn(`iCloud syncReminder(${item.id}) failed: ${e}`);
    }
  }

  async completeReminder(id: number, item: ReminderItem, due: EffectiveDue): Promise<void> {
    if (!this.caldav.hasCredentials()) return;
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
    const client = await this.caldav.getClient();
    if (!calendar || !client) return;
    try {
      const url = `${calendar.url}${reminderUid(id)}.ics`;
      await client.deleteCalendarObject({ calendarObject: { url } });
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
