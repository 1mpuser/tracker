import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UserBootstrapService } from './user-bootstrap.service';
import { AuthService } from './auth.service';
import { MailerService } from './mailer.service';
import { SessionGuard } from './session.guard';
import { AuthController } from './auth.controller';
import { AUTH_CONFIG, loadAuthConfig } from './auth.config';

@Module({
  controllers: [AuthController],
  providers: [
    UserBootstrapService,
    AuthService,
    MailerService,
    SessionGuard,
    // AUTH_CONFIG грузится фабрикой: loadAuthConfig() бросает в production без
    // обязательных переменных — приложение упадёт при старте, а не в момент
    // первой регистрации.
    { provide: AUTH_CONFIG, useFactory: () => loadAuthConfig() },
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [UserBootstrapService, AuthService],
})
export class AuthModule {}
