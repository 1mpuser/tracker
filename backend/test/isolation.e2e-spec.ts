import request from 'supertest';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserBootstrapService } from '../src/auth/user-bootstrap.service';
import { SingleUserGuard } from '../src/auth/single-user.guard';
import { AuthUser } from '../src/auth/auth-user';
import { truncateAll } from './utils';

// Guard, который подменяет SingleUserGuard в этом e2e-файле: пользователь
// берётся из заголовка x-test-user. Так тест изоляции проходит как два
// независимых пользователя до появления настоящих сессий (Task 2.2).
@Injectable()
class TestUserGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const id = Number(req.headers['x-test-user']);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    const current: AuthUser = { id: user.id, email: user.email, timezone: user.timezone };
    req.user = current;
    return true;
  }
}

describe('isolation between users', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let bootstrap: UserBootstrapService;
  let server: any;
  let aId: number;
  let bId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SingleUserGuard)
      .useClass(TestUserGuard)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    bootstrap = app.get(UserBootstrapService);
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    const a = await bootstrap.createUser({ email: 'a@example.com' });
    const b = await bootstrap.createUser({ email: 'b@example.com' });
    aId = a.id;
    bId = b.id;
  });

  const as = (id: number) => ({
    get: (path: string) => request(server).get(path).set('X-Test-User', String(id)),
    post: (path: string) => request(server).post(path).set('X-Test-User', String(id)),
    patch: (path: string) => request(server).patch(path).set('X-Test-User', String(id)),
    delete: (path: string) => request(server).delete(path).set('X-Test-User', String(id)),
  });

  // Пользователь A наполняет данные: сфера, отметка и залипание в дне,
  // GTD-элемент с подзадачей, рутина с отметкой, шаблон задачи, Telegram-чат.
  async function seedA() {
    const catRes = await as(aId).post('/categories').send({ key: 'hobby', label: 'Хобби' });
    expect(catRes.status).toBe(201);
    const catId = catRes.body.id;

    await as(aId).patch('/days/2026-09-01/categories/hobby').send({ done: true }).expect(200);
    await as(aId).patch('/days/2026-09-01/distraction').send({ delta: 10 }).expect(200);

    const itemRes = await as(aId).post('/gtd/items').send({ title: 'Задача A' }).expect(201);
    const itemId = itemRes.body.id;
    await as(aId).post('/gtd/items').send({ title: 'Подзадача A', parentId: itemId }).expect(201);

    await as(aId)
      .post('/routines')
      .send({ title: 'Рутина A', timesPerDay: 1, daysPerWeek: 3, categoryId: catId })
      .expect(201);
    const routines = await as(aId).get('/routines').expect(200);
    const routineId = routines.body.routines[0].id;
    await as(aId).post(`/routines/${routineId}/log`).send({ date: '2026-09-01', count: 1 }).expect(201);

    const tmplRes = await as(aId).post('/task-templates').send({ text: 'Шаблон A' }).expect(201);
    const templateId = tmplRes.body.id;

    const chatRes = await as(aId).post('/telegram/chats').send({ title: 'Чат A', chatId: '-1001' }).expect(201);
    const chatId = chatRes.body.id;

    return { catId, itemId, routineId, templateId, chatId };
  }

  it('B sees only its own data everywhere', async () => {
    await seedA();

    const categories = await as(bId).get('/categories').expect(200);
    expect(categories.body).toHaveLength(5); // только дефолтные B
    expect(categories.body.map((c: any) => c.key)).not.toContain('hobby');

    const day = await as(bId).get('/days/2026-09-01').expect(200);
    const hobby = day.body.categories.find((c: any) => c.key === 'hobby');
    expect(hobby).toBeUndefined();
    expect(day.body.distractionMinutes).toBe(0);
    expect(day.body.pomodoros).toBe(0);

    const history = await as(bId).get('/history?limit=7').expect(200);
    expect(history.body.every((h: any) => h.completed === 0 && !h.distractionOver)).toBe(true);

    const catStats = await as(bId).get('/stats/categories').expect(200);
    expect(catStats.body.every((s: any) => s.doneCount === 0)).toBe(true);

    for (const url of ['/stats/distraction', '/stats/distraction-daily']) {
      const res = await as(bId).get(url).expect(200);
      const field = url === '/stats/distraction' ? 'avgMinutes' : 'minutes';
      expect(res.body.every((s: any) => s[field] === 0)).toBe(true);
    }

    for (const url of [
      '/gtd/items?status=inbox',
      '/gtd/items?status=backlog',
      '/gtd/items?status=calendar',
      '/gtd/items?status=project',
    ]) {
      const res = await as(bId).get(url).expect(200);
      expect(res.body).toHaveLength(0);
    }

    const routines = await as(bId).get('/routines').expect(200);
    expect(routines.body.routines).toHaveLength(0);

    const templates = await as(bId).get('/task-templates').expect(200);
    expect(templates.body).toHaveLength(0);

    const chats = await as(bId).get('/telegram/chats').expect(200);
    expect(chats.body.chats).toHaveLength(0);
  });

  it("B cannot PATCH or DELETE A's records (404) and A stays unchanged", async () => {
    const { catId, itemId, routineId, templateId, chatId } = await seedA();

    await as(bId).patch('/categories/hobby').send({ label: 'Чужое' }).expect(404);

    await as(bId).patch(`/gtd/items/${itemId}`).send({ title: 'Взлом' }).expect(404);
    await as(bId).delete(`/gtd/items/${itemId}`).expect(404);

    await as(bId).patch(`/routines/${routineId}`).send({ title: 'Взлом' }).expect(404);
    await as(bId).delete(`/routines/${routineId}`).expect(404);

    await as(bId).patch(`/task-templates/${templateId}`).send({ text: 'Взлом' }).expect(404);
    await as(bId).delete(`/task-templates/${templateId}`).expect(404);

    await as(bId).delete(`/telegram/chats/${chatId}`).expect(404);

    // у A всё на месте
    const aCategories = await as(aId).get('/categories').expect(200);
    expect(aCategories.body.some((c: any) => c.key === 'hobby' && c.label === 'Хобби')).toBe(true);

    const aItems = await as(aId).get('/gtd/items?status=inbox').expect(200);
    expect(aItems.body.map((i: any) => i.title)).toEqual(['Задача A', 'Подзадача A']);
  });

  it("B cannot attach to A's items: a subtask under A's project fails", async () => {
    const { itemId } = await seedA();

    const res = await as(bId).post('/gtd/items').send({ title: 'Чужая подзадача', parentId: itemId });
    expect([400, 404]).toContain(res.status);

    const aItems = await as(aId).get('/gtd/items?status=inbox').expect(200);
    expect(aItems.body.map((i: any) => i.title)).not.toContain('Чужая подзадача');
  });

  it('B can create a category with the same key as A — keys are per-user', async () => {
    await seedA();

    const res = await as(bId).post('/categories').send({ key: 'hobby', label: 'Хобби B' });
    expect(res.status).toBe(201);
    expect(res.body.label).toBe('Хобби B');
  });
});
