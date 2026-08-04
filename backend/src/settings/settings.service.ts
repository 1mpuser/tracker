import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SessionService } from '../session/session.service';

interface SettingsRow {
  id: number;
  youtubeBudget: number;
  notificationsEnabled: boolean;
}

export type SettingsView = SettingsRow & { sessionSyncEnabled: boolean };

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private session: SessionService,
  ) {}

  // sessionSyncEnabled в БД не хранится: это отражение переменных окружения,
  // а не пользовательская настройка, поэтому и в PATCH оно не принимается.
  private withFlags(row: SettingsRow): SettingsView {
    return { ...row, sessionSyncEnabled: this.session.isEnabled() };
  }

  private async row(): Promise<SettingsRow> {
    const settings = await this.prisma.settings.findUnique({ where: { id: 1 } });
    if (settings) return settings;
    return this.prisma.settings.create({ data: { id: 1 } });
  }

  async get(): Promise<SettingsView> {
    return this.withFlags(await this.row());
  }

  async update(dto: UpdateSettingsDto): Promise<SettingsView> {
    await this.row();
    const updated = await this.prisma.settings.update({ where: { id: 1 }, data: dto });
    return this.withFlags(updated);
  }
}
