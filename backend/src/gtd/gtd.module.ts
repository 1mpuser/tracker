import { Module } from '@nestjs/common';
import { GtdController } from './gtd.controller';
import { GtdService } from './gtd.service';
import { ObsidianModule } from '../obsidian/obsidian.module';
import { ICloudModule } from '../icloud/icloud.module';

@Module({
  imports: [ObsidianModule, ICloudModule],
  controllers: [GtdController],
  providers: [GtdService],
  exports: [GtdService],
})
export class GtdModule {}
