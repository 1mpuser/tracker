import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApp, loginAs, truncateAll } from './utils';
import { PrismaService } from '../src/prisma/prisma.service';

// Пустой аккаунт: новый пользователь без данных и интеграций, все экранные
// GET должны отвечать 200 и валидными пустыми структурами — никаких падений,
// NaN или графиков без подписи.
describe('empty account renders sensibly', () => {
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

  it('все экранные GET нового пользователя — 200 и пустые структуры', async () => {
    const agent = await loginAs(app, 'fresh@example.com');
    const server = app.getHttpServer();

    const day = await agent.get('/days/2026-09-11').expect(200);
    expect(day.body).toMatchObject({
      distractionMinutes: 0,
      pomodoros: 0,
      eveningClosed: false,
      rating: null,
      categories: expect.any(Array),
      today: [],
    });

    const history = await agent.get('/history?limit=14').expect(200);
    expect(history.body).toHaveLength(14);
    for (const entry of history.body) {
      expect(entry).toMatchObject({ completed: 0, total: 5, pomodoros: 0, distractionOver: false });
    }

    const catStats = await agent.get('/stats/categories').expect(200);
    expect(catStats.body).toHaveLength(5);
    expect(catStats.body.every((s: any) => s.doneCount === 0)).toBe(true);

    for (const url of ['/stats/distraction', '/stats/distraction-daily']) {
      const res = await agent.get(url).expect(200);
      expect(res.body.length).toBeGreaterThan(0);
    }

    const week = await agent.get('/stats/week').expect(200);
    expect(week.body.days).toHaveLength(7);
    expect(week.body.totalPomodoros).toBe(0);

    for (const url of [
      '/gtd/items',
      '/gtd/items?status=inbox',
      '/gtd/items?status=backlog',
      '/gtd/items?status=project',
    ]) {
      const res = await agent.get(url).expect(200);
      expect(res.body).toEqual([]);
    }

    const routines = await agent.get('/routines').expect(200);
    expect(routines.body.routines).toEqual([]);

    const historyWeeks = await agent.get('/routines/history?weeks=2').expect(200);
    expect(historyWeeks.body.length).toBeGreaterThan(0);

    const templates = await agent.get('/task-templates').expect(200);
    expect(templates.body).toEqual([]);

    const telegram = await agent.get('/telegram/bot').expect(200);
    expect(telegram.body.configured).toBe(false);

    const chats = await agent.get('/telegram/chats').expect(200);
    expect(chats.body.chats).toEqual([]);

    const icloud = await agent.get('/integrations/icloud').expect(200);
    expect(icloud.body.configured).toBe(false);

    const session = await agent.get('/integrations/session').expect(200);
    expect(session.body.configured).toBe(false);

    const settings = await agent.get('/settings').expect(200);
    expect(settings.body.icloudEnabled).toBe(false);
    expect(settings.body.sessionSyncEnabled).toBe(false);

    const me = await agent.get('/auth/me').expect(200);
    expect(me.body.user.email).toBe('fresh@example.com');
    void request;
  });
});
