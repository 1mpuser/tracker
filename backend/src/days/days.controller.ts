import { BadGatewayException, BadRequestException, Body, ConflictException, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { DaysService } from './days.service';
import { UpdateCategoryStatusDto } from './dto/update-category-status.dto';
import { UpdateYoutubeDto } from './dto/update-youtube.dto';
import { UpdatePomodorosDto } from './dto/update-pomodoros.dto';
import { UpdateDayDto } from './dto/update-day.dto';
import { WeeklySummaryDto } from './dto/weekly-summary.dto';
import { SessionService } from '../session/session.service';
import { TelegramService } from '../telegram/telegram.service';
import { parseDateParam } from '../common/date.util';

@Controller()
export class DaysController {
  constructor(
    private readonly daysService: DaysService,
    private readonly session: SessionService,
    private readonly telegram: TelegramService,
  ) {}

  @Get('days/:date')
  getDay(@Param('date') date: string) {
    return this.daysService.getDay(date);
  }

  @Patch('days/:date/categories/:key')
  setCategoryStatus(
    @Param('date') date: string,
    @Param('key') key: string,
    @Body() dto: UpdateCategoryStatusDto,
  ) {
    return this.daysService.setCategoryStatus(date, key, dto.done);
  }

  @Patch('days/:date/youtube')
  updateYoutube(@Param('date') date: string, @Body() dto: UpdateYoutubeDto) {
    return this.daysService.updateYoutube(date, dto.delta, dto.reset);
  }

  @Patch('days/:date/pomodoros')
  updatePomodoros(@Param('date') date: string, @Body() dto: UpdatePomodorosDto) {
    return this.daysService.updatePomodoros(date, dto.delta, dto.reset);
  }

  @Post('days/:date/pomodoros/sync-session')
  async syncSessionPomodoros(@Param('date') date: string) {
    if (!this.session.isEnabled()) {
      throw new ConflictException('Синхронизация с календарём Session не настроена');
    }
    const count = await this.session.syncDate(date);
    // null — календарь прочитать не удалось. Счётчик не трогаем: иначе сетевой
    // сбой обнулил бы день. Ноль пишется только когда календарь ответил пустым.
    if (count === null) {
      throw new BadGatewayException('Не удалось прочитать календарь Session');
    }
    return this.daysService.setPomodoros(date, count);
  }

  @Post('days/:date/weekly-summary')
  async postWeeklySummary(@Param('date') date: string, @Body() dto: WeeklySummaryDto) {
    // Сводка привязана к неделе, а неделя заканчивается воскресеньем: пускать
    // сюда любую дату значило бы плодить посты за одну и ту же неделю.
    if (parseDateParam(date).getUTCDay() !== 0) {
      throw new BadRequestException('Недельная сводка публикуется только за воскресенье');
    }
    // Проверяем до сервиса и до любого захвата: иначе инсталляция без
    // Telegram каждое воскресенье получала бы ложный 502 и лишний цикл
    // захват-освобождение вместо честного «фича не настроена».
    if (!this.telegram.isConfigured()) {
      throw new ConflictException('Telegram не настроен: заполните TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID');
    }

    const result = await this.daysService.postWeeklySummary(date, dto.chartPng ?? null);

    if (result.reason === 'already-posted') {
      return { posted: false, reason: 'already-posted' };
    }
    if (result.reason === 'send-failed') {
      throw new BadGatewayException('Не удалось опубликовать недельную сводку');
    }
    return { posted: true, withChart: result.withChart };
  }

  @Patch('days/:date')
  updateDay(@Param('date') date: string, @Body() dto: UpdateDayDto) {
    return this.daysService.updateDay(date, dto);
  }

  @Get('history')
  getHistory(@Query('limit') limit?: string, @Query('end') end?: string) {
    const parsed = limit ? parseInt(limit, 10) : 21;
    return this.daysService.getHistory(Number.isNaN(parsed) ? 21 : parsed, end);
  }
}
