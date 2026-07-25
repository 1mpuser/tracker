import { Module } from '@nestjs/common';
import { ICloudService } from './icloud.service';

@Module({
  providers: [ICloudService],
  exports: [ICloudService],
})
export class ICloudModule {}
