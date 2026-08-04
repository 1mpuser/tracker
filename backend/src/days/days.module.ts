import { Module } from '@nestjs/common';
import { DaysController } from './days.controller';
import { DaysService } from './days.service';
import { CategoriesModule } from '../categories/categories.module';
import { GtdModule } from '../gtd/gtd.module';
import { TelegramModule } from '../telegram/telegram.module';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [CategoriesModule, GtdModule, TelegramModule, SessionModule],
  controllers: [DaysController],
  providers: [DaysService],
  exports: [DaysService],
})
export class DaysModule {}
