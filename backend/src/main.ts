import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { GtdService } from './gtd/gtd.service';
import { ObsidianService } from './obsidian/obsidian.service';
import { ICloudService } from './icloud/icloud.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: ['http://localhost:4887', 'https://tracker.performance:4888'] });
  await app.listen(process.env.PORT ?? 3001);

  try {
    const gtd = app.get(GtdService);
    const obsidian = app.get(ObsidianService);
    await obsidian.syncAllReference(await gtd.getItems('reference'));

    const icloud = app.get(ICloudService);
    await icloud.syncAllOnStartup(await gtd.getItems());
  } catch (e) {
    // startup export/sync is best-effort; never block boot
    console.warn('Startup sync skipped:', e);
  }
}
bootstrap();
