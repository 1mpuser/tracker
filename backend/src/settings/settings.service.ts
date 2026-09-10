import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

interface SettingsRow {
  id: number;
  distractionBudget: number;
  distractionLabel: string;
  notificationsEnabled: boolean;
}

export type SettingsView = SettingsRow & {
  icloudEnabled: boolean;
  sessionSyncEnabled: boolean;
  obsidianEnabled: boolean;
};

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private integrations: IntegrationsService,
  ) {}

  // Флаги интеграций per-user или по конфигу сервера, поэтому в PATCH они не
  // принимаются.
  private async withFlags(userId: number, row: SettingsRow): Promise<SettingsView> {
    const [icloudEnabled, sessionSyncEnabled] = await Promise.all([
      this.integrations.icloudConfigured(userId),
      this.integrations.sessionSyncEnabled(userId),
    ]);
    return {
      ...row,
      icloudEnabled,
      sessionSyncEnabled,
      // Obsidian-экспорт — только на хосте с папкой вольюма; на VPS выключен.
      obsidianEnabled: Boolean(process.env.OBSIDIAN_EXPORT_DIR),
    };
  }

  private async row(userId: number): Promise<SettingsRow> {
    const settings = await this.prisma.settings.findUnique({ where: { userId } });
    if (settings) return settings;
    return this.prisma.settings.create({ data: { userId } });
  }

  async get(userId: number): Promise<SettingsView> {
    return this.withFlags(userId, await this.row(userId));
  }

  async update(userId: number, dto: UpdateSettingsDto): Promise<SettingsView> {
    await this.row(userId);
    const updated = await this.prisma.settings.update({ where: { userId }, data: dto });
    return this.withFlags(userId, updated);
  }
}
