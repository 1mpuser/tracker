import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApp, loginAs, truncateAll } from './utils';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserBootstrapService } from '../src/auth/user-bootstrap.service';
import { hashPassword } from '../src/auth/password.util';

// Скрипт test:e2e выставляет E2E_DISABLE_THROTTLE=true, чтобы лимиты не мешали
// тестам, которые логинятся заново в каждом beforeEach. Этот спек — единственное
// место, где флаг на время снимается: лимит на вход (5/мин) должен по-настоящему
// возвращать 429.
describe('throttle e2e', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('частые попытки входа получают 429 (флаг снимается только здесь и возвращается в finally)', async () => {
    const bootstrap = app.get(UserBootstrapService);
    // Пользователя создаём напрямую, без входа: лимит на вход не тратим заранее.
    await bootstrap.createUser({ email: 'throttle@example.com', passwordHash: await hashPassword('password123') });
    const server = app.getHttpServer();

    process.env.E2E_DISABLE_THROTTLE = 'false';
    try {
      // 5 успешных входов в пределах минуты — дальше 429.
      for (let i = 0; i < 5; i++) {
        const res = await request(server)
          .post('/auth/login')
          .send({ email: 'throttle@example.com', password: 'password123' });
        expect(res.status).toBe(200);
      }
      const sixth = await request(server)
        .post('/auth/login')
        .send({ email: 'throttle@example.com', password: 'password123' });
      expect(sixth.status).toBe(429);
    } finally {
      process.env.E2E_DISABLE_THROTTLE = 'true';
    }
  });

  // После снятия флага в предыдущем тесте его нужно было вернуть — иначе
  // остальные спеки упирались бы в лимит на вход.
  it('после теста с 429 флаг снова отключает лимиты (вход сходится)', async () => {
    const agent = await loginAs(app, 'after-throttle@example.com');
    await agent.get('/auth/me').expect(200);
    expect(process.env.E2E_DISABLE_THROTTLE).toBe('true');
  });
});
