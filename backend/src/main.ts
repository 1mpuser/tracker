import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { GtdService } from './gtd/gtd.service';
import { ObsidianService } from './obsidian/obsidian.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: ['http://localhost:4887', 'https://tracker.performance:4888'] });
  await app.listen(process.env.PORT ?? 3001);

  try {
    const gtd = app.get(GtdService);
    const obsidian = app.get(ObsidianService);
    await obsidian.syncAllReference(await gtd.getItems('reference'));
  } catch (e) {
    // startup export is best-effort; never block boot
    console.warn('Obsidian startup sync skipped:', e);
  }
}
bootstrap();
