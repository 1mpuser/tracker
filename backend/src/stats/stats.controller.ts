import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('categories')
  categoryStats(@Query('days') days?: string) {
    const parsed = days ? parseInt(days, 10) : 30;
    return this.statsService.categoryStats(Number.isNaN(parsed) ? 30 : parsed);
  }

  @Get('distraction')
  distractionWeekly(@Query('weeks') weeks?: string) {
    const parsed = weeks ? parseInt(weeks, 10) : 8;
    return this.statsService.distractionWeeklyStats(Number.isNaN(parsed) ? 8 : parsed);
  }

  @Get('distraction-daily')
  distractionDaily(@Query('days') days?: string) {
    const parsed = days ? parseInt(days, 10) : 30;
    return this.statsService.distractionDailyStats(Number.isNaN(parsed) ? 30 : parsed);
  }

  @Get('week')
  weekStats(@Query('end') end?: string) {
    return this.statsService.weekStats(end ?? new Date().toISOString().slice(0, 10));
  }
}
