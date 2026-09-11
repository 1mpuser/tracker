import request from 'supertest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { truncateAll, loginAs } from './utils';
import { PrismaService } from '../src/prisma/prisma.service';

describe('auth e2e', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('блокирует эндпоинты данных без куки, но отдаёт /health', async () => {
    const server = app.getHttpServer();
    await request(server).get('/categories').expect(401);
    await request(server).get('/gtd/items').expect(401);
    await request(server).get('/health').expect(200);
  });

  it('удалённые эндпоинты регистрации и сброса пароля отвечают 404', async () => {
    const server = app.getHttpServer();
    const removed: [string, object][] = [
      ['/auth/register', { email: 'new@example.com', password: 'password123' }],
      ['/auth/register/confirm', { token: 'abc' }],
      ['/auth/register/resend', { email: 'new@example.com' }],
      ['/auth/forgot', { email: 'new@example.com' }],
      ['/auth/reset', { token: 'abc', password: 'password123' }],
    ];
    for (const [path, body] of removed) {
      await request(server).post(path).send(body).expect(404);
    }
  });

  it('вход, /auth/me, выход и 401 без куки', async () => {
    const server = app.getHttpServer();
    await loginAs(app, 'user@example.com');

    const agent = request.agent(server);
    await agent.post('/auth/login').send({ email: 'user@example.com', password: 'password123' }).expect(200);
    const me = await agent.get('/auth/me').expect(200);
    expect(me.body.user.email).toBe('user@example.com');

    // После выхода та же кука больше не работает.
    await agent.post('/auth/logout').expect(204);
    await agent.get('/auth/me').expect(401);

    // Без куки — 401.
    await request(server).get('/auth/me').expect(401);
  });

  it('смена пароля закрывает остальные сессии', async () => {
    const server = app.getHttpServer();
    await loginAs(app, 'two@example.com');

    const a = request.agent(server);
    await a.post('/auth/login').send({ email: 'two@example.com', password: 'password123' }).expect(200);
    const b = request.agent(server);
    await b.post('/auth/login').send({ email: 'two@example.com', password: 'password123' }).expect(200);

    await a.post('/auth/password').send({ current: 'password123', next: 'brandnew789' }).expect(204);

    await a.get('/auth/me').expect(200);
    await b.get('/auth/me').expect(401);

    // Новый пароль заходит, старый — нет.
    const c = request.agent(server);
    await c.post('/auth/login').send({ email: 'two@example.com', password: 'brandnew789' }).expect(200);
    await request(server).post('/auth/login').send({ email: 'two@example.com', password: 'password123' }).expect(401);
  });

  it('«выйти везде» закрывает все сессии пользователя', async () => {
    const server = app.getHttpServer();
    await loginAs(app, 'all@example.com');

    const a = request.agent(server);
    await a.post('/auth/login').send({ email: 'all@example.com', password: 'password123' }).expect(200);
    const b = request.agent(server);
    await b.post('/auth/login').send({ email: 'all@example.com', password: 'password123' }).expect(200);

    await a.post('/auth/logout-all').expect(204);
    await a.get('/auth/me').expect(401);
    await b.get('/auth/me').expect(401);
  });
});
