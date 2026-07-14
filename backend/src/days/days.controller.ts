import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { DaysService } from './days.service';
import { UpdateCategoryStatusDto } from './dto/update-category-status.dto';
import { UpdateYoutubeDto } from './dto/update-youtube.dto';
import { UpdateDayDto } from './dto/update-day.dto';

@Controller()
export class DaysController {
  constructor(private readonly daysService: DaysService) {}

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

  @Patch('days/:date')
  updateDay(@Param('date') date: string, @Body() dto: UpdateDayDto) {
    return this.daysService.setEveningClosed(date, dto.eveningClosed);
  }

  @Get('history')
  getHistory(@Query('limit') limit?: string) {
    const parsed = limit ? parseInt(limit, 10) : 21;
    return this.daysService.getHistory(Number.isNaN(parsed) ? 21 : parsed);
  }
}
