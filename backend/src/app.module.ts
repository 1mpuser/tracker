import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CategoriesModule } from './categories/categories.module';
import { SettingsModule } from './settings/settings.module';
import { DaysModule } from './days/days.module';
import { TaskTemplatesModule } from './task-templates/task-templates.module';
import { StatsModule } from './stats/stats.module';
import { GtdModule } from './gtd/gtd.module';
import { RoutinesModule } from './routines/routines.module';
import { TelegramModule } from './telegram/telegram.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

// Объектная форма (не массив) нужна, чтобы общий skipIf уходил в
// commonOptions и действовал и на глобальный лимит, и на @Throttle-оверрайды.
// Флаг E2E_DISABLE_THROTTLE выставляет скрипт test:e2e: иначе каждый тест,
// логинящийся заново, упирался бы в лимит на вход. Проверяется на каждый
// запрос, поэтому отдельный e2e-тест может на время снять флаг и проверить 429.
const isThrottleDisabled = () => process.env.E2E_DISABLE_THROTTLE === 'true';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AdminModule,
    // Глобальный мягкий лимит; жёсткие @Throttle — на /auth-эндпоинтах.
    ThrottlerModule.forRoot({
      skipIf: isThrottleDisabled,
      throttlers: [{ ttl: 60_000, limit: 100 }],
    }),
    CategoriesModule,
    SettingsModule,
    DaysModule,
    TaskTemplatesModule,
    StatsModule,
    GtdModule,
    RoutinesModule,
    TelegramModule,
    IntegrationsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
