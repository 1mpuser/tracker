# Tracker Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the NestJS + Prisma + PostgreSQL backend API for the personal daily tracker described in `claude_code_prompt.md`, runnable via `docker compose up -d --build` and fully verifiable with curl before any frontend exists.

**Architecture:** NestJS modules-by-feature (Categories, Days, Dailies, TaskTemplates, Settings, Stats), each with its own DTOs/service/controller, sharing one Prisma-backed Postgres database. A `common/date.util.ts` centralizes UTC-safe date handling for `@db.Date` columns. Docker Compose runs `postgres` and `backend`; `backend`'s container entrypoint runs `prisma migrate deploy` + seed before starting the server.

**Tech Stack:** NestJS 10, Prisma 5, PostgreSQL 16, class-validator/class-transformer, Jest, Docker Compose.

This is **Plan 1 of 2**. Plan 2 (Next.js frontend) will be written after this backend is complete and depends on the exact endpoint contracts defined here.

## Global Constraints

- Stack: NestJS + Prisma + PostgreSQL only (no other backend framework/ORM).
- CORS: open strictly to `http://localhost:4887` (frontend's host-published port — from `claude_code_prompt.md`, section "Backend").
- Global `ValidationPipe` (`whitelist: true, transform: true`) with class-validator DTOs on every mutating endpoint.
- Repo layout: `/backend`, `/frontend` (Plan 2), `docker-compose.yml`, `.env.example`, `README.md` at repo root.
- `postgres:16-alpine`, named volume `pgdata`, container's internal port `5432` published to host as `5434` for local `psql` (host `5432` was occupied by an unrelated container on the dev machine — internal Docker networking between `backend` and `postgres` always uses `5432` regardless of the host mapping).
- Backend container: multi-stage Dockerfile, port `3001` published to host, `depends_on: postgres` with healthcheck, entrypoint runs `prisma migrate deploy` then seed then starts the app.
- Seed on first run: exactly 5 categories — `sport`→«Спорт», `personal`→«Общение / свидания», `family`→«Семья», `learning`→«Обучение», `work`→«Работа / финансы» — plus one `Settings` row (`id=1`, `youtubeBudget=60`).
- `archived` on `Category` is a soft delete: it must hide the category from "active" queries but must **not** corrupt historical stats — a day's historical `total`/`completed` must still reflect categories that had a tracked status on that day, even if later archived.
- Endpoint contracts (exact, from spec, including the `/stats/youtube-daily` addition):
  - `GET /days/:date`
  - `PATCH /days/:date/categories/:key` `{ done: boolean }`
  - `POST /days/:date/dailies` `{ text: string }`
  - `PATCH /dailies/:id` `{ done?: boolean, text?: string }`
  - `DELETE /dailies/:id`
  - `PATCH /days/:date/youtube` `{ delta?: number, reset?: boolean }`
  - `PATCH /days/:date` `{ eveningClosed: boolean }`
  - `GET /history?limit=21` → `{ date, completed, total, ytOver }[]`
  - `GET /categories`
  - `POST /categories` `{ key: string, label: string }`
  - `PATCH /categories/:key` `{ label?: string, order?: number, archived?: boolean }`
  - `GET /task-templates`, `POST /task-templates` `{ text: string }`, `PATCH /task-templates/:id` `{ text?: string, order?: number }`, `DELETE /task-templates/:id`
  - `GET /stats/categories?days=30` → `{ key, label, doneCount, totalDays, pct }[]`
  - `GET /stats/youtube?weeks=8` → `{ weekStart, avgMinutes, budget }[]`
  - `GET /stats/youtube-daily?days=30` → `{ date, minutes, budget, pct }[]`
  - `GET /settings`, `PATCH /settings` `{ youtubeBudget?: number, notificationsEnabled?: boolean }`
- Prisma schema is fixed exactly as specified (see Task 3) — do not add/rename fields.
- `backend/tsconfig.json` sets `strictPropertyInitialization: false` (Task 1) precisely so DTOs can declare fields like `key: string;` without a definite-assignment `!` — this is intentional project convention, not scope creep, and applies to every DTO in every task.
- Package manager & runtime for the backend: **Bun** (`bun install` / `bun run` / `bunx`), not npm/yarn/pnpm. The seed script runs directly as `.ts` under Bun (no `ts-node`). Both Docker build and runtime stages use `oven/bun:1-alpine`. Jest/ts-jest remain the test framework, just invoked via `bunx jest`/`bun run test` instead of npx/npm.

---

### Task 1: Bootstrap NestJS project skeleton

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/nest-cli.json`
- Create: `backend/.gitignore`
- Create: `backend/src/main.ts`
- Create: `backend/src/app.module.ts`
- Create: `backend/src/app.controller.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a bootable NestJS app on port 3001 with global `ValidationPipe` and CORS restricted to `http://localhost:4887`; `AppModule` is the extension point later tasks add imports to; `bun run test` and `bun run start:dev` scripts.

- [ ] **Step 1: Create `backend/package.json`**

```json
{
  "name": "tracker-backend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "bun dist/main.js",
    "start:dev": "nest start --watch",
    "test": "jest"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/platform-express": "^10.4.0",
    "@prisma/client": "^5.20.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.5",
    "@nestjs/testing": "^10.4.0",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.14.0",
    "jest": "^29.7.0",
    "prisma": "^5.20.0",
    "ts-jest": "^29.2.5",
    "typescript": "^5.5.4"
  },
  "prisma": {
    "seed": "bun prisma/seed.ts"
  },
  "jest": {
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": {
      "^.+\\.(t|j)s$": "ts-jest"
    },
    "moduleFileExtensions": ["js", "json", "ts"]
  }
}
```

- [ ] **Step 2: Create `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": false,
    "target": "ES2021",
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": "./",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "esModuleInterop": true,
    "strict": true,
    "strictPropertyInitialization": false,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts"]
}
```

`prisma/seed.ts` is deliberately excluded from this `include` — it never goes through `nest build`; it always runs directly as `.ts` under Bun (`bun prisma/seed.ts`, per the `prisma.seed` script above), so it doesn't need to share the app's `dist/` output layout. Keeping it out of `include` (with an explicit `rootDir: "./src"`) is what keeps `nest build`'s output flat at `dist/main.js` instead of nesting it under `dist/src/main.js` — mixing `src/**` and `prisma/**` under `include` with no explicit `rootDir` makes `tsc` infer the common root as `backend/` itself, which preserves both subdirectories' structure in `dist/`.

- [ ] **Step 3: Create `backend/nest-cli.json`**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
```

- [ ] **Step 4: Create `backend/.gitignore`**

```
node_modules/
dist/
.env
```

- [ ] **Step 5: Create `backend/src/app.controller.ts`**

```ts
import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
```

- [ ] **Step 6: Create `backend/src/app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';

@Module({
  imports: [],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 7: Create `backend/src/main.ts`**

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: 'http://localhost:4887' });
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
```

- [ ] **Step 8: Install dependencies with Bun**

Run: `cd backend && bun install`
Expected: installs without errors, creates `backend/node_modules` and `backend/bun.lock`.

- [ ] **Step 9: Verify the app boots and responds**

Run: `cd backend && bun run start:dev` (leave running in a terminal)
Then in another terminal: `curl -s http://localhost:3001/health`
Expected: `{"status":"ok"}`
Stop the dev server (Ctrl+C) before continuing.

- [ ] **Step 10: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add backend/package.json backend/tsconfig.json backend/nest-cli.json backend/.gitignore backend/src backend/bun.lock
git commit -m "feat(backend): bootstrap NestJS skeleton with health check"
```

---

### Task 2: Docker Compose — postgres service + env files

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `backend/.env` (not committed)

**Interfaces:**
- Consumes: nothing.
- Produces: a running Postgres reachable at `localhost:5434` with user/db `tracker`/`tracker`, used by Task 3's Prisma migration and by local dev for the rest of the plan.

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: tracker
      POSTGRES_PASSWORD: tracker
      POSTGRES_DB: tracker
    ports:
      - "5434:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tracker -d tracker"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  pgdata:
```

Host port `5434` maps to the container's internal `5432` — chosen because `5432` was already bound by an unrelated container on the dev machine. The container-internal port stays `5432` (that's what `backend`'s in-cluster `DATABASE_URL` uses), so this only affects connecting from the host machine (e.g. local `psql`, or a NestJS process running outside Docker).

- [ ] **Step 2: Create `.env.example`**

```
DATABASE_URL=postgresql://tracker:tracker@localhost:5434/tracker
YOUTUBE_BUDGET_DEFAULT=60
NEXT_PUBLIC_API_URL=http://localhost:3001
```

- [ ] **Step 3: Create `backend/.env` (local dev only, gitignored by Task 1's `backend/.gitignore`)**

```
DATABASE_URL=postgresql://tracker:tracker@localhost:5434/tracker
YOUTUBE_BUDGET_DEFAULT=60
```

- [ ] **Step 4: Start Postgres and verify it's healthy**

Run: `docker compose up -d postgres`
Then: `docker compose ps`
Expected: `postgres` service shows state `running (healthy)` within ~10s.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat(infra): add docker-compose postgres service"
```

(`backend/.env` is gitignored — do not add it.)

---

### Task 3: Prisma schema, client wiring, migration, seed

**Files:**
- Create: `backend/prisma/schema.prisma`
- Create: `backend/prisma/seed.ts`
- Create: `backend/src/prisma/prisma.service.ts`
- Create: `backend/src/prisma/prisma.module.ts`
- Modify: `backend/package.json` (add `prisma.seed` script — already present from Task 1, verify it matches)
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `DATABASE_URL` from `backend/.env` (Task 2), running Postgres (Task 2).
- Produces: `PrismaService` (extends `PrismaClient`, connects/disconnects with the Nest lifecycle) exported from a `@Global()` `PrismaModule`, importable everywhere as `import { PrismaService } from '../prisma/prisma.service'`. Applied migration + seeded DB (5 categories + 1 settings row).

- [ ] **Step 1: Create `backend/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Category {
  id       Int    @id @default(autoincrement())
  key      String @unique
  label    String
  order    Int    @default(0)
  archived Boolean @default(false)
  statuses DayCategoryStatus[]
}

model Day {
  id             Int      @id @default(autoincrement())
  date           DateTime @unique @db.Date
  youtubeMinutes Int      @default(0)
  eveningClosed  Boolean  @default(false)
  categories     DayCategoryStatus[]
  dailies        DailyTask[]
  createdAt      DateTime @default(now())
}

model DayCategoryStatus {
  id         Int      @id @default(autoincrement())
  day        Day      @relation(fields: [dayId], references: [id], onDelete: Cascade)
  dayId      Int
  category   Category @relation(fields: [categoryId], references: [id])
  categoryId Int
  done       Boolean  @default(false)

  @@unique([dayId, categoryId])
}

model DailyTask {
  id        Int      @id @default(autoincrement())
  day       Day      @relation(fields: [dayId], references: [id], onDelete: Cascade)
  dayId     Int
  text      String
  done      Boolean  @default(false)
  order     Int      @default(0)
  createdAt DateTime @default(now())
}

model TaskTemplate {
  id    Int    @id @default(autoincrement())
  text  String
  order Int    @default(0)
}

model Settings {
  id                   Int     @id @default(1)
  youtubeBudget        Int     @default(60)
  notificationsEnabled Boolean @default(false)
}
```

- [ ] **Step 2: Generate and apply the initial migration**

Run: `cd backend && bunx prisma migrate dev --name init`
Expected: creates `backend/prisma/migrations/<timestamp>_init/migration.sql`, applies it, prints "Your database is now in sync with your schema."

- [ ] **Step 3: Verify tables exist**

Run: `docker exec -it $(docker compose ps -q postgres) psql -U tracker -d tracker -c '\dt'`
Expected: lists `Category`, `Day`, `DayCategoryStatus`, `DailyTask`, `TaskTemplate`, `Settings`, `_prisma_migrations`.

- [ ] **Step 4: Create `backend/src/prisma/prisma.service.ts`**

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

- [ ] **Step 5: Create `backend/src/prisma/prisma.module.ts`**

```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 6: Modify `backend/src/app.module.ts` to import `PrismaModule`**

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 7: Create `backend/prisma/seed.ts`**

```ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = [
  { key: 'sport', label: 'Спорт', order: 0 },
  { key: 'personal', label: 'Общение / свидания', order: 1 },
  { key: 'family', label: 'Семья', order: 2 },
  { key: 'learning', label: 'Обучение', order: 3 },
  { key: 'work', label: 'Работа / финансы', order: 4 },
];

const DEFAULT_YOUTUBE_BUDGET = parseInt(process.env.YOUTUBE_BUDGET_DEFAULT ?? '60', 10);

async function main() {
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { key: cat.key },
      update: {},
      create: cat,
    });
  }

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, youtubeBudget: DEFAULT_YOUTUBE_BUDGET },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 8: Confirm `backend/package.json` has the seed config (added in Task 1)**

Verify it contains:
```json
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  },
```
If missing, add it.

- [ ] **Step 9: Run the seed and verify**

Run: `cd backend && bunx prisma db seed`
Expected: no errors.
Then: `docker exec -it $(docker compose ps -q postgres) psql -U tracker -d tracker -c 'select key,label,"order" from "Category" order by "order";'`
Expected: 5 rows, `sport|Спорт|0` ... `work|Работа / финансы|4`.
Then: `docker exec -it $(docker compose ps -q postgres) psql -U tracker -d tracker -c 'select id,"youtubeBudget" from "Settings";'`
Expected: `1|60`.

- [ ] **Step 10: Verify app still boots with PrismaModule wired in**

Run: `cd backend && bun run start:dev`, then `curl -s http://localhost:3001/health`
Expected: `{"status":"ok"}`, no Prisma connection errors in the log.
Stop the dev server.

- [ ] **Step 11: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add backend/prisma backend/src/prisma backend/src/app.module.ts backend/package.json
git commit -m "feat(backend): add Prisma schema, migration, seed, PrismaModule"
```

---

### Task 4: CategoriesModule

**Files:**
- Create: `backend/src/categories/dto/create-category.dto.ts`
- Create: `backend/src/categories/dto/update-category.dto.ts`
- Create: `backend/src/categories/categories.service.ts`
- Create: `backend/src/categories/categories.service.spec.ts`
- Create: `backend/src/categories/categories.controller.ts`
- Create: `backend/src/categories/categories.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 3).
- Produces: `CategoriesService` (exported from `CategoriesModule`) with `findActive(): Promise<Category[]>`, `create(dto: CreateCategoryDto): Promise<Category>`, `update(key: string, dto: UpdateCategoryDto): Promise<Category>` — consumed by Task 6 (DaysModule).
- Endpoints: `GET /categories`, `POST /categories`, `PATCH /categories/:key`.

- [ ] **Step 1: Create DTOs**

`backend/src/categories/dto/create-category.dto.ts`:
```ts
import { IsString, Matches, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @Matches(/^[a-z0-9_-]+$/, { message: 'key must be lowercase letters, digits, - or _' })
  @MaxLength(40)
  key: string;

  @IsString()
  @MaxLength(80)
  label: string;
}
```

`backend/src/categories/dto/update-category.dto.ts`:
```ts
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
```

- [ ] **Step 2: Write the failing unit test — `backend/src/categories/categories.service.spec.ts`**

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      category: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
      },
    };
    service = new CategoriesService(prisma);
  });

  it('assigns the next order on create', async () => {
    prisma.category.findUnique.mockResolvedValue(null);
    prisma.category.aggregate.mockResolvedValue({ _max: { order: 3 } });
    prisma.category.create.mockResolvedValue({ id: 1, key: 'reading', label: 'Чтение', order: 4, archived: false });

    await service.create({ key: 'reading', label: 'Чтение' });

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { key: 'reading', label: 'Чтение', order: 4 },
    });
  });

  it('throws ConflictException when the key already exists', async () => {
    prisma.category.findUnique.mockResolvedValue({ id: 1, key: 'sport' });

    await expect(service.create({ key: 'sport', label: 'Спорт' })).rejects.toThrow(ConflictException);
  });

  it('throws NotFoundException when updating an unknown category', async () => {
    prisma.category.findUnique.mockResolvedValue(null);

    await expect(service.update('ghost', { label: 'x' })).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `cd backend && bunx jest categories.service.spec.ts`
Expected: FAIL — `Cannot find module './categories.service'`.

- [ ] **Step 4: Create `backend/src/categories/categories.service.ts`**

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  findActive() {
    return this.prisma.category.findMany({
      where: { archived: false },
      orderBy: { order: 'asc' },
    });
  }

  async create(dto: CreateCategoryDto) {
    const existing = await this.prisma.category.findUnique({ where: { key: dto.key } });
    if (existing) {
      throw new ConflictException(`Category with key "${dto.key}" already exists`);
    }
    const maxOrder = await this.prisma.category.aggregate({ _max: { order: true } });
    return this.prisma.category.create({
      data: {
        key: dto.key,
        label: dto.label,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
  }

  async update(key: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.category.findUnique({ where: { key } });
    if (!existing) {
      throw new NotFoundException(`Category "${key}" not found`);
    }
    return this.prisma.category.update({
      where: { key },
      data: dto,
    });
  }
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd backend && bunx jest categories.service.spec.ts`
Expected: PASS — 3 tests.

- [ ] **Step 6: Create `backend/src/categories/categories.controller.ts`**

```ts
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findActive() {
    return this.categoriesService.findActive();
  }

  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch(':key')
  update(@Param('key') key: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(key, dto);
  }
}
```

- [ ] **Step 7: Create `backend/src/categories/categories.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
```

- [ ] **Step 8: Modify `backend/src/app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CategoriesModule } from './categories/categories.module';

@Module({
  imports: [PrismaModule, CategoriesModule],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 9: Verify endpoints with curl**

Run: `cd backend && bun run start:dev` (separate terminal)

```bash
curl -s http://localhost:3001/categories
# Expected: 5 seeded categories, ordered by "order"

curl -s -X POST http://localhost:3001/categories -H 'Content-Type: application/json' -d '{"key":"reading","label":"Чтение"}'
# Expected: 201, new category with order 5

curl -s -X PATCH http://localhost:3001/categories/reading -H 'Content-Type: application/json' -d '{"archived":true}'
# Expected: 200, archived:true

curl -s http://localhost:3001/categories
# Expected: "reading" no longer in the list (still 5 entries)
```

Stop the dev server.

- [ ] **Step 10: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add backend/src/categories backend/src/app.module.ts
git commit -m "feat(backend): add CategoriesModule (list/create/update/archive)"
```

---

### Task 5: SettingsModule

**Files:**
- Create: `backend/src/settings/dto/update-settings.dto.ts`
- Create: `backend/src/settings/settings.service.ts`
- Create: `backend/src/settings/settings.service.spec.ts`
- Create: `backend/src/settings/settings.controller.ts`
- Create: `backend/src/settings/settings.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 3).
- Produces: `SettingsService` with `get(): Promise<Settings>`, `update(dto: UpdateSettingsDto): Promise<Settings>` — consumed later by Tasks 6 and 9 for `youtubeBudget`.
- Endpoints: `GET /settings`, `PATCH /settings`.

- [ ] **Step 1: Create `backend/src/settings/dto/update-settings.dto.ts`**

```ts
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  youtubeBudget?: number;

  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;
}
```

- [ ] **Step 2: Write the failing unit test — `backend/src/settings/settings.service.spec.ts`**

```ts
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      settings: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new SettingsService(prisma);
  });

  it('creates the row with defaults if it does not exist yet', async () => {
    prisma.settings.findUnique.mockResolvedValue(null);
    prisma.settings.create.mockResolvedValue({ id: 1, youtubeBudget: 60, notificationsEnabled: false });

    const result = await service.get();

    expect(prisma.settings.create).toHaveBeenCalledWith({ data: { id: 1 } });
    expect(result.youtubeBudget).toBe(60);
  });

  it('returns the existing row without creating a new one', async () => {
    prisma.settings.findUnique.mockResolvedValue({ id: 1, youtubeBudget: 90, notificationsEnabled: true });

    const result = await service.get();

    expect(prisma.settings.create).not.toHaveBeenCalled();
    expect(result.youtubeBudget).toBe(90);
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `cd backend && bunx jest settings.service.spec.ts`
Expected: FAIL — `Cannot find module './settings.service'`.

- [ ] **Step 4: Create `backend/src/settings/settings.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async get() {
    const settings = await this.prisma.settings.findUnique({ where: { id: 1 } });
    if (settings) return settings;
    return this.prisma.settings.create({ data: { id: 1 } });
  }

  async update(dto: UpdateSettingsDto) {
    await this.get();
    return this.prisma.settings.update({
      where: { id: 1 },
      data: dto,
    });
  }
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd backend && bunx jest settings.service.spec.ts`
Expected: PASS — 2 tests.

- [ ] **Step 6: Create `backend/src/settings/settings.controller.ts`**

```ts
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get() {
    return this.settingsService.get();
  }

  @Patch()
  update(@Body() dto: UpdateSettingsDto) {
    return this.settingsService.update(dto);
  }
}
```

- [ ] **Step 7: Create `backend/src/settings/settings.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
```

- [ ] **Step 8: Modify `backend/src/app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CategoriesModule } from './categories/categories.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [PrismaModule, CategoriesModule, SettingsModule],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 9: Verify endpoints with curl**

```bash
cd backend && bun run start:dev &
curl -s http://localhost:3001/settings
# Expected: {"id":1,"youtubeBudget":60,"notificationsEnabled":false}

curl -s -X PATCH http://localhost:3001/settings -H 'Content-Type: application/json' -d '{"youtubeBudget":90}'
# Expected: youtubeBudget:90

curl -s http://localhost:3001/settings
# Expected: youtubeBudget:90 persisted
```

Stop the dev server.

- [ ] **Step 10: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add backend/src/settings backend/src/app.module.ts
git commit -m "feat(backend): add SettingsModule (get/patch youtube budget & notifications flag)"
```

---

### Task 6: DaysModule (today's day, category toggles, YouTube minutes, eveningClosed, history)

**Files:**
- Create: `backend/src/common/date.util.ts`
- Create: `backend/src/common/date.util.spec.ts`
- Create: `backend/src/days/dto/update-category-status.dto.ts`
- Create: `backend/src/days/dto/update-youtube.dto.ts`
- Create: `backend/src/days/dto/update-day.dto.ts`
- Create: `backend/src/days/days.service.ts`
- Create: `backend/src/days/days.service.spec.ts`
- Create: `backend/src/days/days.controller.ts`
- Create: `backend/src/days/days.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 3), `CategoriesService.findActive()` (Task 4).
- Produces: `date.util.ts` exporting `parseDateParam(dateStr: string): Date`, `formatDate(date: Date): string`, `addDays(date: Date, days: number): Date`, `todayDate(): Date` — reused by Task 7 and Task 9. `DaysService` (exported from `DaysModule`) with `getOrCreateDayId(dateStr: string): Promise<number>`, `getDay(dateStr: string): Promise<DayView>`, `setCategoryStatus(dateStr, key, done)`, `updateYoutube(dateStr, delta?, reset?)`, `setEveningClosed(dateStr, eveningClosed)`, `getHistory(limit: number): Promise<HistoryEntry[]>` — `getOrCreateDayId` is consumed by Task 7 (DailiesModule).
- Endpoints: `GET /days/:date`, `PATCH /days/:date/categories/:key`, `PATCH /days/:date/youtube`, `PATCH /days/:date`, `GET /history`.

This is the trickiest module: `getHistory` must implement the "archiving doesn't corrupt history" rule from Global Constraints. The rule implemented below: for each day, `total` counts every category that is **either** currently non-archived **or** archived-but-has-a-tracked-status-on-that-day; `completed` counts how many of those have `done: true`. A day with no `Day` row at all is treated as if it has zero statuses (so it correctly shows `0 / <active category count>`, not `0/0`, which would otherwise be misread as "fully complete" and silently inflate the streak).

- [ ] **Step 1: Write the failing unit test for the date utility — `backend/src/common/date.util.spec.ts`**

```ts
import { addDays, formatDate, parseDateParam } from './date.util';

describe('date.util', () => {
  it('parses a YYYY-MM-DD string as UTC midnight', () => {
    const d = parseDateParam('2026-07-15');
    expect(d.toISOString()).toBe('2026-07-15T00:00:00.000Z');
  });

  it('rejects malformed date strings', () => {
    expect(() => parseDateParam('15-07-2026')).toThrow();
  });

  it('rejects calendar-invalid dates instead of silently rolling over to the next month', () => {
    // JS Date arithmetic normalizes Feb 30 -> Mar 2 rather than erroring — must catch this ourselves.
    expect(() => parseDateParam('2026-02-30')).toThrow();
    expect(() => parseDateParam('2026-04-31')).toThrow();
  });

  it('formats a UTC date back to YYYY-MM-DD', () => {
    expect(formatDate(new Date('2026-07-15T00:00:00.000Z'))).toBe('2026-07-15');
  });

  it('adds days across a month boundary without drifting', () => {
    const d = addDays(new Date('2026-07-31T00:00:00.000Z'), 1);
    expect(formatDate(d)).toBe('2026-08-01');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd backend && bunx jest date.util.spec.ts`
Expected: FAIL — `Cannot find module './date.util'`.

- [ ] **Step 3: Create `backend/src/common/date.util.ts`**

```ts
import { BadRequestException } from '@nestjs/common';

export function parseDateParam(dateStr: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new BadRequestException(`Invalid date: ${dateStr}`);
  }
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`Invalid date: ${dateStr}`);
  }
  // JS Date arithmetic silently normalizes out-of-range days (e.g. 2026-02-30 -> 2026-03-02)
  // instead of failing — round-trip through formatDate to catch that roll-over ourselves.
  if (date.toISOString().slice(0, 10) !== dateStr) {
    throw new BadRequestException(`Invalid date: ${dateStr}`);
  }
  return date;
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function todayDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd backend && bunx jest date.util.spec.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Create the DTOs**

`backend/src/days/dto/update-category-status.dto.ts`:
```ts
import { IsBoolean } from 'class-validator';

export class UpdateCategoryStatusDto {
  @IsBoolean()
  done: boolean;
}
```

`backend/src/days/dto/update-youtube.dto.ts`:
```ts
import { IsBoolean, IsInt, IsOptional } from 'class-validator';

export class UpdateYoutubeDto {
  @IsOptional()
  @IsInt()
  delta?: number;

  @IsOptional()
  @IsBoolean()
  reset?: boolean;
}
```

`backend/src/days/dto/update-day.dto.ts`:
```ts
import { IsBoolean } from 'class-validator';

export class UpdateDayDto {
  @IsBoolean()
  eveningClosed: boolean;
}
```

- [ ] **Step 6: Write the failing unit test for `getHistory` — `backend/src/days/days.service.spec.ts`**

```ts
import { DaysService } from './days.service';

describe('DaysService.getHistory', () => {
  let service: DaysService;
  let prisma: any;

  beforeEach(() => {
    // Fixed system time so "today" in the service under test is deterministic —
    // getHistory() computes its date range from the real clock internally.
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
    prisma = {
      day: { findMany: jest.fn() },
      category: { findMany: jest.fn() },
      settings: { findUnique: jest.fn() },
    };
    service = new DaysService(prisma, {} as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('treats a day with no record as 0 completed out of all active categories (not 0/0)', async () => {
    prisma.day.findMany.mockResolvedValue([]);
    prisma.category.findMany.mockResolvedValue([
      { id: 1, key: 'sport', archived: false },
      { id: 2, key: 'family', archived: false },
    ]);
    prisma.settings.findUnique.mockResolvedValue({ youtubeBudget: 60 });

    const [entry] = await service.getHistory(1);

    expect(entry.completed).toBe(0);
    expect(entry.total).toBe(2);
  });

  it('still counts an archived category toward total on a day it has a tracked status', async () => {
    const today = new Date(Date.UTC(2026, 6, 15));
    prisma.day.findMany.mockResolvedValue([
      {
        date: today,
        youtubeMinutes: 10,
        categories: [{ categoryId: 3, done: true }],
      },
    ]);
    prisma.category.findMany.mockResolvedValue([
      { id: 1, key: 'sport', archived: false },
      { id: 3, key: 'old', archived: true },
    ]);
    prisma.settings.findUnique.mockResolvedValue({ youtubeBudget: 60 });

    const [entry] = await service.getHistory(1);

    expect(entry.total).toBe(2);
    expect(entry.completed).toBe(1);
  });

  it('excludes an archived category from days where it was never tracked', async () => {
    prisma.day.findMany.mockResolvedValue([]);
    prisma.category.findMany.mockResolvedValue([
      { id: 1, key: 'sport', archived: false },
      { id: 3, key: 'old', archived: true },
    ]);
    prisma.settings.findUnique.mockResolvedValue({ youtubeBudget: 60 });

    const [entry] = await service.getHistory(1);

    expect(entry.total).toBe(1);
  });

  it('flags ytOver when minutes exceed the current budget', async () => {
    const today = new Date(Date.UTC(2026, 6, 15));
    prisma.day.findMany.mockResolvedValue([
      { date: today, youtubeMinutes: 90, categories: [] },
    ]);
    prisma.category.findMany.mockResolvedValue([]);
    prisma.settings.findUnique.mockResolvedValue({ youtubeBudget: 60 });

    const [entry] = await service.getHistory(1);

    expect(entry.ytOver).toBe(true);
  });
});
```

- [ ] **Step 7: Run the test and verify it fails**

Run: `cd backend && bunx jest days.service.spec.ts`
Expected: FAIL — `Cannot find module './days.service'`.

- [ ] **Step 8: Create `backend/src/days/days.service.ts`**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { addDays, formatDate, parseDateParam, todayDate } from '../common/date.util';

export interface DayCategoryView {
  key: string;
  label: string;
  done: boolean;
}

export interface DayView {
  date: string;
  youtubeMinutes: number;
  eveningClosed: boolean;
  categories: DayCategoryView[];
  dailies: { id: number; text: string; done: boolean; order: number }[];
}

export interface HistoryEntry {
  date: string;
  completed: number;
  total: number;
  ytOver: boolean;
}

@Injectable()
export class DaysService {
  constructor(
    private prisma: PrismaService,
    private categoriesService: CategoriesService,
  ) {}

  async getOrCreateDayId(dateStr: string): Promise<number> {
    const date = parseDateParam(dateStr);
    const existing = await this.prisma.day.findUnique({ where: { date } });
    if (existing) return existing.id;
    const created = await this.prisma.day.create({ data: { date } });
    return created.id;
  }

  async getDay(dateStr: string): Promise<DayView> {
    const date = parseDateParam(dateStr);
    let day = await this.prisma.day.findUnique({
      where: { date },
      include: { categories: true, dailies: { orderBy: { order: 'asc' } } },
    });
    if (!day) {
      day = await this.prisma.day.create({
        data: { date },
        include: { categories: true, dailies: { orderBy: { order: 'asc' } } },
      });
    }

    const activeCategories = await this.categoriesService.findActive();
    const statusByCategoryId = new Map(day.categories.map((s) => [s.categoryId, s]));

    return {
      date: formatDate(day.date),
      youtubeMinutes: day.youtubeMinutes,
      eveningClosed: day.eveningClosed,
      categories: activeCategories.map((c) => ({
        key: c.key,
        label: c.label,
        done: statusByCategoryId.get(c.id)?.done ?? false,
      })),
      dailies: day.dailies.map((t) => ({ id: t.id, text: t.text, done: t.done, order: t.order })),
    };
  }

  async setCategoryStatus(dateStr: string, key: string, done: boolean): Promise<DayView> {
    const dayId = await this.getOrCreateDayId(dateStr);
    const category = await this.prisma.category.findUnique({ where: { key } });
    if (!category) {
      throw new NotFoundException(`Category "${key}" not found`);
    }
    await this.prisma.dayCategoryStatus.upsert({
      where: { dayId_categoryId: { dayId, categoryId: category.id } },
      update: { done },
      create: { dayId, categoryId: category.id, done },
    });
    return this.getDay(dateStr);
  }

  async updateYoutube(dateStr: string, delta?: number, reset?: boolean): Promise<DayView> {
    const dayId = await this.getOrCreateDayId(dateStr);
    const day = await this.prisma.day.findUniqueOrThrow({ where: { id: dayId } });
    const nextMinutes = reset ? 0 : Math.max(0, day.youtubeMinutes + (delta ?? 0));
    await this.prisma.day.update({ where: { id: dayId }, data: { youtubeMinutes: nextMinutes } });
    return this.getDay(dateStr);
  }

  async setEveningClosed(dateStr: string, eveningClosed: boolean): Promise<DayView> {
    const dayId = await this.getOrCreateDayId(dateStr);
    await this.prisma.day.update({ where: { id: dayId }, data: { eveningClosed } });
    return this.getDay(dateStr);
  }

  async getHistory(limit: number): Promise<HistoryEntry[]> {
    const end = todayDate();
    const start = addDays(end, -(limit - 1));

    const [days, categories, settings] = await Promise.all([
      this.prisma.day.findMany({
        where: { date: { gte: start, lte: end } },
        include: { categories: true },
      }),
      this.prisma.category.findMany(),
      this.prisma.settings.findUnique({ where: { id: 1 } }),
    ]);

    const budget = settings?.youtubeBudget ?? 60;
    const dayByDate = new Map(days.map((d) => [formatDate(d.date), d]));

    const result: HistoryEntry[] = [];
    for (let i = 0; i < limit; i++) {
      const date = formatDate(addDays(start, i));
      const day = dayByDate.get(date);
      const statusByCategoryId = new Map((day?.categories ?? []).map((s) => [s.categoryId, s]));
      const activeSet = categories.filter((c) => !c.archived || statusByCategoryId.has(c.id));
      const completed = activeSet.filter((c) => statusByCategoryId.get(c.id)?.done).length;
      const youtubeMinutes = day?.youtubeMinutes ?? 0;
      result.push({
        date,
        completed,
        total: activeSet.length,
        ytOver: youtubeMinutes > budget,
      });
    }
    return result;
  }
}
```

- [ ] **Step 9: Run the test and verify it passes**

Run: `cd backend && bunx jest days.service.spec.ts`
Expected: PASS — 4 tests.

- [ ] **Step 10: Create `backend/src/days/days.controller.ts`**

```ts
import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { DaysService } from './days.service';
import { UpdateCategoryStatusDto } from './dto/update-category-status.dto';
import { UpdateYoutubeDto } from './dto/update-youtube.dto';
import { UpdateDayDto } from './dto/update-day.dto';

@Controller()
export class DaysController {
  constructor(private readonly daysService: DaysService) {}

  @Get('days/:date')
  getDay(@Param('date') date: string) {
    return this.daysService.getDay(date);
  }

  @Patch('days/:date/categories/:key')
  setCategoryStatus(
    @Param('date') date: string,
    @Param('key') key: string,
    @Body() dto: UpdateCategoryStatusDto,
  ) {
    return this.daysService.setCategoryStatus(date, key, dto.done);
  }

  @Patch('days/:date/youtube')
  updateYoutube(@Param('date') date: string, @Body() dto: UpdateYoutubeDto) {
    return this.daysService.updateYoutube(date, dto.delta, dto.reset);
  }

  @Patch('days/:date')
  updateDay(@Param('date') date: string, @Body() dto: UpdateDayDto) {
    return this.daysService.setEveningClosed(date, dto.eveningClosed);
  }

  @Get('history')
  getHistory(@Query('limit') limit?: string) {
    const parsed = limit ? parseInt(limit, 10) : 21;
    return this.daysService.getHistory(Number.isNaN(parsed) ? 21 : parsed);
  }
}
```

- [ ] **Step 11: Create `backend/src/days/days.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { DaysController } from './days.controller';
import { DaysService } from './days.service';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [CategoriesModule],
  controllers: [DaysController],
  providers: [DaysService],
  exports: [DaysService],
})
export class DaysModule {}
```

- [ ] **Step 12: Modify `backend/src/app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CategoriesModule } from './categories/categories.module';
import { SettingsModule } from './settings/settings.module';
import { DaysModule } from './days/days.module';

@Module({
  imports: [PrismaModule, CategoriesModule, SettingsModule, DaysModule],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 13: Verify endpoints with curl**

```bash
cd backend && bun run start:dev &
TODAY=$(date +%F)

curl -s http://localhost:3001/days/$TODAY
# Expected: date, youtubeMinutes:0, eveningClosed:false, 5 categories all done:false, dailies:[]

curl -s -X PATCH http://localhost:3001/days/$TODAY/categories/sport -H 'Content-Type: application/json' -d '{"done":true}'
# Expected: sport category now done:true

curl -s -X PATCH http://localhost:3001/days/$TODAY/youtube -H 'Content-Type: application/json' -d '{"delta":25}'
# Expected: youtubeMinutes:25

curl -s -X PATCH http://localhost:3001/days/$TODAY -H 'Content-Type: application/json' -d '{"eveningClosed":true}'
# Expected: eveningClosed:true

curl -s "http://localhost:3001/history?limit=3"
# Expected: 3 entries ending today; today shows completed:1,total:5,ytOver:false
```

Stop the dev server.

- [ ] **Step 14: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add backend/src/common backend/src/days backend/src/app.module.ts
git commit -m "feat(backend): add DaysModule (today's day, category toggles, youtube, history)"
```

---

### Task 7: DailiesModule

**Files:**
- Create: `backend/src/dailies/dto/create-daily.dto.ts`
- Create: `backend/src/dailies/dto/update-daily.dto.ts`
- Create: `backend/src/dailies/dailies.service.ts`
- Create: `backend/src/dailies/dailies.service.spec.ts`
- Create: `backend/src/dailies/dailies.controller.ts`
- Create: `backend/src/dailies/dailies.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 3), `DaysService.getOrCreateDayId(dateStr: string): Promise<number>` (Task 6).
- Produces: `DailiesService` with `create(dateStr, text)`, `update(id, data)`, `remove(id)`.
- Endpoints: `POST /days/:date/dailies`, `PATCH /dailies/:id`, `DELETE /dailies/:id`.

- [ ] **Step 1: Create the DTOs**

`backend/src/dailies/dto/create-daily.dto.ts`:
```ts
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDailyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  text: string;
}
```

`backend/src/dailies/dto/update-daily.dto.ts`:
```ts
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateDailyDto {
  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  text?: string;
}
```

- [ ] **Step 2: Write the failing unit test — `backend/src/dailies/dailies.service.spec.ts`**

```ts
import { NotFoundException } from '@nestjs/common';
import { DailiesService } from './dailies.service';

describe('DailiesService', () => {
  let service: DailiesService;
  let prisma: any;
  let daysService: any;

  beforeEach(() => {
    prisma = {
      dailyTask: {
        aggregate: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    daysService = { getOrCreateDayId: jest.fn().mockResolvedValue(7) };
    service = new DailiesService(prisma, daysService);
  });

  it('assigns the next order within the day on create', async () => {
    prisma.dailyTask.aggregate.mockResolvedValue({ _max: { order: 1 } });
    prisma.dailyTask.create.mockResolvedValue({ id: 1, dayId: 7, text: 'Пробежка', done: false, order: 2 });

    await service.create('2026-07-15', 'Пробежка');

    expect(daysService.getOrCreateDayId).toHaveBeenCalledWith('2026-07-15');
    expect(prisma.dailyTask.create).toHaveBeenCalledWith({
      data: { dayId: 7, text: 'Пробежка', order: 2 },
    });
  });

  it('throws NotFoundException when updating a missing task', async () => {
    prisma.dailyTask.findUnique.mockResolvedValue(null);

    await expect(service.update(999, { done: true })).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when removing a missing task', async () => {
    prisma.dailyTask.findUnique.mockResolvedValue(null);

    await expect(service.remove(999)).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `cd backend && bunx jest dailies.service.spec.ts`
Expected: FAIL — `Cannot find module './dailies.service'`.

- [ ] **Step 4: Create `backend/src/dailies/dailies.service.ts`**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DaysService } from '../days/days.service';

@Injectable()
export class DailiesService {
  constructor(
    private prisma: PrismaService,
    private daysService: DaysService,
  ) {}

  async create(dateStr: string, text: string) {
    const dayId = await this.daysService.getOrCreateDayId(dateStr);
    const maxOrder = await this.prisma.dailyTask.aggregate({
      where: { dayId },
      _max: { order: true },
    });
    return this.prisma.dailyTask.create({
      data: { dayId, text, order: (maxOrder._max.order ?? -1) + 1 },
    });
  }

  async update(id: number, data: { done?: boolean; text?: string }) {
    const existing = await this.prisma.dailyTask.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Daily task ${id} not found`);
    }
    return this.prisma.dailyTask.update({ where: { id }, data });
  }

  async remove(id: number) {
    const existing = await this.prisma.dailyTask.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Daily task ${id} not found`);
    }
    await this.prisma.dailyTask.delete({ where: { id } });
    return { id };
  }
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd backend && bunx jest dailies.service.spec.ts`
Expected: PASS — 3 tests.

- [ ] **Step 6: Create `backend/src/dailies/dailies.controller.ts`**

```ts
import { Body, Controller, Delete, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { DailiesService } from './dailies.service';
import { CreateDailyDto } from './dto/create-daily.dto';
import { UpdateDailyDto } from './dto/update-daily.dto';

@Controller()
export class DailiesController {
  constructor(private readonly dailiesService: DailiesService) {}

  @Post('days/:date/dailies')
  create(@Param('date') date: string, @Body() dto: CreateDailyDto) {
    return this.dailiesService.create(date, dto.text);
  }

  @Patch('dailies/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDailyDto) {
    return this.dailiesService.update(id, dto);
  }

  @Delete('dailies/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.dailiesService.remove(id);
  }
}
```

- [ ] **Step 7: Create `backend/src/dailies/dailies.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { DailiesController } from './dailies.controller';
import { DailiesService } from './dailies.service';
import { DaysModule } from '../days/days.module';

@Module({
  imports: [DaysModule],
  controllers: [DailiesController],
  providers: [DailiesService],
})
export class DailiesModule {}
```

- [ ] **Step 8: Modify `backend/src/app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CategoriesModule } from './categories/categories.module';
import { SettingsModule } from './settings/settings.module';
import { DaysModule } from './days/days.module';
import { DailiesModule } from './dailies/dailies.module';

@Module({
  imports: [PrismaModule, CategoriesModule, SettingsModule, DaysModule, DailiesModule],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 9: Verify endpoints with curl**

```bash
cd backend && bun run start:dev &
TODAY=$(date -u +%F)   # UTC, not local time — must match the server's todayDate(), which is UTC-based

curl -s -X POST http://localhost:3001/days/$TODAY/dailies -H 'Content-Type: application/json' -d '{"text":"Сделать план на неделю"}'
# Expected: 201, {id, text:"Сделать план на неделю", done:false, order:0, ...}
# note the returned id, e.g. 1

curl -s -X PATCH http://localhost:3001/dailies/1 -H 'Content-Type: application/json' -d '{"done":true}'
# Expected: done:true

curl -s -X DELETE http://localhost:3001/dailies/1
# Expected: {"id":1}

curl -s http://localhost:3001/days/$TODAY
# Expected: dailies:[]
```

Stop the dev server.

- [ ] **Step 10: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add backend/src/dailies backend/src/app.module.ts
git commit -m "feat(backend): add DailiesModule (add/toggle/delete today's tasks)"
```

---

### Task 8: TaskTemplatesModule

**Files:**
- Create: `backend/src/task-templates/dto/create-task-template.dto.ts`
- Create: `backend/src/task-templates/dto/update-task-template.dto.ts`
- Create: `backend/src/task-templates/task-templates.service.ts`
- Create: `backend/src/task-templates/task-templates.service.spec.ts`
- Create: `backend/src/task-templates/task-templates.controller.ts`
- Create: `backend/src/task-templates/task-templates.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 3).
- Produces: `TaskTemplatesService` with `findAll()`, `create(dto)`, `update(id, dto)`, `remove(id)`.
- Endpoints: `GET /task-templates`, `POST /task-templates`, `PATCH /task-templates/:id`, `DELETE /task-templates/:id`.

- [ ] **Step 1: Create the DTOs**

`backend/src/task-templates/dto/create-task-template.dto.ts`:
```ts
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTaskTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  text: string;
}
```

`backend/src/task-templates/dto/update-task-template.dto.ts`:
```ts
import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateTaskTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  text?: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
```

- [ ] **Step 2: Write the failing unit test — `backend/src/task-templates/task-templates.service.spec.ts`**

```ts
import { NotFoundException } from '@nestjs/common';
import { TaskTemplatesService } from './task-templates.service';

describe('TaskTemplatesService', () => {
  let service: TaskTemplatesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      taskTemplate: {
        aggregate: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new TaskTemplatesService(prisma);
  });

  it('assigns the next order on create', async () => {
    prisma.taskTemplate.aggregate.mockResolvedValue({ _max: { order: 0 } });
    prisma.taskTemplate.create.mockResolvedValue({ id: 1, text: 'Тренировка', order: 1 });

    await service.create({ text: 'Тренировка' });

    expect(prisma.taskTemplate.create).toHaveBeenCalledWith({
      data: { text: 'Тренировка', order: 1 },
    });
  });

  it('throws NotFoundException when updating a missing template', async () => {
    prisma.taskTemplate.findUnique.mockResolvedValue(null);

    await expect(service.update(999, { text: 'x' })).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when removing a missing template', async () => {
    prisma.taskTemplate.findUnique.mockResolvedValue(null);

    await expect(service.remove(999)).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `cd backend && bunx jest task-templates.service.spec.ts`
Expected: FAIL — `Cannot find module './task-templates.service'`.

- [ ] **Step 4: Create `backend/src/task-templates/task-templates.service.ts`**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskTemplateDto } from './dto/create-task-template.dto';
import { UpdateTaskTemplateDto } from './dto/update-task-template.dto';

@Injectable()
export class TaskTemplatesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.taskTemplate.findMany({ orderBy: { order: 'asc' } });
  }

  async create(dto: CreateTaskTemplateDto) {
    const maxOrder = await this.prisma.taskTemplate.aggregate({ _max: { order: true } });
    return this.prisma.taskTemplate.create({
      data: { text: dto.text, order: (maxOrder._max.order ?? -1) + 1 },
    });
  }

  async update(id: number, dto: UpdateTaskTemplateDto) {
    const existing = await this.prisma.taskTemplate.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Task template ${id} not found`);
    }
    return this.prisma.taskTemplate.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const existing = await this.prisma.taskTemplate.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Task template ${id} not found`);
    }
    await this.prisma.taskTemplate.delete({ where: { id } });
    return { id };
  }
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd backend && bunx jest task-templates.service.spec.ts`
Expected: PASS — 3 tests.

- [ ] **Step 6: Create `backend/src/task-templates/task-templates.controller.ts`**

```ts
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { TaskTemplatesService } from './task-templates.service';
import { CreateTaskTemplateDto } from './dto/create-task-template.dto';
import { UpdateTaskTemplateDto } from './dto/update-task-template.dto';

@Controller('task-templates')
export class TaskTemplatesController {
  constructor(private readonly taskTemplatesService: TaskTemplatesService) {}

  @Get()
  findAll() {
    return this.taskTemplatesService.findAll();
  }

  @Post()
  create(@Body() dto: CreateTaskTemplateDto) {
    return this.taskTemplatesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTaskTemplateDto) {
    return this.taskTemplatesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.taskTemplatesService.remove(id);
  }
}
```

- [ ] **Step 7: Create `backend/src/task-templates/task-templates.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { TaskTemplatesController } from './task-templates.controller';
import { TaskTemplatesService } from './task-templates.service';

@Module({
  controllers: [TaskTemplatesController],
  providers: [TaskTemplatesService],
})
export class TaskTemplatesModule {}
```

- [ ] **Step 8: Modify `backend/src/app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CategoriesModule } from './categories/categories.module';
import { SettingsModule } from './settings/settings.module';
import { DaysModule } from './days/days.module';
import { DailiesModule } from './dailies/dailies.module';
import { TaskTemplatesModule } from './task-templates/task-templates.module';

@Module({
  imports: [
    PrismaModule,
    CategoriesModule,
    SettingsModule,
    DaysModule,
    DailiesModule,
    TaskTemplatesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 9: Verify endpoints with curl**

```bash
cd backend && bun run start:dev &

curl -s -X POST http://localhost:3001/task-templates -H 'Content-Type: application/json' -d '{"text":"Тренировка"}'
# Expected: 201, order:0 (note id, e.g. 1)

curl -s -X PATCH http://localhost:3001/task-templates/1 -H 'Content-Type: application/json' -d '{"text":"Силовая тренировка"}'
# Expected: text updated

curl -s http://localhost:3001/task-templates
# Expected: 1 entry

curl -s -X DELETE http://localhost:3001/task-templates/1
# Expected: {"id":1}
```

Stop the dev server.

- [ ] **Step 10: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add backend/src/task-templates backend/src/app.module.ts
git commit -m "feat(backend): add TaskTemplatesModule (reusable task library CRUD)"
```

---

### Task 9: StatsModule (category %, YouTube weekly, YouTube daily heatmap+progress-bar source)

**Files:**
- Create: `backend/src/stats/stats.service.ts`
- Create: `backend/src/stats/stats.service.spec.ts`
- Create: `backend/src/stats/stats.controller.ts`
- Create: `backend/src/stats/stats.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 3), `formatDate`/`addDays`/`todayDate` from `../common/date.util` (Task 6).
- Produces: `StatsService` with `categoryStats(days)`, `youtubeWeeklyStats(weeks)`, `youtubeDailyStats(days)`.
- Endpoints: `GET /stats/categories?days=30`, `GET /stats/youtube?weeks=8`, `GET /stats/youtube-daily?days=30` (the last one is the new endpoint added to the spec for the frontend's 30-day YouTube heatmap and average-vs-budget progress bar).

- [ ] **Step 1: Write the failing unit tests — `backend/src/stats/stats.service.spec.ts`**

```ts
import { StatsService } from './stats.service';

describe('StatsService.youtubeDailyStats', () => {
  beforeEach(() => {
    // Fixed system time so "today" inside the service is deterministic.
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('computes pct as minutes-over-budget, defaulting missing days to 0', async () => {
    const today = new Date(Date.UTC(2026, 6, 15));
    const prisma: any = {
      settings: { findUnique: jest.fn().mockResolvedValue({ youtubeBudget: 50 }) },
      day: { findMany: jest.fn().mockResolvedValue([{ date: today, youtubeMinutes: 25 }]) },
    };
    const service = new StatsService(prisma);

    const result = await service.youtubeDailyStats(2);

    expect(result).toHaveLength(2);
    expect(result[1].minutes).toBe(25);
    expect(result[1].pct).toBe(50);
    expect(result[0].minutes).toBe(0);
    expect(result[0].pct).toBe(0);
  });
});

describe('StatsService.youtubeWeeklyStats', () => {
  beforeEach(() => {
    // Fixed system time (a Wednesday) so Monday-alignment is deterministic and assertable.
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('averages minutes across all 7 days of each week, treating gaps as 0, aligned to Monday', async () => {
    const prisma: any = {
      settings: { findUnique: jest.fn().mockResolvedValue({ youtubeBudget: 60 }) },
      day: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new StatsService(prisma);

    const result = await service.youtubeWeeklyStats(1);

    expect(result).toHaveLength(1);
    expect(result[0].weekStart).toBe('2026-07-13'); // Monday of the week containing 2026-07-15
    expect(result[0].avgMinutes).toBe(0);
    expect(result[0].budget).toBe(60);
  });

  it('aligns to Monday even when "today" is itself a Sunday', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-19T12:00:00.000Z')); // Sunday
    const prisma: any = {
      settings: { findUnique: jest.fn().mockResolvedValue({ youtubeBudget: 60 }) },
      day: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new StatsService(prisma);

    const result = await service.youtubeWeeklyStats(1);

    expect(result[0].weekStart).toBe('2026-07-13'); // Monday of the *same* week, not the next one
  });
});

describe('StatsService.categoryStats', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('computes pct as doneCount / days, per non-archived category', async () => {
    const prisma: any = {
      category: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, key: 'sport', label: 'Спорт', order: 0 }]),
      },
      dayCategoryStatus: {
        findMany: jest.fn().mockResolvedValue([
          { categoryId: 1, done: true },
          { categoryId: 1, done: true },
          { categoryId: 1, done: false },
        ]),
      },
    };
    const service = new StatsService(prisma);

    const [entry] = await service.categoryStats(10);

    expect(entry).toEqual({ key: 'sport', label: 'Спорт', doneCount: 2, totalDays: 10, pct: 20 });
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd backend && bunx jest stats.service.spec.ts`
Expected: FAIL — `Cannot find module './stats.service'`.

- [ ] **Step 3: Create `backend/src/stats/stats.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, formatDate, todayDate } from '../common/date.util';

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  async categoryStats(days: number) {
    const end = todayDate();
    const start = addDays(end, -(days - 1));

    const [categories, statuses] = await Promise.all([
      this.prisma.category.findMany({ where: { archived: false }, orderBy: { order: 'asc' } }),
      this.prisma.dayCategoryStatus.findMany({
        where: { day: { date: { gte: start, lte: end } } },
        select: { categoryId: true, done: true },
      }),
    ]);

    const doneCountByCategory = new Map<number, number>();
    for (const s of statuses) {
      if (s.done) {
        doneCountByCategory.set(s.categoryId, (doneCountByCategory.get(s.categoryId) ?? 0) + 1);
      }
    }

    return categories.map((c) => {
      const doneCount = doneCountByCategory.get(c.id) ?? 0;
      return {
        key: c.key,
        label: c.label,
        doneCount,
        totalDays: days,
        pct: Math.round((doneCount / days) * 100),
      };
    });
  }

  async youtubeWeeklyStats(weeks: number) {
    const settings = await this.prisma.settings.findUnique({ where: { id: 1 } });
    const budget = settings?.youtubeBudget ?? 60;

    const todayMonday = this.mondayOf(todayDate());
    const firstMonday = addDays(todayMonday, -(weeks - 1) * 7);

    const days = await this.prisma.day.findMany({
      where: { date: { gte: firstMonday, lte: addDays(todayMonday, 6) } },
      select: { date: true, youtubeMinutes: true },
    });
    const minutesByDate = new Map(days.map((d) => [formatDate(d.date), d.youtubeMinutes]));

    const result = [];
    for (let w = 0; w < weeks; w++) {
      const weekStart = addDays(firstMonday, w * 7);
      let sum = 0;
      for (let i = 0; i < 7; i++) {
        sum += minutesByDate.get(formatDate(addDays(weekStart, i))) ?? 0;
      }
      result.push({
        weekStart: formatDate(weekStart),
        avgMinutes: Math.round((sum / 7) * 10) / 10,
        budget,
      });
    }
    return result;
  }

  async youtubeDailyStats(days: number) {
    const end = todayDate();
    const start = addDays(end, -(days - 1));

    const [settings, dayRows] = await Promise.all([
      this.prisma.settings.findUnique({ where: { id: 1 } }),
      this.prisma.day.findMany({
        where: { date: { gte: start, lte: end } },
        select: { date: true, youtubeMinutes: true },
      }),
    ]);
    const budget = settings?.youtubeBudget ?? 60;
    const minutesByDate = new Map(dayRows.map((d) => [formatDate(d.date), d.youtubeMinutes]));

    const result = [];
    for (let i = 0; i < days; i++) {
      const date = formatDate(addDays(start, i));
      const minutes = minutesByDate.get(date) ?? 0;
      result.push({
        date,
        minutes,
        budget,
        pct: budget > 0 ? Math.round((minutes / budget) * 100) : 0,
      });
    }
    return result;
  }

  private mondayOf(date: Date): Date {
    const day = date.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    return addDays(date, diff);
  }
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd backend && bunx jest stats.service.spec.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Create `backend/src/stats/stats.controller.ts`**

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('categories')
  categoryStats(@Query('days') days?: string) {
    const parsed = days ? parseInt(days, 10) : 30;
    return this.statsService.categoryStats(Number.isNaN(parsed) ? 30 : parsed);
  }

  @Get('youtube')
  youtubeWeekly(@Query('weeks') weeks?: string) {
    const parsed = weeks ? parseInt(weeks, 10) : 8;
    return this.statsService.youtubeWeeklyStats(Number.isNaN(parsed) ? 8 : parsed);
  }

  @Get('youtube-daily')
  youtubeDaily(@Query('days') days?: string) {
    const parsed = days ? parseInt(days, 10) : 30;
    return this.statsService.youtubeDailyStats(Number.isNaN(parsed) ? 30 : parsed);
  }
}
```

- [ ] **Step 6: Create `backend/src/stats/stats.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
```

- [ ] **Step 7: Modify `backend/src/app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CategoriesModule } from './categories/categories.module';
import { SettingsModule } from './settings/settings.module';
import { DaysModule } from './days/days.module';
import { DailiesModule } from './dailies/dailies.module';
import { TaskTemplatesModule } from './task-templates/task-templates.module';
import { StatsModule } from './stats/stats.module';

@Module({
  imports: [
    PrismaModule,
    CategoriesModule,
    SettingsModule,
    DaysModule,
    DailiesModule,
    TaskTemplatesModule,
    StatsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 8: Verify endpoints with curl**

```bash
cd backend && bun run start:dev &

curl -s "http://localhost:3001/stats/categories?days=30"
# Expected: 5 entries, {key,label,doneCount,totalDays:30,pct}

curl -s "http://localhost:3001/stats/youtube?weeks=8"
# Expected: 8 entries, {weekStart,avgMinutes,budget}

curl -s "http://localhost:3001/stats/youtube-daily?days=30"
# Expected: 30 entries, {date,minutes,budget,pct}, chronological, ending today
```

Stop the dev server.

- [ ] **Step 9: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add backend/src/stats backend/src/app.module.ts
git commit -m "feat(backend): add StatsModule (category %, youtube weekly, youtube daily heatmap source)"
```

---

### Task 10: Dockerize backend, finish Docker Compose, README

**Files:**
- Create: `backend/Dockerfile`
- Modify: `docker-compose.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1–9 (full working backend), `docker-compose.yml`'s `postgres` service (Task 2).
- Produces: `docker compose up -d --build` brings up `postgres` + `backend`, backend applies migrations and seeds on container start, all endpoints reachable at `http://localhost:3001` from the host. This is the last backend task — Plan 2 (frontend) will add a third `frontend` service to this same `docker-compose.yml`.

- [ ] **Step 1: Create `backend/Dockerfile`**

```dockerfile
FROM oven/bun:1-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bunx prisma generate
RUN bun run build

FROM oven/bun:1-alpine
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
EXPOSE 3001
CMD sh -c "bunx prisma migrate deploy && bunx prisma db seed && bun dist/main.js"
```

`apk add openssl` is required in both stages — Prisma's query engine needs the `openssl` CLI to detect the OpenSSL version on Alpine; without it, engine detection fails even though `libssl3` is present. `dist/main.js` (flat, not `dist/src/main.js`) depends on `backend/tsconfig.json` having `rootDir: "./src"` and excluding `prisma/**` from `include` (see Task 1) — if that ever regresses, this CMD will fail to find the file.

Both stages use the official Bun image — Bun installs a standard `node_modules` layout, and the compiled Nest output runs directly under Bun's runtime (`bun dist/main.js`), so no separate Node.js base image is needed.

- [ ] **Step 2: Modify `docker-compose.yml` to add the `backend` service**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: tracker
      POSTGRES_PASSWORD: tracker
      POSTGRES_DB: tracker
    ports:
      - "5434:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tracker -d tracker"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    build: ./backend
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://tracker:tracker@postgres:5432/tracker
      YOUTUBE_BUDGET_DEFAULT: "60"
      PORT: "3001"
    ports:
      - "3001:3001"
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  pgdata:
```

- [ ] **Step 3: Stop any locally-running dev server and any existing compose stack, then bring the full stack up from a clean state**

```bash
docker compose down
docker compose up -d --build
```

Expected: both services build/start; `docker compose ps` shows `postgres` healthy and `backend` running.

- [ ] **Step 4: Verify the containerized backend end-to-end**

```bash
docker compose logs backend | tail -30
# Expected: migration applied, seed ran, "Nest application successfully started"

curl -s http://localhost:3001/health
# Expected: {"status":"ok"}

curl -s http://localhost:3001/categories
# Expected: 5 seeded categories

docker compose restart backend
sleep 3
curl -s http://localhost:3001/categories
# Expected: same 5 categories — proves data persisted across restart, not re-seeded/duplicated (upsert is idempotent)
```

- [ ] **Step 5: Create `README.md`**

```markdown
# Daily Tracker

Personal, single-user, self-hosted daily tracker. No auth, runs only on localhost via Docker Compose.

## Run

```bash
cp .env.example .env
docker compose up -d --build
```

Backend: http://localhost:3001
Frontend: http://localhost:4887 (added in a later phase)

## Apply migrations manually (if needed)

```bash
docker compose exec backend bunx prisma migrate deploy
```

## Local backend development (without full Docker rebuild each time)

```bash
docker compose up -d postgres
cd backend
cp ../.env.example .env   # then edit DATABASE_URL host to localhost, e.g.:
                          # DATABASE_URL=postgresql://tracker:tracker@localhost:5434/tracker
bun install
bunx prisma migrate dev
bunx prisma db seed
bun run start:dev
```

## Tests

```bash
cd backend && bun run test
```
```

- [ ] **Step 5b: Create `backend/.dockerignore`**

```
node_modules
dist
.env
```

Without this, `COPY . .` in the builder stage pulls the host's locally-installed `node_modules` (and any local `dist/`/`.env`) into the Alpine build context — `bunx prisma generate` afterward regenerates the Prisma engine for `linux-musl` either way, so it's low-risk, but the stale copy is wasted layer size and a class of confusion worth avoiding outright.

- [ ] **Step 6: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add backend/Dockerfile backend/.dockerignore docker-compose.yml README.md
git commit -m "feat(backend): dockerize backend service, wire into compose, add README"
```

---

## Definition of Done for this plan

- `docker compose up -d --build` starts `postgres` + `backend` from a clean checkout.
- Every endpoint listed in Global Constraints responds correctly via curl, matching the shapes in `claude_code_prompt.md` (including the new `/stats/youtube-daily`).
- `cd backend && bun run test` passes (Categories, Settings, Days, Dailies, TaskTemplates, Stats, date.util unit tests).
- Data survives `docker compose restart backend`.
- Archiving a category does not change `completed`/`total` for days before it was archived (covered by `days.service.spec.ts`).
