import { Body, Controller, Delete, Get, Post, Put } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from './integrations.service';
import { ICloudService } from '../icloud/icloud.service';
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
    // Сырые строки сразу в ReminderItem (у них те же поля): toView в GtdService
    // для resync не нужен — здесь важны только effectiveDue-поля.
    const items = await this.prisma.gtdItem.findMany({
      where: { userId: user.id, status: { not: 'archived' } },
    });
    await this.icloud.syncAllOnStartup(user, items as any);
    return { synced: items.length };
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
