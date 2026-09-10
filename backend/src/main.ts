import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { GtdService } from './gtd/gtd.service';
import { ObsidianService } from './obsidian/obsidian.service';
import { ICloudService } from './icloud/icloud.service';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  await app.listen(process.env.PORT ?? 3001);

  try {
    // Стартовый синк идёт по всем пользователям: у каждого своя учётка iCloud
    // (пока из env; после Task 3.3 — из настроек). Ошибка одного не мешает
    // остальным — startup sync по-прежнему best-effort.
    const prisma = app.get(PrismaService);
    const gtd = app.get(GtdService);
    const obsidian = app.get(ObsidianService);
    const icloud = app.get(ICloudService);
    const users = await prisma.user.findMany();
    for (const user of users) {
      await obsidian.syncAllReference(user.id, await gtd.getItems(user.id, 'reference'));
      await icloud.syncAllOnStartup(user.id, await gtd.getItems(user.id));
    }
  } catch (e) {
    // startup export/sync is best-effort; never block boot
    console.warn('Startup sync skipped:', e);
  }
}
bootstrap();
