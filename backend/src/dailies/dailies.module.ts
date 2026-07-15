import { Module } from '@nestjs/common';
import { DailiesController } from './dailies.controller';
import { DailiesService } from './dailies.service';
import { DaysModule } from '../days/days.module';

@Module({
  imports: [DaysModule],
  controllers: [DailiesController],
  providers: [DailiesService],
})
export class DailiesModule {}
