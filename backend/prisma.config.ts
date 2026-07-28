import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Plain process.env, not Prisma's `env()` helper — `env()` throws immediately
// if the variable is unset, which breaks `prisma generate` in the Docker
// build stage (no DATABASE_URL there; only `migrate`/introspect need a real
// connection string, and those always run with DATABASE_URL set via
// docker-compose).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'bun prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
