import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CategoriesModule } from './categories/categories.module';
import { SettingsModule } from './settings/settings.module';
import { DaysModule } from './days/days.module';
import { DailiesModule } from './dailies/dailies.module';
import { TaskTemplatesModule } from './task-templates/task-templates.module';

@Module({
  imports: [
    PrismaModule,
    CategoriesModule,
    SettingsModule,
    DaysModule,
    DailiesModule,
    TaskTemplatesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
