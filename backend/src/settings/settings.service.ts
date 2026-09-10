import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SessionService } from '../session/session.service';

interface SettingsRow {
  id: number;
  distractionBudget: number;
  distractionLabel: string;
  notificationsEnabled: boolean;
}

export type SettingsView = SettingsRow & { sessionSyncEnabled: boolean };

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private session: SessionService,
  ) {}

  // sessionSyncEnabled в БД не хранится: это отражение интеграции Session,
  // а не пользовательская настройка, поэтому и в PATCH оно не принимается.
  // (После Task 3.3 станет per-user, пока — из env.)
  private withFlags(row: SettingsRow): SettingsView {
    return { ...row, sessionSyncEnabled: this.session.isEnabled() };
  }

  private async row(userId: number): Promise<SettingsRow> {
    const settings = await this.prisma.settings.findUnique({ where: { userId } });
    if (settings) return settings;
    return this.prisma.settings.create({ data: { userId } });
  }

  async get(userId: number): Promise<SettingsView> {
    return this.withFlags(await this.row(userId));
  }

  async update(userId: number, dto: UpdateSettingsDto): Promise<SettingsView> {
    await this.row(userId);
    const updated = await this.prisma.settings.update({ where: { userId }, data: dto });
    return this.withFlags(updated);
  }
}
