import { execSync } from 'node:child_process';

// Приводит тестовую БД к схеме из миграций перед всем e2e-запуском.
// `migrate deploy` не трогает данные (в отличие от `migrate reset`), а e2e-тесты
// и так чистят все таблицы в каждом beforeEach через truncateAll().
export default async function setup() {
  const url =
    process.env.DATABASE_URL_TEST ?? 'postgresql://tracker:tracker@localhost:5434/tracker_test';
  process.env.DATABASE_URL = url;
  execSync('bunx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}
