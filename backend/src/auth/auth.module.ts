import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UserBootstrapService } from './user-bootstrap.service';
import { SingleUserGuard } from './single-user.guard';

@Module({
  providers: [
    UserBootstrapService,
    SingleUserGuard,
    // useExisting, а не useClass: e2e может переопределить SingleUserGuard
    // через overrideProvider и подменить глобальный guard целиком.
    { provide: APP_GUARD, useExisting: SingleUserGuard },
  ],
  exports: [UserBootstrapService],
})
export class AuthModule {}
