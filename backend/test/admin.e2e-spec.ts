import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApp, loginAs, truncateAll } from './utils';
import { PrismaService } from '../src/prisma/prisma.service';

// Админа в e2e назначаем прямым обновлением через Prisma (по решению задачи),
// loginAs не трогаем: интерфейсом админов не назначают.
async function promote(app: NestExpressApplication, email: string): Promise<void> {
  const prisma = app.get(PrismaService);
  await prisma.user.update({ where: { email }, data: { isAdmin: true } });
}

describe('admin e2e', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let server: any;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('обычный пользователь получает 404 на все /admin/* и не виден админом в /auth/me', async () => {
    const agent = await loginAs(app, 'user@example.com');

    await agent.get('/admin/users').expect(404);
    await agent.post('/admin/users').send({ email: 'x@y.z', password: 'password123' }).expect(404);
    await agent.post('/admin/users/1/password').send({ password: 'brandnew789' }).expect(404);
    await agent.post('/admin/users/1/block').expect(404);
    await agent.post('/admin/users/1/unblock').expect(404);
    await agent.delete('/admin/users/1').expect(404);

    const me = await agent.get('/auth/me').expect(200);
    expect(me.body.user.isAdmin).toBe(false);
  });

  it('админ создаёт учётку, та входит с выданным паролем и видит пустой, но валидный аккаунт', async () => {
    await loginAs(app, 'admin@example.com');
    await promote(app, 'admin@example.com');

    const admin = request.agent(server);
    await admin.post('/auth/login').send({ email: 'admin@example.com', password: 'password123' }).expect(200);
    const me = await admin.get('/auth/me').expect(200);
    expect(me.body.user.isAdmin).toBe(true);

    const created = await admin
      .post('/admin/users')
      .send({ email: 'fresh@example.com', password: 'issuedpass123', timezone: 'Europe/Moscow' })
      .expect(201);
    expect(created.body.email).toBe('fresh@example.com');
    expect(created.body.isAdmin).toBe(false);
    expect(created.body.timezone).toBe('Europe/Moscow');

    const fresh = request.agent(server);
    await fresh.post('/auth/login').send({ email: 'fresh@example.com', password: 'issuedpass123' }).expect(200);
    const freshMe = await fresh.get('/auth/me').expect(200);
    expect(freshMe.body.user.email).toBe('fresh@example.com');
    expect(freshMe.body.user.isAdmin).toBe(false);

    // Пустой, но валидный аккаунт: дефолтные сферы на месте, данных пока нет.
    const day = await fresh.get('/days/2026-09-11').expect(200);
    expect(day.body.categories.length).toBeGreaterThan(0);
    expect(day.body.today).toEqual([]);
    const settings = await fresh.get('/settings').expect(200);
    expect(settings.body.icloudEnabled).toBe(false);
  });

  it('занятая почта → 409 второй раз, пустое создание не затирает списка', async () => {
    await loginAs(app, 'admin@example.com');
    await promote(app, 'admin@example.com');
    const admin = request.agent(server);
    await admin.post('/auth/login').send({ email: 'admin@example.com', password: 'password123' }).expect(200);

    await admin.post('/admin/users').send({ email: 'dup@example.com', password: 'password123' }).expect(201);
    // И в верхнем, и в нижнем регистре — одна и та же почта.
    await admin
      .post('/admin/users')
      .send({ email: ' DUP@Example.COM ', password: 'password123' })
      .expect(409);

    const list = await admin.get('/admin/users').expect(200);
    expect(list.body.filter((u: any) => u.email === 'dup@example.com')).toHaveLength(1);
  });

  it('блокировка: живая сессия сразу получает 401, войти нельзя; после разблокировки — можно', async () => {
    await loginAs(app, 'admin@example.com');
    await promote(app, 'admin@example.com');
    const admin = request.agent(server);
    await admin.post('/auth/login').send({ email: 'admin@example.com', password: 'password123' }).expect(200);

    await loginAs(app, 'victim@example.com');
    const victim = request.agent(server);
    await victim.post('/auth/login').send({ email: 'victim@example.com', password: 'password123' }).expect(200);
    await victim.get('/auth/me').expect(200);

    const victimUser = await prisma.user.findUnique({ where: { email: 'victim@example.com' } });

    await admin.post(`/admin/users/${victimUser!.id}/block`).expect(204);

    // Живая сессия заблокированного перестаёт работать сразу.
    await victim.get('/auth/me').expect(401);
    await victim.get('/categories').expect(401);
    // И войти он не может (тот же 401, что и на неверный пароль).
    await request(server)
      .post('/auth/login')
      .send({ email: 'victim@example.com', password: 'password123' })
      .expect(401);

    await admin.post(`/admin/users/${victimUser!.id}/unblock`).expect(204);
    const again = request.agent(server);
    await again.post('/auth/login').send({ email: 'victim@example.com', password: 'password123' }).expect(200);
    await again.get('/auth/me').expect(200);
  });

  it('смена пароля админом: старая сессия 401, новый пароль работает', async () => {
    await loginAs(app, 'admin@example.com');
    await promote(app, 'admin@example.com');
    const admin = request.agent(server);
    await admin.post('/auth/login').send({ email: 'admin@example.com', password: 'password123' }).expect(200);

    await loginAs(app, 'victim@example.com');
    const victim = request.agent(server);
    await victim.post('/auth/login').send({ email: 'victim@example.com', password: 'password123' }).expect(200);
    await victim.get('/auth/me').expect(200);

    const victimUser = await prisma.user.findUnique({ where: { email: 'victim@example.com' } });

    await admin
      .post(`/admin/users/${victimUser!.id}/password`)
      .send({ password: 'brandnew789' })
      .expect(204);

    // Старая сессия и старый пароль мертвы.
    await victim.get('/auth/me').expect(401);
    await request(server)
      .post('/auth/login')
      .send({ email: 'victim@example.com', password: 'password123' })
      .expect(401);
    const fresh = request.agent(server);
    await fresh.post('/auth/login').send({ email: 'victim@example.com', password: 'brandnew789' }).expect(200);
    await fresh.get('/auth/me').expect(200);
  });

  it('админ не может заблокировать или удалить себя → 400', async () => {
    await loginAs(app, 'admin@example.com');
    await promote(app, 'admin@example.com');
    const admin = request.agent(server);
    await admin.post('/auth/login').send({ email: 'admin@example.com', password: 'password123' }).expect(200);

    const adminUser = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
    await admin.post(`/admin/users/${adminUser!.id}/block`).expect(400);
    await admin.delete(`/admin/users/${adminUser!.id}`).expect(400);

    // Админ жив и всё ещё может управлять учётками.
    await admin.get('/auth/me').expect(200);
    const list = await admin.get('/admin/users').expect(200);
    expect(list.body.some((u: any) => u.email === 'admin@example.com')).toBe(true);
  });

  it('удаление: данных удалённого нет, данные админа и третьего пользователя на месте', async () => {
    await loginAs(app, 'admin@example.com');
    await promote(app, 'admin@example.com');
    await loginAs(app, 'third@example.com');
    await loginAs(app, 'victim@example.com');

    const admin = request.agent(server);
    await admin.post('/auth/login').send({ email: 'admin@example.com', password: 'password123' }).expect(200);
    const third = request.agent(server);
    await third.post('/auth/login').send({ email: 'third@example.com', password: 'password123' }).expect(200);
    const victim = request.agent(server);
    await victim.post('/auth/login').send({ email: 'victim@example.com', password: 'password123' }).expect(200);

    // Каждая учётка пишет собственные данные.
    await admin.patch('/days/2026-09-01').send({ rating: 5 }).expect(200);
    await victim.patch('/days/2026-09-02').send({ rating: 3 }).expect(200);
    await third.patch('/days/2026-09-03').send({ rating: 4 }).expect(200);

    const victimRow = await prisma.user.findUnique({ where: { email: 'victim@example.com' } });
    const adminRow = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });

    await admin.delete(`/admin/users/${victimRow!.id}`).expect(204);
    // Сессия удалённого больше не работает.
    await victim.get('/auth/me').expect(401);

    // Данных удалённого нет, админ и третий не задеты.
    await expect(prisma.user.findUnique({ where: { id: victimRow!.id } })).resolves.toBeNull();
    expect(await prisma.day.count({ where: { userId: victimRow!.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: victimRow!.id } })).toBe(0);
    expect(await prisma.day.count({ where: { userId: adminRow!.id } })).toBe(1);
    expect(await prisma.day.count({ where: { userId: (await prisma.user.findUnique({ where: { email: 'third@example.com' } }))!.id } })).toBe(1);

    const list = await admin.get('/admin/users').expect(200);
    expect(list.body.some((u: any) => u.email === 'victim@example.com')).toBe(false);
    expect(list.body.some((u: any) => u.email === 'admin@example.com')).toBe(true);
    expect(list.body.some((u: any) => u.email === 'third@example.com')).toBe(true);
  });
});
