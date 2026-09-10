import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

// Поднимает реальное приложение (тот же AppModule, что и прод) под supertest.
export async function createApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}

// Полная очистка между тестами: всё, кроме служебной таблицы миграций.
export async function truncateAll(prisma: PrismaService): Promise<void> {
  const rows: { tablename: string }[] = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  const names = rows.map((r) => `"${r.tablename}"`).join(', ');
  if (names) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
  }
}
