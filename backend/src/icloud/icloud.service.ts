import { Injectable, Logger } from '@nestjs/common';
import { DAVCalendar } from 'tsdav';
import { IntegrationsService } from '../integrations/integrations.service';
import { CalDavClient } from './caldav.client';
import { EffectiveDue, buildReminderIcs, effectiveDue, reminderUid } from './icloud.helpers';
import { AuthUser } from '../auth/auth-user';

export interface ReminderItem {
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

  constructor(
    private readonly caldav: CalDavClient,
    private readonly integrations: IntegrationsService,
  ) {}

  private async getRemindersCalendar(user: AuthUser): Promise<{ calendar: DAVCalendar | null; creds: { appleId: string; appPassword: string } | null; listName: string }> {
    const creds = await this.integrations.icloudCredentials(user.id);
    if (!creds) return { calendar: null, creds: null, listName: 'GTD' };
    const settings = await this.integrations.getICloud(user.id);
    const calendar = await this.caldav.findCalendar(user.id, creds, settings.remindersList);
    return { calendar, creds, listName: settings.remindersList };
  }

  private async upsert(user: AuthUser, filename: string, iCalString: string): Promise<void> {
    const { calendar, creds } = await this.getRemindersCalendar(user);
    if (!calendar || !creds) return;
    const client = await this.caldav.getClient(user.id, creds);
    if (!client) return;
    try {
      const url = `${calendar.url}${filename}`;
      await client.deleteCalendarObject({ calendarObject: { url } }).catch(() => undefined);
      await client.createCalendarObject({ calendar, filename, iCalString });
    } catch (e) {
      this.logger.warn(`iCloud upsert(${filename}) failed: ${e}`);
    }
  }

  async syncReminder(user: AuthUser, item: ReminderItem, due: EffectiveDue): Promise<void> {
    if (!(await this.integrations.icloudCredentials(user.id))) return;
    try {
      const uid = reminderUid(item.id);
      const ics = buildReminderIcs({ uid, title: `GTD: ${item.title}`, due, priority: item.priority, completed: false });
      await this.upsert(user, `${uid}.ics`, ics);
    } catch (e) {
      this.logger.warn(`iCloud syncReminder(${item.id}) failed: ${e}`);
    }
  }

  async completeReminder(user: AuthUser, id: number, item: ReminderItem, due: EffectiveDue): Promise<void> {
    if (!(await this.integrations.icloudCredentials(user.id))) return;
    try {
      const uid = reminderUid(id);
      const ics = buildReminderIcs({ uid, title: `GTD: ${item.title}`, due, priority: item.priority, completed: true });
      await this.upsert(user, `${uid}.ics`, ics);
    } catch (e) {
      this.logger.warn(`iCloud completeReminder(${id}) failed: ${e}`);
    }
  }

  async removeReminder(user: AuthUser, id: number): Promise<void> {
    const { calendar, creds } = await this.getRemindersCalendar(user);
    const client = calendar && creds ? await this.caldav.getClient(user.id, creds) : null;
    if (!calendar || !client) return;
    try {
      const url = `${calendar.url}${reminderUid(id)}.ics`;
      await client.deleteCalendarObject({ calendarObject: { url } });
    } catch (e) {
      this.logger.warn(`iCloud removeReminder(${id}) failed: ${e}`);
    }
  }

  async syncAllOnStartup(user: AuthUser, items: ReminderItem[]): Promise<void> {
    for (const item of items) {
      const due = effectiveDue(item);
      if (due) await this.syncReminder(user, item, due);
    }
  }
}
