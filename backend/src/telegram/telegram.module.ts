import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramConfigService } from './telegram-config.service';
import { TelegramDeliveryService } from './telegram-delivery.service';
import { TelegramController } from './telegram.controller';

@Module({
  controllers: [TelegramController],
  providers: [TelegramService, TelegramConfigService, TelegramDeliveryService],
  exports: [TelegramService, TelegramConfigService, TelegramDeliveryService],
})
export class TelegramModule {}
