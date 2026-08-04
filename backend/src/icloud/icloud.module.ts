import { Module } from '@nestjs/common';
import { ICloudService } from './icloud.service';
import { CalDavClient } from './caldav.client';

@Module({
  providers: [CalDavClient, ICloudService],
  exports: [CalDavClient, ICloudService],
})
export class ICloudModule {}
