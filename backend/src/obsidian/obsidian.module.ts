import { Module } from '@nestjs/common';
import { ObsidianService } from './obsidian.service';

@Module({
  providers: [ObsidianService],
  exports: [ObsidianService],
})
export class ObsidianModule {}
