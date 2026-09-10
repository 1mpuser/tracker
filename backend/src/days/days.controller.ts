import { BadGatewayException, BadRequestException, Body, ConflictException, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { DaysService } from './days.service';
import { UpdateCategoryStatusDto } from './dto/update-category-status.dto';
import { UpdateDistractionDto } from './dto/update-distraction.dto';
import { UpdatePomodorosDto } from './dto/update-pomodoros.dto';
import { UpdateDayDto } from './dto/update-day.dto';
import { WeeklySummaryDto } from './dto/weekly-summary.dto';
import { SessionService } from '../session/session.service';
import { TelegramDeliveryService } from '../telegram/telegram-delivery.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { parseDateParam } from '../common/date.util';

@Controller()
export class DaysController {
  constructor(
    private readonly daysService: DaysService,
    private readonly session: SessionService,
    private readonly delivery: TelegramDeliveryService,
  ) {}

  @Get('days/:date')
  getDay(@CurrentUser() user: AuthUser, @Param('date') date: string) {
    return this.daysService.getDay(user.id, date);
  }

  @Patch('days/:date/categories/:key')
  setCategoryStatus(
    @CurrentUser() user: AuthUser,
    @Param('date') date: string,
    @Param('key') key: string,
    @Body() dto: UpdateCategoryStatusDto,
  ) {
    return this.daysService.setCategoryStatus(user.id, date, key, dto.done);
  }

  @Patch('days/:date/distraction')
  updateDistraction(@CurrentUser() user: AuthUser, @Param('date') date: string, @Body() dto: UpdateDistractionDto) {
    return this.daysService.updateDistraction(user.id, date, dto.delta, dto.reset);
  }

  @Patch('days/:date/pomodoros')
  updatePomodoros(@CurrentUser() user: AuthUser, @Param('date') date: string, @Body() dto: UpdatePomodorosDto) {
    return this.daysService.updatePomodoros(user.id, date, dto.delta, dto.reset);
  }

  @Post('days/:date/pomodoros/sync-session')
  async syncSessionPomodoros(@CurrentUser() user: AuthUser, @Param('date') date: string) {
    if (!this.session.isEnabled()) {
      throw new ConflictException('Синхронизация с календарём Session не настроена');
    }
    const count = await this.session.syncDate(user.id, date);
    // null — календарь прочитать не удалось. Счётчик не трогаем: иначе сетевой
    // сбой обнулил бы день. Ноль пишется только когда календарь ответил пустым.
    if (count === null) {
      throw new BadGatewayException('Не удалось прочитать календарь Session');
    }
    return this.daysService.setPomodoros(user.id, date, count);
  }

  @Post('days/:date/weekly-summary')
  async postWeeklySummary(@CurrentUser() user: AuthUser, @Param('date') date: string, @Body() dto: WeeklySummaryDto) {
    // Сводка привязана к неделе, а неделя заканчивается воскресеньем: пускать
    // сюда любую дату значило бы плодить посты за одну и ту же неделю.
    if (parseDateParam(date).getUTCDay() !== 0) {
      throw new BadRequestException('Недельная сводка публикуется только за воскресенье');
    }
    // Проверяем до сервиса и до любой рассылки: иначе пользователь без
    // настройки Telegram каждое воскресенье получал бы ложный 502 вместо
    // честного «фича не настроена».
    if (!(await this.delivery.isConfigured(user.id, 'week'))) {
      throw new ConflictException('Telegram не настроен: задайте токен бота и хотя бы один чат для недельной сводки в настройках');
    }

    const result = await this.daysService.postWeeklySummary(user.id, date, dto.chartPng ?? null);

    if (result.reason === 'already-posted') {
      return { posted: false, reason: 'already-posted' };
    }
    if (result.reason === 'send-failed') {
      throw new BadGatewayException('Не удалось опубликовать недельную сводку');
    }
    return { posted: true, withChart: result.withChart };
  }

  @Patch('days/:date')
  updateDay(@CurrentUser() user: AuthUser, @Param('date') date: string, @Body() dto: UpdateDayDto) {
    return this.daysService.updateDay(user.id, date, dto);
  }

  @Get('history')
  getHistory(@CurrentUser() user: AuthUser, @Query('limit') limit?: string, @Query('end') end?: string) {
    const parsed = limit ? parseInt(limit, 10) : 21;
    return this.daysService.getHistory(user.id, Number.isNaN(parsed) ? 21 : parsed, end);
  }
}
