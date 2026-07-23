import { Module } from '@nestjs/common';
import { GtdController } from './gtd.controller';
import { GtdService } from './gtd.service';

@Module({
  controllers: [GtdController],
  providers: [GtdService],
})
export class GtdModule {}
