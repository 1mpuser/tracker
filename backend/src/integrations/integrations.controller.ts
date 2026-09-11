import { Body, Controller, Delete, Get, Post, Put } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from './integrations.service';
import { ICloudService, ReminderItem } from '../icloud/icloud.service';
import { effectiveDue } from '../icloud/icloud.helpers';
import { formatDate } from '../common/date.util';
import { SetICloudDto } from './dto/set-icloud.dto';
import { SetSessionDto } from './dto/set-session.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';

@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly icloud: ICloudService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('icloud')
  getICloud(@CurrentUser() user: AuthUser) {
    return this.integrations.getICloud(user.id);
  }

  @Put('icloud')
  setICloud(@CurrentUser() user: AuthUser, @Body() dto: SetICloudDto) {
    return this.integrations.setICloud(user.id, dto);
  }

  @Delete('icloud')
  clearICloud(@CurrentUser() user: AuthUser) {
    return this.integrations.clearICloud(user.id);
  }

  @Post('icloud/resync')
  async resyncICloud(@CurrentUser() user: AuthUser) {
    // Держим формат данных на месте, не таща GtdService (цикл модулей):
    // даты Prisma (Date) приводим к строкам, как это делает toView в GtdService,
    // иначе effectiveDue/синк падают внутри и число в ответе врёт.
    const rows = await this.prisma.gtdItem.findMany({
      where: { userId: user.id, status: { notIn: ['done', 'archived'] } },
    });
    const items: ReminderItem[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      dueDate: r.dueDate ? formatDate(r.dueDate) : null,
      scheduledDate: r.scheduledDate ? formatDate(r.scheduledDate) : null,
      scheduledTime: r.scheduledTime,
      priority: r.priority,
    }));
    // Честное число — только те, у кого есть эффективная дата: именно их
    // syncAllOnStartup реально отправит в iCloud.
    const dueItems = items.filter((i) => effectiveDue(i) !== null);
    if (dueItems.length > 0) {
      await this.icloud.syncAllOnStartup(user, dueItems);
    }
    return { synced: dueItems.length };
  }

  @Get('session')
  getSession(@CurrentUser() user: AuthUser) {
    return this.integrations.getSession(user.id);
  }

  @Put('session')
  setSession(@CurrentUser() user: AuthUser, @Body() dto: SetSessionDto) {
    return this.integrations.setSession(user.id, dto);
  }

  @Delete('session')
  clearSession(@CurrentUser() user: AuthUser) {
    return this.integrations.clearSession(user.id);
  }
}
