import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApp, loginAs, truncateAll } from './utils';
import { PrismaService } from '../src/prisma/prisma.service';

describe('isolation between users (session cookies)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let a: any;
  let b: any;
  let aId: number;
  let bId: number;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    a = await loginAs(app, 'a@example.com');
    b = await loginAs(app, 'b@example.com');
    const aUser = await prisma.user.findUniqueOrThrow({ where: { email: 'a@example.com' } });
    const bUser = await prisma.user.findUniqueOrThrow({ where: { email: 'b@example.com' } });
    aId = aUser.id;
    bId = bUser.id;
  });

  // Пользователь A наполняет данные: сфера, отметка и залипание в дне,
  // GTD-элемент с подзадачей, рутина с отметкой, шаблон задачи, Telegram-чат.
  async function seedA() {
    const catRes = await a.post('/categories').send({ key: 'hobby', label: 'Хобби' });
    expect(catRes.status).toBe(201);
    const catId = catRes.body.id;

    await a.patch('/days/2026-09-01/categories/hobby').send({ done: true }).expect(200);
    await a.patch('/days/2026-09-01/distraction').send({ delta: 10 }).expect(200);

    const itemRes = await a.post('/gtd/items').send({ title: 'Задача A' }).expect(201);
    const itemId = itemRes.body.id;
    await a.post('/gtd/items').send({ title: 'Подзадача A', parentId: itemId }).expect(201);

    await a
      .post('/routines')
      .send({ title: 'Рутина A', timesPerDay: 1, daysPerWeek: 3, categoryId: catId })
      .expect(201);
    const routines = await a.get('/routines').expect(200);
    const routineId = routines.body.routines[0].id;
    await a.post(`/routines/${routineId}/log`).send({ date: '2026-09-01', count: 1 }).expect(201);

    const tmplRes = await a.post('/task-templates').send({ text: 'Шаблон A' }).expect(201);
    const templateId = tmplRes.body.id;

    const chatRes = await a.post('/telegram/chats').send({ title: 'Чат A', chatId: '-1001' }).expect(201);
    const chatId = chatRes.body.id;

    return { catId, itemId, routineId, templateId, chatId };
  }

  it('B sees only its own data everywhere', async () => {
    await seedA();

    const categories = await b.get('/categories').expect(200);
    expect(categories.body).toHaveLength(5); // только дефолтные B
    expect(categories.body.map((c: any) => c.key)).not.toContain('hobby');

    const day = await b.get('/days/2026-09-01').expect(200);
    const hobby = day.body.categories.find((c: any) => c.key === 'hobby');
    expect(hobby).toBeUndefined();
    expect(day.body.distractionMinutes).toBe(0);
    expect(day.body.pomodoros).toBe(0);

    const history = await b.get('/history?limit=7').expect(200);
    expect(history.body.every((h: any) => h.completed === 0 && !h.distractionOver)).toBe(true);

    const catStats = await b.get('/stats/categories').expect(200);
    expect(catStats.body.every((s: any) => s.doneCount === 0)).toBe(true);

    for (const url of ['/stats/distraction', '/stats/distraction-daily']) {
      const res = await b.get(url).expect(200);
      const field = url === '/stats/distraction' ? 'avgMinutes' : 'minutes';
      expect(res.body.every((s: any) => s[field] === 0)).toBe(true);
    }

    for (const url of [
      '/gtd/items?status=inbox',
      '/gtd/items?status=backlog',
      '/gtd/items?status=calendar',
      '/gtd/items?status=project',
    ]) {
      const res = await b.get(url).expect(200);
      expect(res.body).toHaveLength(0);
    }

    const routines = await b.get('/routines').expect(200);
    expect(routines.body.routines).toHaveLength(0);

    const templates = await b.get('/task-templates').expect(200);
    expect(templates.body).toHaveLength(0);

    const chats = await b.get('/telegram/chats').expect(200);
    expect(chats.body.chats).toHaveLength(0);
  });

  it("B cannot PATCH or DELETE A's records (404) and A stays unchanged", async () => {
    const { catId, itemId, routineId, templateId, chatId } = await seedA();

    await b.patch('/categories/hobby').send({ label: 'Чужое' }).expect(404);

    await b.patch(`/gtd/items/${itemId}`).send({ title: 'Взлом' }).expect(404);
    await b.delete(`/gtd/items/${itemId}`).expect(404);

    await b.patch(`/routines/${routineId}`).send({ title: 'Взлом' }).expect(404);
    await b.delete(`/routines/${routineId}`).expect(404);

    await b.patch(`/task-templates/${templateId}`).send({ text: 'Взлом' }).expect(404);
    await b.delete(`/task-templates/${templateId}`).expect(404);

    await b.delete(`/telegram/chats/${chatId}`).expect(404);

    // у A всё на месте
    const aCategories = await a.get('/categories').expect(200);
    expect(aCategories.body.some((c: any) => c.key === 'hobby' && c.label === 'Хобби')).toBe(true);

    const aItems = await a.get('/gtd/items?status=inbox').expect(200);
    expect(aItems.body.map((i: any) => i.title)).toEqual(['Задача A', 'Подзадача A']);
  });

  it("B cannot attach to A's items: a subtask under A's project fails", async () => {
    const { itemId } = await seedA();

    const res = await b.post('/gtd/items').send({ title: 'Чужая подзадача', parentId: itemId });
    expect([400, 404]).toContain(res.status);

    const aItems = await a.get('/gtd/items?status=inbox').expect(200);
    expect(aItems.body.map((i: any) => i.title)).not.toContain('Чужая подзадача');
  });

  it('B can create a category with the same key as A — keys are per-user', async () => {
    await seedA();

    const res = await b.post('/categories').send({ key: 'hobby', label: 'Хобби B' });
    expect(res.status).toBe(201);
    expect(res.body.label).toBe('Хобби B');
  });
});
