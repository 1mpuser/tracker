import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { CalDavClient } from '../icloud/caldav.client';
import { ICloudService } from '../icloud/icloud.service';

// Владелец учётных данных интеграций. ICloudService и SessionService живут
// здесь же (провайдером), чтобы избежать цикла модулей: им нужен
// IntegrationsService, а resync-контроллеру — ICloudService.
@Module({
  controllers: [IntegrationsController],
  providers: [CalDavClient, IntegrationsService, ICloudService],
  exports: [IntegrationsService, CalDavClient, ICloudService],
})
export class IntegrationsModule {}
