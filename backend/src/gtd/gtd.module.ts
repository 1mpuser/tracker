import { Module } from '@nestjs/common';
import { GtdController } from './gtd.controller';
import { GtdService } from './gtd.service';
import { ObsidianModule } from '../obsidian/obsidian.module';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [ObsidianModule, IntegrationsModule],
  controllers: [GtdController],
  providers: [GtdService],
  exports: [GtdService],
})
export class GtdModule {}
