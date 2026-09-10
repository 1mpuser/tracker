import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';

@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('categories')
  categoryStats(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    const parsed = days ? parseInt(days, 10) : 30;
    return this.statsService.categoryStats(user.id, Number.isNaN(parsed) ? 30 : parsed);
  }

  @Get('distraction')
  distractionWeekly(@CurrentUser() user: AuthUser, @Query('weeks') weeks?: string) {
    const parsed = weeks ? parseInt(weeks, 10) : 8;
    return this.statsService.distractionWeeklyStats(user.id, Number.isNaN(parsed) ? 8 : parsed);
  }

  @Get('distraction-daily')
  distractionDaily(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    const parsed = days ? parseInt(days, 10) : 30;
    return this.statsService.distractionDailyStats(user.id, Number.isNaN(parsed) ? 30 : parsed);
  }

  @Get('week')
  weekStats(@CurrentUser() user: AuthUser, @Query('end') end?: string) {
    return this.statsService.weekStats(user.id, end ?? new Date().toISOString().slice(0, 10));
  }
}
