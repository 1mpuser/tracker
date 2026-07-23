import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CategoriesModule } from './categories/categories.module';
import { SettingsModule } from './settings/settings.module';
import { DaysModule } from './days/days.module';
import { TaskTemplatesModule } from './task-templates/task-templates.module';
import { StatsModule } from './stats/stats.module';
import { GtdModule } from './gtd/gtd.module';

@Module({
  imports: [
    PrismaModule,
    CategoriesModule,
    SettingsModule,
    DaysModule,
    TaskTemplatesModule,
    StatsModule,
    GtdModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
