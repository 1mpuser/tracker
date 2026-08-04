import { Module } from '@nestjs/common';
import { DaysController } from './days.controller';
import { DaysService } from './days.service';
import { CategoriesModule } from '../categories/categories.module';
import { GtdModule } from '../gtd/gtd.module';
import { TelegramModule } from '../telegram/telegram.module';
import { SessionModule } from '../session/session.module';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [CategoriesModule, GtdModule, TelegramModule, SessionModule, StatsModule],
  controllers: [DaysController],
  providers: [DaysService],
  exports: [DaysService],
})
export class DaysModule {}
