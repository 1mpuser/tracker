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

  @Get('youtube')
  youtubeWeekly(@Query('weeks') weeks?: string) {
    const parsed = weeks ? parseInt(weeks, 10) : 8;
    return this.statsService.youtubeWeeklyStats(Number.isNaN(parsed) ? 8 : parsed);
  }

  @Get('youtube-daily')
  youtubeDaily(@Query('days') days?: string) {
    const parsed = days ? parseInt(days, 10) : 30;
    return this.statsService.youtubeDailyStats(Number.isNaN(parsed) ? 30 : parsed);
  }
}
