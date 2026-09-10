import { Module } from '@nestjs/common';
import { SessionService } from './session.service';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [IntegrationsModule],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
