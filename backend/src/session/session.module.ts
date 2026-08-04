import { Module } from '@nestjs/common';
import { SessionService } from './session.service';
import { ICloudModule } from '../icloud/icloud.module';

@Module({
  imports: [ICloudModule],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
