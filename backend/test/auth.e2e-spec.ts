import request from 'supertest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { MailerService } from '../src/auth/mailer.service';
import { truncateAll } from './utils';
import { PrismaService } from '../src/prisma/prisma.service';

// Перехватываем письма: в тестах нет ни Resend, ни реальной почты. AuthService
// хранит только хэши токена/кода, поэтому единственный способ узнать их — текст
// письма из мока MailerService.
function mailCapture(app: NestExpressApplication): {
  sent: { to: string; text: string; subject: string }[];
  find: (regex: RegExp) => string | null;
} {
  const box: { to: string; text: string; subject: string }[] = [];
  const mailer = app.get(MailerService);
  (mailer as any).send = jest.fn().mockImplementation(async (to: string, m: { subject: string; text: string }) => {
    box.push({ to, text: m.text, subject: m.subject });
  });
  return {
    sent: box,
    find: (re: RegExp) => box.map((m) => m.text).find((t) => re.test(t)) ?? null,
  };
}

describe('auth e2e', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let mails: ReturnType<typeof mailCapture>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    mails = mailCapture(app);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    mails.sent.length = 0;
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

  it('полный цикл: регистрация → письмо → подтверждение по токену → /auth/me', async () => {
    const server = app.getHttpServer();
    await request(server).post('/auth/register').send({ email: 'NEW@example.com', password: 'password123' }).expect(204);

    const text = mails.find(/\/register\/confirm\?token=/);
    expect(text).toBeTruthy();
    const token = text!.match(/token=([^\s]+)/)![1];

    const confirm = await request(server).post('/auth/register/confirm').send({ token });
    expect(confirm.status).toBe(200);
    expect(confirm.body.user.email).toBe('new@example.com');
    const cookie = confirm.headers['set-cookie']?.[0] as string;
    expect(cookie).toContain('sid=');

    const agent = request.agent(server);
    await agent.post('/auth/login').send({ email: 'new@example.com', password: 'password123' }).expect(200);
    const me = await agent.get('/auth/me').expect(200);
    expect(me.body.user.email).toBe('new@example.com');
  });

  it('подтверждение по коду из письма', async () => {
    const server = app.getHttpServer();
    await request(server).post('/auth/register').send({ email: 'code@example.com', password: 'password123' }).expect(204);

    const text = mails.find(/введите код/);
    const code = text!.match(/\b(\d{6})\b/)![1];

    const res = await request(server).post('/auth/register/confirm').send({ email: 'code@example.com', code });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('code@example.com');
  });

  it('повторная регистрация известного адреса шлёт письмо-предупреждение, а не подтверждение', async () => {
    const server = app.getHttpServer();
    await request(server).post('/auth/register').send({ email: 'dup@example.com', password: 'password123' }).expect(204);
    const text = mails.find(/\/register\/confirm\?token=/)!;
    const token = text.match(/token=([^\s]+)/)![1];
    await request(server).post('/auth/register/confirm').send({ token }).expect(200);

    mails.sent.length = 0;
    await request(server).post('/auth/register').send({ email: 'dup@example.com', password: 'otherpass123' }).expect(204);

    expect(await prisma.user.count()).toBe(1);
    expect(mails.sent.length).toBe(1);
    expect(mails.sent[0].subject).toContain('регистрации');
  });

  it('неверный пароль после повторной смены — 401, стартовая кука протухает', async () => {
    const server = app.getHttpServer();
    const agent = request.agent(server);
    await request(server).post('/auth/register').send({ email: 'pw@example.com', password: 'password123' }).expect(204);
    const text = mails.find(/\/register\/confirm\?token=/)!;
    const token = text.match(/token=([^\s]+)/)![1];
    await agent.post('/auth/register/confirm').send({ token }).expect(200);

    const reset = await request(server).post('/auth/forgot').send({ email: 'pw@example.com' }).expect(204);
    expect(reset.status).toBe(204);
    const resetText = mails.find(/\/reset\?token=/);
    expect(resetText).toBeTruthy();
    const resetToken = resetText!.match(/token=([^\s]+)/)![1];

    await request(server).post('/auth/reset').send({ token: resetToken, password: 'newpassword456' }).expect(200);

    // старая сессия закрыта сбросом
    await agent.get('/auth/me').expect(401);
  });

  it('смена пароля закрывает остальные сессии', async () => {
    const server = app.getHttpServer();
    await request(server).post('/auth/register').send({ email: 'two@example.com', password: 'password123' }).expect(204);
    const text = mails.find(/\/register\/confirm\?token=/)!;
    const token = text.match(/token=([^\s]+)/)![1];
    await request(server).post('/auth/register/confirm').send({ token }).expect(200);

    const a = request.agent(server);
    await a.post('/auth/login').send({ email: 'two@example.com', password: 'password123' }).expect(200);
    const b = request.agent(server);
    await b.post('/auth/login').send({ email: 'two@example.com', password: 'password123' }).expect(200);

    await a.post('/auth/password').send({ current: 'password123', next: 'brandnew789' }).expect(204);

    await a.get('/auth/me').expect(200);
    await b.get('/auth/me').expect(401);
  });
});
