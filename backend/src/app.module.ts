import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CategoriesModule } from './categories/categories.module';
import { SettingsModule } from './settings/settings.module';
import { DaysModule } from './days/days.module';

@Module({
  imports: [PrismaModule, CategoriesModule, SettingsModule, DaysModule],
  controllers: [AppController],
})
export class AppModule {}
