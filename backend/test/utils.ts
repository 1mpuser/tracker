import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserBootstrapService } from '../src/auth/user-bootstrap.service';
import { hashPassword } from '../src/auth/password.util';

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

// Логинит пользователя (создавая его с паролем, если ещё нет) и возвращает
// supertest-агента с cookie сессии. Заменяет x-test-user-хак из Фазы 1.
export async function loginAs(
  app: NestExpressApplication,
  email: string,
  password = 'password123',
): Promise<any> {
  const prisma = app.get(PrismaService);
  const bootstrap = app.get(UserBootstrapService);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await bootstrap.createUser({ email, passwordHash: await hashPassword(password) });
  }
  const agent = request.agent(app.getHttpServer());
  const res = await agent.post('/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return agent;
}
