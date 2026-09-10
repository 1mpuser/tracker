import request from 'supertest';
import { createApp } from './utils';
import type { NestExpressApplication } from '@nestjs/platform-express';

describe('smoke', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health answers 200', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
  });
});
