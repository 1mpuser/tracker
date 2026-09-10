import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramConfigService } from './telegram-config.service';
import { TelegramController } from './telegram.controller';

@Module({
  controllers: [TelegramController],
  providers: [TelegramService, TelegramConfigService],
  exports: [TelegramService, TelegramConfigService],
})
export class TelegramModule {}
