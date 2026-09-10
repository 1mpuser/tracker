# Многопользовательский трекер на VPS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> План разбит на **фазы**; каждая заканчивается зелёным закоммиченным состоянием. Фазы 1–3 — код, Фаза 4 — инфраструктура в репо, Фаза 5 — переезд данных владельца (готовится и репетируется агентом, на сервере выполняется вместе с владельцем), Фаза 6 — опционально. Если задача оказывается крупнее описанного — перед реализацией детализировать её по superpowers:writing-plans в `docs/superpowers/plans/2026-09-11-multi-user-phase-N.md`.

**Goal:** Трекер на домене владельца, на его VPS, по HTTPS, для любого числа пользователей: регистрация с подтверждением почты через Resend, вход по паролю, данные каждого изолированы, iCloud Reminders и Session.app — опциональные и настраиваются каждым в интерфейсе; данные владельца переезжают без потерь и без задвоений в Telegram/iCloud.

**Architecture:** Мультиарендность на уровне приложения: `userId` в корневых таблицах, явный `userId` в каждом методе сервиса, e2e-тест изоляции. Своя аутентификация: `PendingSignup` → письмо Resend → `User` со scrypt-хэшем пароля, серверные сессии в Postgres, cookie `sid`. Учётки интеграций — в `Settings` пользователя, секреты зашифрованы AES-256-GCM. Продакшен — `docker-compose.prod.yml` за Caddy с Let's Encrypt, наружу только 80/443.

**Tech Stack:** NestJS 11 + Prisma 7 (`@prisma/adapter-pg`) + Postgres 16, Next.js App Router, Bun, Caddy 2, Resend (HTTP API), tsdav (CalDAV), Jest (+ supertest для e2e).

**Spec:** `docs/superpowers/specs/2026-09-11-multi-user-hosting-design.md` — все «почему» там, включая таблицу рисков транзита. Прочитать целиком до начала.

## Global Constraints

- **Предпосылка:** `docs/superpowers/plans/2026-09-11-distraction-and-telegram-settings.md` выполнен и смёржен в `master`. Если нет — остановиться и сообщить владельцу.
- Ветка `feat/multi-user` от `master`. В `master` мёржит только владелец.
- Bun везде (`bun`, `bunx`), не npm/yarn/pnpm.
- Коммиты — `feat(backend): …` / `feat(frontend): …` / `chore(deploy): …` / `docs: …`, описание по-русски, **без `Co-Authored-By` и любых AI-атрибуций**.
- После изменения кода — `graphify update .` (см. `AGENTS.md`), `graphify-out/` в коммит задачи.
- Unit-тесты — в стиле репо (`new XService(mockPrisma, …)`), плюс e2e на реальной БД (Task 1.1).
- Чужая запись → **404**, никогда 403 и никогда чужие данные.
- Секреты: пароли — scrypt; токены сессий/подтверждений/сброса — только sha256 в БД; токен Telegram-бота и пароль приложения iCloud — AES-256-GCM (`APP_ENCRYPTION_KEY`). Ни один секрет не возвращается API целиком и не пишется в логи.
- **Env-фоллбэков интеграций нет** (Telegram, iCloud, Session) — всё из настроек пользователя.
- «Сегодня» на бэкенде — только `todayFor(user.timezone)` (после Task 3.1).
- Миграции, трогающие существующие данные, правятся руками и проверяются на копии реальной БД владельца.
- **Никогда** не подключаться к рабочей локальной БД владельца (`tracker`) для экспериментов — только к копиям (`tracker_copy`, `tracker_rehearsal`).
- `claude_code_prompt.md`, `daily_tracker.html` — не трогать.

---

## Подготовка

- [ ] `git checkout master && git pull && git checkout -b feat/multi-user`
- [ ] `docker compose up -d postgres`; `backend/.env` с `DATABASE_URL=postgresql://tracker:tracker@localhost:5434/tracker_copy` (**копия**, не рабочая БД).
- [ ] Дамп реальных данных: `docker compose exec -T postgres pg_dump -U tracker -Fc tracker > /tmp/tracker-before-multi-user.dump`; копия: `docker compose exec postgres createdb -U tracker tracker_copy && docker compose exec -T postgres pg_restore -U tracker -d tracker_copy --no-owner < /tmp/tracker-before-multi-user.dump`.
- [ ] `docker compose exec postgres createdb -U tracker tracker_test` (для e2e).
- [ ] `cd backend && bun install && bun run test`, `cd frontend && bun install && bun run test` — зелёные.
- [ ] **Не пересобирать и не перезапускать** рабочий `docker compose` владельца с кодом этой ветки: его контейнер бэкенда при старте делает `migrate deploy` на рабочую БД. Для ручных проверок — `bun run start:dev` бэкенда с `DATABASE_URL` на копию и `bun run dev` фронта.

---

## Фаза 1 — пользователи и изоляция данных (без входа)

Итог: в схеме есть `User`, все данные принадлежат пользователю, сервисы работают в пределах `userId`. Временный guard подставляет единственного пользователя — для владельца приложение выглядит как раньше.

### Task 1.1: e2e-инфраструктура

**Files:** Create `backend/test/jest-e2e.config.ts`, `backend/test/setup-e2e.ts`, `backend/test/utils.ts`, `backend/test/smoke.e2e-spec.ts`, `backend/src/bootstrap.ts`; Modify `backend/src/main.ts`, `backend/package.json`.

- [ ] `cd backend && bun add -d supertest @types/supertest`
- [ ] `backend/test/jest-e2e.config.ts`:
```ts
import type { Config } from 'jest';

const config: Config = {
  rootDir: '..',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/test/setup-e2e.ts',
  // Одна БД на все файлы — последовательно, чтобы тесты не топтали данные друг друга.
  maxWorkers: 1,
};
export default config;
```
- [ ] `backend/test/setup-e2e.ts`:
```ts
import { execSync } from 'node:child_process';

export default async function setup() {
  const url = process.env.DATABASE_URL_TEST ?? 'postgresql://tracker:tracker@localhost:5434/tracker_test';
  process.env.DATABASE_URL = url;
  execSync('bunx prisma migrate reset --force --skip-seed', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}
```
(В Prisma 7 сверить флаги с `bunx prisma migrate reset --help`.)
- [ ] Вынести настройку приложения из `main.ts` в `backend/src/bootstrap.ts` → `export function configureApp(app: INestApplication): void` (ValidationPipe `{ whitelist: true, transform: true }`, CORS, body limit `2mb`; в Фазе 2 — cookie-parser и trust proxy). `main.ts` и e2e-утилита вызывают одно и то же.
- [ ] `backend/test/utils.ts`: `createApp()` (`Test.createTestingModule({ imports: [AppModule] })` → `configureApp` → `init`), `truncateAll(prisma)` — `TRUNCATE` всех таблиц кроме `_prisma_migrations` с `RESTART IDENTITY CASCADE`.
- [ ] `smoke.e2e-spec.ts`: `GET /` → 200.
- [ ] `package.json`: `"test:e2e": "DATABASE_URL=${DATABASE_URL_TEST:-postgresql://tracker:tracker@localhost:5434/tracker_test} jest -c test/jest-e2e.config.ts"`.
- [ ] `bun run test:e2e` → PASS; `bun run test` → PASS.
- [ ] Commit: `chore(backend): e2e-тесты на реальной базе`

### Task 1.2: Схема `User` и `userId`, миграция с передачей данных владельцу

**Files:** Modify `backend/prisma/schema.prisma`; Create миграцию `multi_user`.

- [ ] Схема:
```prisma
model User {
  id           Int      @id @default(autoincrement())
  email        String   @unique
  // null — у владельца сразу после переезда, пока set-owner не задал пароль.
  passwordHash String?
  timezone     String   @default("UTC")
  createdAt    DateTime @default(now())

  categories    Category[]
  days          Day[]
  taskTemplates TaskTemplate[]
  settings      Settings?
  gtdItems      GtdItem[]
  routines      Routine[]
  telegramChats TelegramChat[]
}

// Category: + userId Int, user User @relation(fields: [userId], references: [id], onDelete: Cascade); key без @unique; @@unique([userId, key])
// Day:      + userId/user; date без @unique; @@unique([userId, date])
// Settings: id Int @id @default(autoincrement()); + userId Int @unique, user
// TaskTemplate, GtdItem, Routine: + userId/user, @@index([userId])
// TelegramChat: + userId/user; chatId без @unique; @@unique([userId, chatId])
```
- [ ] `bunx prisma migrate dev --create-only --name multi_user` (с `DATABASE_URL` на `tracker_test` или пустую БД) и **заменить SQL руками**:
```sql
-- 1. Пользователи.
CREATE TABLE "User" (
  "id" SERIAL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- 2. Колонки пока nullable.
ALTER TABLE "Category"     ADD COLUMN "userId" INTEGER;
ALTER TABLE "Day"          ADD COLUMN "userId" INTEGER;
ALTER TABLE "TaskTemplate" ADD COLUMN "userId" INTEGER;
ALTER TABLE "Settings"     ADD COLUMN "userId" INTEGER;
ALTER TABLE "GtdItem"      ADD COLUMN "userId" INTEGER;
ALTER TABLE "Routine"      ADD COLUMN "userId" INTEGER;
ALTER TABLE "TelegramChat" ADD COLUMN "userId" INTEGER;

-- 3. Существующая однопользовательская инсталляция: всё — владельцу.
-- Адрес-заглушка; настоящий и пароль ставит scripts/set-owner.ts.
-- .invalid — зарезервированный TLD, письмо туда никогда не уйдёт.
DO $$
DECLARE owner_id INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM "Category") OR EXISTS (SELECT 1 FROM "Day") OR EXISTS (SELECT 1 FROM "GtdItem")
     OR EXISTS (SELECT 1 FROM "Settings") OR EXISTS (SELECT 1 FROM "Routine") THEN
    INSERT INTO "User" ("email") VALUES ('owner@localhost.invalid') RETURNING "id" INTO owner_id;
    UPDATE "Category"     SET "userId" = owner_id;
    UPDATE "Day"          SET "userId" = owner_id;
    UPDATE "TaskTemplate" SET "userId" = owner_id;
    UPDATE "Settings"     SET "userId" = owner_id;
    UPDATE "GtdItem"      SET "userId" = owner_id;
    UPDATE "Routine"      SET "userId" = owner_id;
    UPDATE "TelegramChat" SET "userId" = owner_id;
  END IF;
END $$;

-- 4. NOT NULL, внешние ключи (для каждой из семи таблиц).
ALTER TABLE "Category" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- ... Day, TaskTemplate, Settings, GtdItem, Routine, TelegramChat — так же

-- 5. Уникальности в пределах пользователя.
DROP INDEX "Category_key_key";
CREATE UNIQUE INDEX "Category_userId_key_key" ON "Category"("userId", "key");
DROP INDEX "Day_date_key";
CREATE UNIQUE INDEX "Day_userId_date_key" ON "Day"("userId", "date");
DROP INDEX "TelegramChat_chatId_key";
CREATE UNIQUE INDEX "TelegramChat_userId_chatId_key" ON "TelegramChat"("userId", "chatId");
CREATE UNIQUE INDEX "Settings_userId_key" ON "Settings"("userId");
CREATE INDEX "TaskTemplate_userId_idx" ON "TaskTemplate"("userId");
CREATE INDEX "GtdItem_userId_idx" ON "GtdItem"("userId");
CREATE INDEX "Routine_userId_idx" ON "Routine"("userId");

-- 6. Settings.id больше не синглтон 1.
CREATE SEQUENCE "Settings_id_seq" OWNED BY "Settings"."id";
ALTER TABLE "Settings" ALTER COLUMN "id" SET DEFAULT nextval('"Settings_id_seq"');
SELECT setval('"Settings_id_seq"', COALESCE((SELECT MAX("id") FROM "Settings"), 0) + 1, false);
```
Имена индексов сверить с тем, что сгенерировал Prisma. После — `bunx prisma migrate diff` (миграции ↔ схема) должен быть **пустым** (флаги Prisma 7 — по `--help`).
- [ ] Прогон на `tracker_copy`: `bunx prisma migrate deploy`, затем `select count(*) from "Day" where "userId" is null` → 0; количество строк во всех таблицах = как в дампе; `select email, "passwordHash" from "User"` → одна строка `owner@localhost.invalid`, `null`.
- [ ] Прогон на пустой БД (`bun run test:e2e`): пользователь не создаётся.
- [ ] Коммит — вместе с Task 1.3 (код без 1.3 не компилируется).

### Task 1.3: `userId` во всех сервисах + временный guard

**Files:** Create `backend/src/auth/{auth-user.ts,current-user.decorator.ts,single-user.guard.ts,user-bootstrap.service.ts(+spec),default-categories.ts,auth.module.ts}`; Modify все `*.service.ts`/`*.controller.ts`/specs в `categories`, `days`, `stats`, `settings`, `task-templates`, `gtd`, `routines`, `telegram`, `session`, `icloud`, `obsidian`; `backend/prisma/seed.ts`; `backend/Dockerfile`; `backend/src/app.module.ts`; `backend/src/main.ts`.

**Interfaces — Produces:**
```ts
export interface AuthUser { id: number; email: string; timezone: string }

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;
  // Дошли без пользователя — баг guard'а, а не «анонимный» запрос.
  if (!user) throw new UnauthorizedException();
  return user;
});

class UserBootstrapService {
  // В одной транзакции: User + Settings (distractionBudget из DISTRACTION_BUDGET_DEFAULT или 60) + DEFAULT_CATEGORIES.
  createUser(data: { email: string; passwordHash?: string | null; timezone?: string }): Promise<User>;
}
// Контракт для ВСЕХ сервисов: первым аргументом публичного метода — userId: number
// (или AuthUser, где нужен часовой пояс — после Task 3.1).
```
- [ ] `SingleUserGuard` — **временный**, удаляется в Task 2.3. Провайдер `SingleUserGuard` + `{ provide: APP_GUARD, useExisting: SingleUserGuard }` (так его можно переопределить в e2e). Берёт `findFirst({ orderBy: { id: 'asc' } })`; если пользователей нет — `createUser({ email: 'dev@localhost.invalid' })`.
- [ ] `DEFAULT_CATEGORIES` переезжает из `seed.ts` в `backend/src/auth/default-categories.ts`. `seed.ts` — только для локального dev (создать dev-пользователя, если пользователей нет). Из `CMD` в `backend/Dockerfile` **убрать** `bunx prisma db seed`.
- [ ] Сервисы — модуль за модулем, для каждого: spec (red) → код (green). Правила:
  - списки: `where: { userId, ... }`; создание: `data: { userId, ... }`;
  - по id: `findFirst({ where: { id, userId } })` → нет — `NotFoundException`; либо `updateMany/deleteMany({ where: { id, userId } })` с `count === 0 → 404`;
  - по уникальному: `where: { userId_key: { userId, key } }`, `where: { userId_date: { userId, date } }`;
  - `Settings`: `where: { userId }`;
  - ссылки на другие записи проверяются на владельца (`setCategoryDone` — сфера по `userId_key`; `GtdItem.parentId`, `Routine.categoryId` — `findFirst({ id, userId })`);
  - дочерние таблицы — только через проверенного родителя;
  - контроллеры: `@CurrentUser() user: AuthUser` → `service.method(user.id, ...)`;
  - в каждом spec: «userId попадает в where» и «чужой id → NotFoundException».
  Порядок: `settings` → `categories` → `task-templates` → `days` → `stats` → `gtd` → `routines` → `telegram` → `session`/`icloud`/`obsidian` (пока принимают `userId` и работают от env — переделка в Task 3.3).
- [ ] `main.ts`: стартовый `syncAllOnStartup(await gtd.getItems())` не компилируется без `userId` — временно `for (const u of await prisma.user.findMany()) await icloud.syncAllOnStartup(await gtd.getItems(u.id))`; окончательно — в Task 3.3.
- [ ] Контрольный grep, должен быть пуст: `grep -rnE "where: \{ id: 1 \}|where: \{ id \}|where: \{ key \}|where: \{ date \}" backend/src --include='*.ts' | grep -v spec`.
- [ ] `bun run test && bun run build && bun run test:e2e` → PASS. Ручная проверка на `tracker_copy` (`bun run start:dev` + `bun run dev` фронта) — у владельца всё на месте.
- [ ] Commit: `feat(backend): данные принадлежат пользователю, сервисы работают в пределах userId`

### Task 1.4: e2e-тест изоляции

**Files:** Create `backend/test/isolation.e2e-spec.ts`.

- [ ] В тесте `SingleUserGuard` переопределяется guard'ом, берущим пользователя из заголовка `x-test-user` (`overrideProvider(SingleUserGuard).useValue(...)`). В Task 2.3 тест переключается на настоящие сессии.
- [ ] Сценарий (`beforeEach`: `truncateAll`, пользователи A и B через `UserBootstrapService`):
  - A: сфера, отметка в дне `2026-09-01`, минуты залипания, GTD-элемент с подзадачей, рутина с отметкой, шаблон задачи, Telegram-чат.
  - B: `GET /categories` — только свои 5; `GET /days/2026-09-01` — пустой день; `/history`, `/stats/*` — без данных A; `/gtd/items?status=…` по всем статусам — пусто; `/routines`, `/task-templates`, `/telegram/chats` — пусто.
  - B: `PATCH`/`DELETE` по id элементов A (GTD, рутина, шаблон, чат), `PATCH /categories/<key A>` → **404**; у A всё без изменений.
  - B: `POST /gtd/items` с `parentId` A → 404/400, ничего не создано.
  - B создаёт сферу с тем же `key`, что у A → 201.
- [ ] Красный кейс = утечка → чинить сервис, не тест.
- [ ] Commit: `test(backend): e2e-тест изоляции данных между пользователями`

---

## Фаза 2 — регистрация через Resend и вход по паролю

### Task 2.1: Схема аутентификации, пароли, почта

**Files:** Modify `schema.prisma` (+ миграция `auth`); Create `backend/src/auth/{auth.config.ts,password.util.ts,mailer.service.ts,mail-templates.ts}` + specs.

- [ ] Схема:
```prisma
model PendingSignup {
  id           Int      @id @default(autoincrement())
  email        String   @unique
  passwordHash String
  tokenHash    String   @unique
  codeHash     String
  attempts     Int      @default(0)
  expiresAt    DateTime
  createdAt    DateTime @default(now())
}

model PasswordReset {
  id        Int       @id @default(autoincrement())
  userId    Int
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  @@index([userId])
}

model Session {
  id         Int      @id @default(autoincrement())
  userId     Int
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash  String   @unique
  expiresAt  DateTime
  lastSeenAt DateTime @default(now())
  userAgent  String?
  createdAt  DateTime @default(now())
  @@index([userId])
}
// User: + sessions Session[], passwordResets PasswordReset[]
```
- [ ] `password.util.ts` (тесты: round-trip; неверный пароль → false; строка с другими параметрами N проверяется по своим параметрам; `needsRehash` при устаревших параметрах):
```ts
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const N = 32768, R = 8, P = 1, KEYLEN = 64;
// maxmem с запасом: 128 * N * r = 32 МБ, дефолтный лимит Node — ровно 32 МБ и падает.
const MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM,
  });
  return timingSafeEqual(actual, expected);
}

export function needsRehash(stored: string): boolean {
  const [, n, r, p] = stored.split('$');
  return Number(n) !== N || Number(r) !== R || Number(p) !== P;
}

// Хэш «пустышки» для входа на несуществующий адрес: время ответа не выдаёт, есть ли пользователь.
export const DUMMY_HASH = 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==';
```
(`DUMMY_HASH` сгенерировать реальным `hashPassword` один раз и вставить константой.)
- [ ] `auth.config.ts` — `loadAuthConfig(env)`: `appUrl` (`APP_URL`), `signupMode` (`open` по умолчанию | `allowlist` | `closed`), `allowedEmails`, `resendApiKey`, `mailFrom`, `cookieSecure` (по умолчанию `true` при `NODE_ENV=production`), `sessionDays` (30). В `production` без `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL`, `APP_ENCRYPTION_KEY` → `Error` с понятным текстом. Вызывается при старте (в `AuthModule`), чтобы прод падал сразу, а не при первой регистрации. Unit-тест на каждое правило.
- [ ] `mail-templates.ts` — три функции, каждая возвращает `{ subject, html, text }`, все подстановки через `escapeHtml`:
  - `signupConfirmMail(link, code)` — «Подтвердите регистрацию в трекере», кнопка-ссылка, код крупно, «ссылка и код действуют 24 часа; если вы не регистрировались — проигнорируйте письмо»;
  - `alreadyRegisteredMail(loginUrl, forgotUrl)` — «Кто-то пытался зарегистрироваться на ваш адрес. Если это вы — войдите или восстановите пароль»;
  - `passwordResetMail(link)` — «Сброс пароля», «ссылка действует 30 минут».
- [ ] `MailerService.send(to, mail)`: с ключом — `POST https://api.resend.com/emails` (`Authorization: Bearer`, `{ from, to: [to], subject, html, text }`, `AbortSignal.timeout(10000)`); без ключа (только не production) — `logger.log` с темой и текстом. Ошибка Resend → бросает `Error` без API-ключа в тексте. Тесты с моком `fetch`.
- [ ] Commit: `feat(backend): схема аутентификации, пароли scrypt, письма через Resend`

### Task 2.2: AuthService, эндпоинты, SessionGuard

**Files:** Create `backend/src/auth/{auth.service.ts,auth.controller.ts,session.guard.ts,public.decorator.ts,dto/*.ts}` + specs; Modify `bootstrap.ts`, `package.json` (`cookie-parser`, `@types/cookie-parser`, `@nestjs/throttler`), `app.controller.ts`.

**Interfaces — Produces:**
```ts
type SessionResult = { sessionToken: string; user: AuthUser };
interface Meta { userAgent?: string }

class AuthService {
  register(email: string, password: string, timezone?: string): Promise<void>;      // никогда не раскрывает, занят ли адрес
  confirmByToken(token: string, meta: Meta): Promise<SessionResult>;               // 401
  confirmByCode(email: string, code: string, meta: Meta): Promise<SessionResult>;  // 401
  resendConfirmation(email: string): Promise<void>;                                // новый токен/код, если есть PendingSignup
  login(email: string, password: string, meta: Meta): Promise<SessionResult>;      // 401 «Неверная почта или пароль»
  forgot(email: string): Promise<void>;
  reset(token: string, password: string, meta: Meta): Promise<SessionResult>;      // закрывает все сессии, выдаёт новую
  changePassword(userId: number, current: string, next: string, currentSessionToken: string): Promise<void>; // закрывает остальные сессии
  resolveSession(sessionToken: string): Promise<AuthUser | null>;                  // продление не чаще раза в сутки
  logout(sessionToken: string): Promise<void>;
  logoutAll(userId: number): Promise<void>;
  updateTimezone(userId: number, timezone: string): Promise<AuthUser>;             // 400 на неизвестный пояс
}
```
Эндпоинты (все `/auth/*` — `@Public()`, кроме `me`, `logout-all`, `password`, `PATCH me`):

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password, timezone? }` | 204 |
| POST | `/auth/register/confirm` | `{ token }` или `{ email, code }` | 200 `{ user }` + cookie |
| POST | `/auth/register/resend` | `{ email }` | 204 |
| POST | `/auth/login` | `{ email, password }` | 200 `{ user }` + cookie |
| POST | `/auth/forgot` | `{ email }` | 204 |
| POST | `/auth/reset` | `{ token, password }` | 200 `{ user }` + cookie |
| GET | `/auth/me` | — | `{ user }` |
| PATCH | `/auth/me` | `{ timezone }` | `{ user }` |
| POST | `/auth/password` | `{ current, next }` | 204 |
| POST | `/auth/logout` | — | 204, cookie очищена |
| POST | `/auth/logout-all` | — | 204, cookie очищена |

- [ ] Тесты AuthService (red), ключевые:
  - email везде `trim().toLowerCase()`; пароль 8–128 символов (DTO: `@Length(8, 128)`), иначе 400;
  - `register` при `signupMode=closed` или адресе вне allowlist → писем нет, записей нет, промис резолвится;
  - `register` нового адреса → `PendingSignup` (`passwordHash` — scrypt, `tokenHash = sha256(token)`, `codeHash = sha256(email + ':' + code)`, `expiresAt ≈ now + 24 ч`), письмо `signupConfirmMail` со ссылкой `${appUrl}/register/confirm?token=<token>` и кодом; в БД нет открытых token/code/пароля;
  - `register` на уже существующего `User` → `PendingSignup` не создаётся, уходит `alreadyRegisteredMail`;
  - повторный `register` до подтверждения → прежняя запись заменяется (upsert по email);
  - `confirmByToken`: неизвестный/просроченный → 401; успех → `UserBootstrapService.createUser({ email, passwordHash, timezone })`, `PendingSignup` удалена, создана `Session`;
  - `confirmByCode`: неверный код → `attempts++`; 5-я неудача → запись удаляется; верный — как `confirmByToken`; сравнение кода — `timingSafeEqual` хэшей;
  - `login`: неверный пароль / нет пользователя / `passwordHash = null` → одинаковое 401, и `verifyPassword` вызывается во всех трёх случаях (с `DUMMY_HASH`); успех → `Session`; `needsRehash` → пароль перехэшируется;
  - `forgot`: существующий пользователь → `PasswordReset` (sha256, 30 мин) и письмо; несуществующий → ничего, тот же ответ;
  - `reset`: использованный/просроченный → 401; успех → новый `passwordHash`, `usedAt`, `Session.deleteMany({ userId })`, новая сессия;
  - `changePassword`: неверный текущий → 400; успех → удалены все сессии пользователя, кроме текущей;
  - `resolveSession`: просроченная → `null`; `lastSeenAt` старше суток → продление.
  Токены — `randomBytes(32).toString('base64url')`, код — `randomInt(0, 1_000_000).toString().padStart(6, '0')`.
- [ ] Ограничение отправки писем (защита квоты Resend): не больше 5 писем на один адрес в час (счёт по `PendingSignup.createdAt`/`PasswordReset.createdAt`), сверх — молча не отправлять.
- [ ] Чистка: при старте и раз в сутки (`setInterval` в `onModuleInit`, `unref()`) удалять просроченные `PendingSignup`, `PasswordReset`, `Session`.
- [ ] `SessionGuard` — глобальный `APP_GUARD` вместо `SingleUserGuard`: пропускает `@Public()`; иначе `req.cookies.sid` → `resolveSession` → `req.user` или 401.
- [ ] Cookie ставит контроллер (`@Res({ passthrough: true })`): `res.cookie('sid', token, { httpOnly: true, secure: cfg.cookieSecure, sameSite: 'lax', path: '/', maxAge: cfg.sessionDays * 86_400_000 })`; очистка — `res.clearCookie('sid', { path: '/' })`.
- [ ] `bootstrap.ts`: `app.use(cookieParser())`; `app.getHttpAdapter().getInstance().set('trust proxy', 1)`; CORS — `origin` из `CORS_ORIGINS` (через запятую; по умолчанию `http://localhost:4887,https://tracker.performance:4888`), `credentials: true`.
- [ ] Throttler: глобально `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])`; `@Throttle` на `login` (5/мин), `register` и `register/resend` (3/час), `register/confirm` (10/мин), `forgot` (3/час). Для лимитов «на email» — отдельный счёт в сервисе (см. выше).
- [ ] `GET /health` (`@Public()`): `SELECT 1` → `{ ok: true }`.
- [ ] Удалить `SingleUserGuard`. e2e-утилита `loginAs(app, email)` — создаёт пользователя с паролем и логинится через `/auth/login`, возвращает cookie; `isolation.e2e-spec.ts` — на cookie. Новый `auth.e2e-spec.ts` (с моком `MailerService`, перехватывающим письма): без cookie любой эндпоинт данных → 401, `/health` → 200; полный цикл register → письмо → confirm по токену → `/auth/me`; confirm по коду; login/logout; forgot → reset → старая cookie даёт 401.
- [ ] `bun run test && bun run test:e2e && bun run build` → PASS.
- [ ] Commit: `feat(backend): регистрация с подтверждением почты и вход по паролю`

### Task 2.3: Фронтенд — регистрация, вход, сброс, «Аккаунт»

**Files:** Create `frontend/app/login/page.tsx`, `frontend/app/register/page.tsx`, `frontend/app/register/confirm/page.tsx`, `frontend/app/forgot/page.tsx`, `frontend/app/reset/page.tsx`, `frontend/app/(auth)/Auth.module.css` (или `frontend/components/AuthLayout.tsx` + CSS), `frontend/components/AccountTab.tsx`; Modify `frontend/lib/api.ts` (+ spec), `frontend/types/api.ts`, `frontend/components/SettingsModal.tsx`, `frontend/components/Header.tsx`, `frontend/components/Dashboard.tsx`.

- [ ] `lib/api.ts` (тесты red → green):
  - `resolveApiUrl()`: `NEXT_PUBLIC_API_URL`, начинающийся с `/`, — путь на своём origin (хак для `tracker.performance` оставить).
  - `request()`: `credentials: 'include'`; `401` на не-auth-странице → `window.location.href = '/login'` и никогда не резолвящийся промис.
  - Функции: `register`, `confirmSignupToken`, `confirmSignupCode`, `resendSignup`, `login`, `forgotPassword`, `resetPassword`, `getMe`, `updateMe`, `changePassword`, `logout`, `logoutAll`; тип `AuthUser`.
- [ ] Экраны (стиль — переменные `globals.css`, одна колонка по центру, без UI-библиотек):
  - `/login`: почта, пароль, «Войти»; ссылки «Регистрация», «Забыли пароль?»; ошибка «Неверная почта или пароль».
  - `/register`: почта, пароль, повтор (совпадение проверяется на клиенте), «Зарегистрироваться» → тот же экран переходит в шаг «Проверьте почту {email}»: поле кода (`inputMode="numeric"`, `autoComplete="one-time-code"`, 6 цифр), «Отправить ещё раз» (не чаще раза в 60 с, таймер на кнопке), подсказка «Письма нет — загляните в спам». Часовой пояс уходит в `register` из `Intl.DateTimeFormat().resolvedOptions().timeZone`.
  - `/register/confirm`: `useSearchParams().get('token')` → `confirmSignupToken` → `/`; ошибка → «Ссылка устарела — зарегистрируйтесь ещё раз» + ссылка. Обёрнута в `<Suspense>`.
  - `/forgot`: почта → «Если адрес зарегистрирован, мы отправили письмо».
  - `/reset`: новый пароль + повтор → `resetPassword` → `/`. `<Suspense>`.
- [ ] `AccountTab` («Аккаунт» в настройках): почта (read-only), часовой пояс (`<select>` из `Intl.supportedValuesOf('timeZone')`), смена пароля (текущий, новый, повтор), «Выйти», «Выйти на всех устройствах».
- [ ] `Header`: email пользователя мелко рядом с шестерёнкой. `Dashboard` грузит `getMe()` вместе с остальным.
- [ ] `bun run test && bun run build` → PASS. Руками (бэкенд на `tracker_copy`, без `RESEND_API_KEY` — письма в логе): регистрация → код из лога → вход; вторая регистрация в приватном окне — данные не пересекаются; сброс пароля по ссылке из лога; смена пароля выкидывает вторую вкладку.
- [ ] Commit: `feat(frontend): регистрация, вход, сброс пароля, вкладка «Аккаунт»`

---

## Фаза 3 — всё, что было «одно на всех»

### Task 3.1: Часовой пояс пользователя

- [ ] `common/date.util.ts`: `todayFor(timezone: string): Date` — `new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())` → `parseDateParam`. Тесты с фейковым временем: `2026-09-11T22:30Z` → `Europe/Moscow` = `2026-09-12`, `America/New_York` = `2026-09-11`.
- [ ] Заменить `todayDate()` в `stats.service.ts`, `days.service.ts` (`getHistory`), `routines.service.ts`, `obsidian.service.ts` → методы получают `AuthUser`. `grep -rn "todayDate()" backend/src | grep -v spec | grep -v date.util` → пусто.
- [ ] Commit: `feat(backend): «сегодня» считается в часовом поясе пользователя`

### Task 3.2: Шифрование секретов и Telegram без env

**Files:** Create `backend/src/common/crypto.util.ts` (+ spec); Modify `telegram-config.service.ts` (+ spec), `frontend/components/TelegramChatsTab.tsx`, `frontend/components/TelegramBotTab.tsx`.

- [ ] `crypto.util.ts`:
```ts
// Формат: "enc:v1:" + base64(iv(12) | tag(16) | ciphertext). Префикс отличает
// зашифрованное от открытого текста, оставшегося от однопользовательской версии.
export function encryptSecret(plain: string, keyB64: string): string;
export function decryptSecret(stored: string, keyB64: string): string; // бросает на чужом ключе/подмене
export function isEncrypted(stored: string): boolean;
export function loadEncryptionKey(env = process.env): string; // 32 байта base64; в production без ключа — Error при старте
```
Тесты: round-trip; другой ключ → ошибка; изменённый байт → ошибка; ключ не 32 байта → ошибка.
- [ ] Telegram: токен бота пишется зашифрованным, читается расшифровкой. **Одноразовая миграция при старте** (`TelegramConfigService.onModuleInit`): для каждого `Settings` с `telegramBotToken`, где `!isEncrypted(value)`, — зашифровать и сохранить, в лог: «Токен Telegram пользователя #id зашифрован» (без значения). Это то, что сделает открытые токены из дампа владельца безопасными.
- [ ] Удалить env-фоллбэк (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`) из `TelegramConfigService`, поле `envFallback`/`source: 'env'` из API и UI (баннер «чат из .env», подпись «из .env»), соответствующие тесты.
- [ ] Commit: `feat: секреты интеграций шифруются, Telegram только из настроек пользователя`

### Task 3.3: iCloud и Session — из env в настройки пользователя

**Files:** Modify `schema.prisma` (+ миграция `integrations_settings`); `backend/src/icloud/{caldav.client.ts,icloud.service.ts}` (+ specs); `backend/src/session/session.service.ts` (+ spec); `backend/src/gtd/gtd.service.ts` (+ spec); `backend/src/main.ts`; Create `backend/src/integrations/{integrations.controller.ts,integrations.service.ts,dto/*.ts}` (+ specs), `backend/src/integrations/integrations.module.ts`; Frontend: Create `frontend/components/ICloudTab.tsx`, `frontend/components/SessionTab.tsx`; Modify `SettingsModal.tsx`, `lib/api.ts`, `types/api.ts`, компоненты с кнопкой синка Session (`PomodoroPanel`/`Dashboard`).

**Interfaces — Produces:**
```ts
// Settings (Prisma): + icloudAppleId String?, icloudAppPasswordEnc String?, icloudRemindersList String @default("GTD"),
//                    + sessionCalendarName String?, sessionMinMinutes Int @default(20)

interface ICloudCredentials { appleId: string; appPassword: string }

class CalDavClient {
  // Кэш на пользователя; fingerprint = sha256(appleId + ':' + appPassword) — сменили учётку → новый клиент.
  // Неудачный логин НЕ кэшируется (правило из git-истории сохраняется).
  getClient(userId: number, creds: ICloudCredentials): Promise<DAVClient | null>;
  findCalendar(userId: number, creds: ICloudCredentials, name: string): Promise<DAVCalendar | null>;
  forget(userId: number): void;
}

class IntegrationsService {
  icloudCredentials(userId: number): Promise<ICloudCredentials | null>; // расшифрованные, для ICloudService/SessionService
  getICloud(userId: number): Promise<{ configured: boolean; appleId: string | null; remindersList: string }>; // без пароля
  setICloud(userId: number, dto: { appleId: string; appPassword: string; remindersList?: string }): Promise<...>;
    // проверка: логин CalDAV + список remindersList существует; иначе 400 с понятным текстом, ничего не сохраняется
  clearICloud(userId: number): Promise<...>;   // также очищает Session (без iCloud он не работает); напоминания в iCloud НЕ удаляет
  resyncICloud(userId: number): Promise<{ synced: number }>; // syncAll по GTD пользователя
  getSession(userId: number): Promise<{ configured: boolean; calendarName: string | null; minMinutes: number; icloudConfigured: boolean }>;
  setSession(userId: number, dto: { calendarName: string; minMinutes?: number }): Promise<...>; // 409 без iCloud; 400 если календаря нет
  clearSession(userId: number): Promise<...>;
}
```
Эндпоинты: `GET/PUT/DELETE /integrations/icloud`, `POST /integrations/icloud/resync`, `GET/PUT/DELETE /integrations/session`.

- [ ] Миграция добавляет колонки (без `DROP`). Env `ICLOUD_*`, `SESSION_*` из кода удаляются полностью: `grep -rn "ICLOUD_\|SESSION_CALENDAR\|SESSION_MIN" backend/src` → пусто (кроме тестов, проверяющих, что env **не** используется).
- [ ] Тесты (red → green), ключевые:
  - `CalDavClient`: два пользователя — два разных клиента; повтор с той же учёткой — из кэша; смена пароля — новый логин; неудачный логин не кэшируется; `forget` сбрасывает.
  - `IntegrationsService.setICloud`: неверный логин → 400, `settings.update` не вызван; нет списка → 400 «В iCloud нет списка «GTD» — создайте его в «Напоминаниях» или укажите другое имя»; успех → пароль в БД зашифрован (`isEncrypted`), `getICloud` не содержит пароля.
  - `ICloudService.syncReminder(userId, item, due)`: нет учётки → no-op без сетевых вызовов; есть → upsert в список пользователя. `removeReminder`/`completeReminder` — так же.
  - `SessionService.syncDate(user, date)`: окна дня — в `user.timezone` (не `process.env.TZ`); нет учётки/календаря → `null` (контракт «null — не трогать счётчик» сохраняется).
  - `GtdService`: передаёт `userId` в `ICloudService`.
  - `GET /settings` отдаёт per-user `icloudEnabled`, `sessionSyncEnabled`.
  - Утечки секретов: ни один `logger.warn` не содержит пароля приложения (тест с паролем в тексте ошибки tsdav).
- [ ] `main.ts`: стартовый синк — по всем пользователям с настроенным iCloud, последовательно, каждый в своём `try/catch`, в фоне (не блокировать `app.listen`).
- [ ] Фронт:
  - `ICloudTab`: статус («Подключено: {appleId} · список «{list}»» / «Не подключено»), поля Apple ID, пароль приложения (`type="password"`), имя списка; «Подключить»/«Заменить», «Отключить», «Синхронизировать все напоминания» (показывает `synced`). Подсказка: «Нужен пароль приложения, а не пароль Apple ID: appleid.apple.com → Вход и безопасность → Пароли приложений. Список «GTD» создайте в «Напоминаниях»». Всё опционально — без настройки трекер работает как раньше.
  - `SessionTab`: без iCloud — «Сначала подключите iCloud»; иначе имя календаря, минимальная длина сессии (мин), сохранить/отключить. Подсказка: календарь, в который Session.app пишет сессии фокуса.
  - Кнопка синка помидорок из Session на главном экране — только при `settings.sessionSyncEnabled` (как сейчас, но флаг per-user).
  - Вкладки в `SettingsModal`: «Категории», «Шаблоны задач», «Залипание», «Telegram-бот», «Чаты», «iCloud», «Session», «Аккаунт» (при нехватке ширины — `flex-wrap`).
- [ ] Obsidian: в `docker-compose.prod.yml` `OBSIDIAN_EXPORT_DIR` не передаётся → сервис no-op; флаг `obsidianEnabled` в `GET /settings`, фронт прячет связанные подписи.
- [ ] `bun run test && bun run test:e2e && bun run build` (оба пакета) → PASS. e2e: пользователь B не видит `appleId` пользователя A; `GET /integrations/icloud` никогда не содержит пароля.
- [ ] Commit: `feat: iCloud и Session настраиваются каждым пользователем в интерфейсе`

### Task 3.4: Пустой аккаунт выглядит осмысленно

- [ ] Проверить все экраны на новом пользователе (без дней, GTD, рутин, интеграций): нет падений, `NaN`, пустых графиков без подписи. Пустые состояния — короткий текст.
- [ ] e2e: новый пользователь → все экранные `GET` → 200 и валидные пустые структуры.
- [ ] Commit: `feat: пустой аккаунт выглядит осмысленно`

---

## Фаза 4 — продакшен в репозитории

### Task 4.1: `docker-compose.prod.yml`, Caddy, env

**Files:** Create `docker-compose.prod.yml`, `caddy/Caddyfile.prod`, `.env.prod.example`; Modify `.gitignore`.

- [ ] `docker-compose.prod.yml`:
```yaml
x-logging: &logging
  driver: json-file
  options: { max-size: "10m", max-file: "3" }

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: tracker
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?задайте POSTGRES_PASSWORD}
      POSTGRES_DB: tracker
    # Никаких ports: Docker публикует порты в обход UFW.
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tracker -d tracker"]
      interval: 5s
      timeout: 5s
      retries: 10
    logging: *logging

  backend:
    build: ./backend
    restart: unless-stopped
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://tracker:${POSTGRES_PASSWORD}@postgres:5432/tracker
      PORT: "3001"
      APP_URL: https://${DOMAIN:?задайте DOMAIN}
      CORS_ORIGINS: https://${DOMAIN}
      COOKIE_SECURE: "true"
      SIGNUP_MODE: ${SIGNUP_MODE:-open}
      ALLOWED_EMAILS: ${ALLOWED_EMAILS:-}
      RESEND_API_KEY: ${RESEND_API_KEY:?задайте RESEND_API_KEY}
      MAIL_FROM: ${MAIL_FROM:?задайте MAIL_FROM}
      APP_ENCRYPTION_KEY: ${APP_ENCRYPTION_KEY:?задайте APP_ENCRYPTION_KEY}
      DISTRACTION_BUDGET_DEFAULT: "60"
      TZ: UTC
    depends_on:
      postgres: { condition: service_healthy }
    logging: *logging

  frontend:
    build:
      context: ./frontend
      args:
        NEXT_PUBLIC_API_URL: /api
    restart: unless-stopped
    depends_on: [backend]
    logging: *logging

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    environment:
      DOMAIN: ${DOMAIN}
      ACME_EMAIL: ${ACME_EMAIL:?задайте ACME_EMAIL}
    ports: ["80:80", "443:443", "443:443/udp"]
    volumes:
      - ./caddy/Caddyfile.prod:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on: [frontend, backend]
    logging: *logging

volumes:
  pgdata:
  caddy_data:
  caddy_config:
```
- [ ] `caddy/Caddyfile.prod`:
```
{
	email {$ACME_EMAIL}
}

{$DOMAIN} {
	encode zstd gzip

	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		X-Frame-Options "DENY"
		-Server
	}

	handle_path /api/* {
		reverse_proxy backend:3001
	}

	handle {
		reverse_proxy frontend:3000
	}
}

www.{$DOMAIN} {
	redir https://{$DOMAIN}{uri} permanent
}
```
- [ ] `.env.prod.example` — все переменные с комментариями по-русски (`APP_ENCRYPTION_KEY`: `openssl rand -base64 32`, **сохранить в менеджер паролей — без него секреты интеграций не расшифровать**; `POSTGRES_PASSWORD`: `openssl rand -base64 24 | tr -d '/+='`). `.gitignore`: `.env.prod`, `*.dump`.
- [ ] `docker compose -f docker-compose.prod.yml config` падает с понятным текстом при пустом env и проходит с заполненным; `docker compose -f docker-compose.prod.yml build` собирается.
- [ ] Commit: `chore(deploy): продакшен-компоуз и Caddy для своего домена`

### Task 4.2: Скрипты обслуживания

**Files:** Create `deploy/backup.sh`, `deploy/restore.sh`, `deploy/deploy.sh`, `deploy/verify-migration.sql`, `backend/scripts/set-owner.ts`, `backend/scripts/reset-password.ts`; Modify `backend/package.json`, `backend/Dockerfile` (`COPY` папки `scripts`).

- [ ] `deploy/backup.sh` — `pg_dump -Fc` через `docker compose -f docker-compose.prod.yml exec -T postgres` в `/var/backups/tracker/tracker-$(date +%F-%H%M).dump`, `chmod 600`, удаление старше 14 дней, опционально `rclone copy` при заданном `RCLONE_REMOTE`; `set -euo pipefail`; пустой файл → код 1.
- [ ] `deploy/restore.sh <file.dump>` — подтверждение `read -p`, `stop backend`, `pg_restore --clean --if-exists --no-owner -d tracker`, `start backend`.
- [ ] `deploy/deploy.sh` — `git pull --ff-only` → `./deploy/backup.sh` (если БД уже не пустая) → `up -d --build` → ждать `curl -fsS https://$DOMAIN/api/health` до 90 с, иначе `logs --tail=100 backend` и код 1.
- [ ] `deploy/verify-migration.sql` — работает и на старой (однопользовательской), и на новой схеме, считает только поля, существовавшие до переезда:
```sql
SELECT 'Day' AS t, count(*) AS n, md5(string_agg(date::text || ':' || "distractionMinutes" || ':' || pomodoros || ':' || "eveningClosed" || ':' || coalesce(rating::text,'') || ':' || coalesce(comment,''), '|' ORDER BY date)) AS sum FROM "Day"
UNION ALL SELECT 'DayCategoryStatus', count(*), md5(string_agg("dayId" || ':' || "categoryId" || ':' || done, '|' ORDER BY "dayId", "categoryId")) FROM "DayCategoryStatus"
UNION ALL SELECT 'Category', count(*), md5(string_agg(key || ':' || label || ':' || archived, '|' ORDER BY key)) FROM "Category"
UNION ALL SELECT 'GtdItem', count(*), md5(string_agg(id || ':' || title || ':' || status || ':' || coalesce("plannedDate"::text,''), '|' ORDER BY id)) FROM "GtdItem"
UNION ALL SELECT 'Routine', count(*), md5(string_agg(id || ':' || title, '|' ORDER BY id)) FROM "Routine"
UNION ALL SELECT 'RoutineLog', count(*), md5(string_agg("routineId" || ':' || date || ':' || count, '|' ORDER BY "routineId", date)) FROM "RoutineLog"
UNION ALL SELECT 'TaskTemplate', count(*), md5(string_agg(id || ':' || text, '|' ORDER BY id)) FROM "TaskTemplate"
UNION ALL SELECT 'TelegramChat', count(*), md5(string_agg("chatId" || ':' || daily || ':' || weekly, '|' ORDER BY "chatId")) FROM "TelegramChat"
UNION ALL SELECT 'TelegramPost', count(*), md5(string_agg("dayId" || ':' || "chatId" || ':' || kind || ':' || "messageId", '|' ORDER BY "dayId", "chatId", kind)) FROM "TelegramPost";
```
(Имена колонок сверить со схемой на момент выполнения; `DayCategoryStatus.done` — проверить фактическое имя поля.)
- [ ] `backend/scripts/set-owner.ts` — `bun run set-owner --email you@mail.ru --timezone Europe/Moscow [--password-stdin]`: находит `owner@localhost.invalid` (нет → ошибка «владелец уже назначен или база не из однопользовательской версии»; адрес занят → ошибка), ставит email, timezone и пароль (интерактивный ввод без эха через `readline` с отключённым выводом, либо из stdin при `--password-stdin`; 8–128 символов). **Пароль никогда не аргументом командной строки.**
- [ ] `backend/scripts/reset-password.ts` — `bun run reset-password --email x [--password-stdin]`: новый пароль, удаляет все сессии пользователя.
- [ ] Оба скрипта попадают в образ бэкенда; запуск на сервере: `docker compose -f docker-compose.prod.yml exec -it backend bun run set-owner ...`.
- [ ] Commit: `chore(deploy): бэкапы, деплой, проверка переезда, назначение владельца`

### Task 4.3: `docs/deploy.md` — инструкция для человека

Пошаговый документ по-русски, с командами для копирования:
1. **Что купить:** VPS (Ubuntu 24.04, 2 vCPU / 4 ГБ; с сервера проверить `curl -sI https://api.telegram.org https://caldav.icloud.com https://api.resend.com`), домен.
2. **DNS:** A/AAAA на IP; `dig +short домен`.
3. **Resend (обязательно):** домен/поддомен `mail.домен`, DKIM/SPF/MX + `_dmarc`, Verified, ключ «Sending access». Тест: зарегистрироваться самому, проверить, что письмо не в спаме на Gmail и на почте друга.
4. **Сервер:** пользователь `deploy`, SSH-ключи, `PasswordAuthentication no`, `PermitRootLogin no`, `ufw allow OpenSSH && ufw allow 80,443/tcp && ufw allow 443/udp && ufw enable`, `fail2ban`, `unattended-upgrades`, Docker (`get.docker.com`), swap 2 ГБ при RAM < 4 ГБ.
5. **Код:** deploy-ключ GitHub (read-only), `git clone`, `cp .env.prod.example .env.prod`, заполнить, `ln -s .env.prod .env`.
6. **Первый запуск** (если переезд — сначала Фаза 5!): `./deploy/deploy.sh`, проверить `https://домен`, `/api/health`.
7. **Бэкапы:** cron `15 3 * * * /home/deploy/tracker/deploy/backup.sh >> /var/log/tracker-backup.log 2>&1`; rclone (опционально); ежемесячная проверка восстановления в `tracker_restore_test`.
8. **Мониторинг:** UptimeRobot на `/api/health`.
9. **Обновление:** `./deploy/deploy.sh`. Откат: `git checkout <коммит> && up -d --build` + при необходимости `restore.sh` последнего дампа (миграции назад не катятся).
10. **Если пошли боты:** `SIGNUP_MODE=closed` (или `allowlist` + `ALLOWED_EMAILS`) в `.env.prod`, `up -d backend`.
11. **Частые проблемы:** сертификат не выпускается (DNS/порт 80); письма не приходят (Resend не Verified, `MAIL_FROM` не на подтверждённом домене — `docker compose logs backend`); 401 сразу после входа (`COOKIE_SECURE` + http или фронт собран не с `NEXT_PUBLIC_API_URL=/api`); 502 (бэкенд упал на проверке env); iCloud не подключается (нужен пароль приложения, не пароль Apple ID).

- [ ] Ссылка на `docs/deploy.md` из `README.md`; обновить `CLAUDE.md` (прод-компоуз, `CORS_ORIGINS`), `backend/CLAUDE.md` (`auth`, `integrations`, правило «userId первым аргументом», e2e), `frontend/CLAUDE.md` (auth-страницы, 401-редирект, `credentials: 'include'`, новые вкладки), `docs/system-overview.md`.
- [ ] Commit: `docs: как поднять трекер на своём VPS`

---

## Фаза 5 — переезд данных владельца и транзит

Цель — **ни одной потерянной записи, ни одного задвоенного поста в Telegram, ни одного конфликта в iCloud**, и возможность вернуться к локальной версии. Таблица рисков — в спеке, «Развилка 7».

### Task 5.1: Скрипты транзита

**Files:** Create `deploy/transit/{1-rehearsal.sh,2-final-dump.sh,3-restore-on-server.sh,4-disarm-local.sh,rollback.md}`.

- [ ] `1-rehearsal.sh` (локально, многократно): дамп рабочей БД → восстановление в `tracker_rehearsal` → `verify-migration.sql` на рабочей → поднять бэкенд ветки на `tracker_rehearsal` (`migrate deploy`) → `set-owner` → `verify-migration.sql` на `tracker_rehearsal` → `diff` двух выводов; расхождение → код 1. Рабочую БД только читает.
- [ ] `2-final-dump.sh` (локально, в день переезда):
  1. `docker compose stop frontend backend` — с этого момента писать некому (окно заморозки начинается).
  2. `verify-migration.sql` → `transit/before.txt`.
  3. `pg_dump -Fc` → `tracker-final.dump`, `chmod 600`, `shasum -a 256` → `tracker-final.dump.sha256`.
  4. Печатает: что копировать на сервер и командой какой.
  Postgres локально **не останавливает и не трогает** — это точка отката.
- [ ] `3-restore-on-server.sh` (на VPS; предполагает, что `backend` там **ещё ни разу не стартовал**):
  1. `shasum -a 256 -c tracker-final.dump.sha256`.
  2. Проверить, что в прод-БД нет таблиц (`\dt` пусто), иначе — стоп с объяснением.
  3. `up -d postgres` → `pg_restore --no-owner -d tracker < tracker-final.dump`.
  4. `./deploy/deploy.sh` → бэкенд применяет миграции (`multi_user`, `auth`, `integrations_settings`…) и шифрует токен Telegram (Task 3.2).
  5. `exec -it backend bun run set-owner --email … --timezone …` (пароль — интерактивно).
  6. `verify-migration.sql` → `after.txt`; вывести для сравнения с `before.txt`.
  7. `shred -u tracker-final.dump` (или `rm` на файловых системах без shred).
- [ ] `4-disarm-local.sh` (локально, после успешной проверки на сервере): делает локальный стек безопасным, чтобы он никогда не писал в те же внешние сервисы:
  - в локальном `.env` закомментировать `TELEGRAM_*`, `ICLOUD_*`, `SESSION_*` (с бэкапом `.env.before-transit`);
  - `UPDATE "Settings" SET "telegramBotToken" = NULL` в локальной БД;
  - локальную БД **не удалять** (откат).
- [ ] `rollback.md` — два сценария:
  - **Онлайн не заработал, новых данных там нет:** `.env.before-transit` → `.env`, в локальной БД вернуть токен бота (или вставить в UI), `docker compose start backend frontend`. Сервер остановить (`docker compose -f docker-compose.prod.yml stop`), чтобы не было двух писателей.
  - **Онлайн работал N дней, потом решили вернуться:** дамп с сервера → восстановить локально в стек **ветки `feat/multi-user`** (схема новая; однопользовательский `master` её не прочитает) → там `APP_ENCRYPTION_KEY` сервера, иначе секреты интеграций вводить заново.
- [ ] Прогнать `1-rehearsal.sh` минимум дважды, приложить к отчёту выводы `before`/`after`.
- [ ] Commit: `chore(deploy): скрипты переезда и отката`

### Task 5.2: Ранбук дня переезда (в `docs/deploy.md`, раздел «Переезд с локального трекера»)

Порядок, который выполняет владелец (агент — только с явного разрешения и доступом):

1. **За день:** сервер поднят по `docs/deploy.md` пп. 1–5, но `deploy.sh` **не запускался**; Resend проверен тестовым письмом на другой адрес (без регистрации в прод-БД — например, через `curl` к Resend API или временный стенд); `1-rehearsal.sh` зелёный; в локальном `.env` `TZ` = часовой пояс, который будет указан в `set-owner`.
2. **Окно заморозки (~15–30 минут):** не закрывать день и не трогать GTD во время окна. Лучше делать утром, до первых отметок, и **не в воскресенье вечером** (недельная сводка в Telegram).
3. Локально: `deploy/transit/2-final-dump.sh`.
4. `scp tracker-final.dump tracker-final.dump.sha256 deploy@VPS:~/tracker/` (канал SSH шифрован).
5. На VPS: `deploy/transit/3-restore-on-server.sh`. Сравнить `after.txt` с `before.txt` — все суммы совпадают.
6. Войти на `https://домен` своей почтой и паролем. Проверить руками: сферы; последние 14 дней и хитмепы; GTD по всем бакетам; рутины и их недели; настройки залипания; Telegram-бот и чаты на месте (токен уже зашифрован).
7. Локально: `deploy/transit/4-disarm-local.sh`.
8. **Только после п. 7:** на сервере во вкладке «iCloud» ввести Apple ID и пароль приложения → «Синхронизировать все напоминания» (UID от id GTD-элементов, id сохранены → обновятся существующие напоминания, дублей не будет). Во вкладке «Session» — имя календаря и минимальная длина; нажать синк помидорок за сегодня и сверить с Session.app.
9. Первое закрытие дня онлайн: сводка приходит в Telegram **один раз**.
10. Дамп `tracker-final.dump` и локальную БД хранить минимум месяц. После этого локальный стек — только для разработки, на копиях.

- [ ] Commit: `docs: ранбук дня переезда`

---

## Фаза 6 — опционально, после запуска

- «Скачать мои данные» (JSON всех сущностей пользователя) и «Удалить аккаунт» (каскад по `User`).
- Obsidian: «скачать reference-заметки ZIP-архивом».
- Приглашения/админка вместо `SIGNUP_MODE`/`ALLOWED_EMAILS`.
- Деплой через GitHub Actions → GHCR.
- Postgres RLS вторым рубежом изоляции.
- Удаление легаси `DailyTask`, `Day.telegramMessageId`, `Day.weeklyTelegramMessageId`.
- OAuth/Telegram Login как дополнительный способ входа.

---

## Definition of Done (Фазы 1–5)

- `backend`: `bun run test`, `bun run test:e2e`, `bun run build` — зелёные; `frontend`: `bun run test`, `bun run build` — зелёные.
- e2e-тест изоляции покрывает все контроллеры (`grep -rn "@Controller" backend/src`), включая `/auth`, `/integrations`, `/telegram`.
- `grep -rn "process.env.\(TELEGRAM\|ICLOUD\|SESSION_\)" backend/src` → пусто.
- Репетиция переезда пройдена ≥2 раз, `before`/`after` совпадают.
- `docker compose -f docker-compose.prod.yml config` без ошибок; наружу только 80/443.
- `docs/deploy.md` позволяет человеку без контекста поднять сервер и переехать.
- Отчёт владельцу: что сделано, что проверено, что осталось руками (домен, DNS, Resend, VPS, день переезда).
