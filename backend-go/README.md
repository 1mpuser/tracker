# backend-go

Go-переписывание бэкенда трекера. Рядом со старым `backend/` (NestJS + Prisma),
тот остаётся источником истины и работает до полного переключения. REST-контракт
(пути, JSON DTO, коды ответов, cookie-сессии `sid`) идентичен `backend/`.

Сейчас реализован фундамент: каркас HTTP-сервера, подключение к Postgres,
миграции, auth/сессии (`/auth/*`), админка (`/admin/*`), `/health`. Остальные
модули (days/categories/routines/gtd/task-templates/stats/settings, интеграции)
— в следующих промптах.

## Стек

- Go 1.23+, `chi` (github.com/go-chi/chi/v5), `pgx/v5` (pgxpool).
- Миграции — `golang-migrate` поверх `.sql`, скопированных как есть из
  `backend/prisma/migrations/` (up-миграции; down не выдумываем).
- БД та же: Postgres на `localhost:5434` (`DATABASE_URL`), схема не менялась.

## Запуск

```bash
cd backend-go
export DATABASE_URL='postgresql://tracker:tracker@localhost:5434/tracker'
go run ./cmd/server            # HTTP на :3001 (переопределить через PORT)
```

Соединение идёт на уже готовую схему (её накатила Prisma). Для чистой базы
миграции через golang-migrate:

```bash
DATABASE_URL='postgresql://tracker:tracker@localhost:5434/tracker_test' \
  go run ./cmd/migrate
```

## Создание учётки

Публичной регистрации нет — учётки выдаёт админ (`POST /admin/users`) или
bootstrap-скрипт (аналог `UserBootstrapService`):

```bash
printf '%s' 's3cret-pass' | DATABASE_URL='...' go run ./cmd/createuser \
  --email you@example.com --timezone Europe/Moscow --admin --password-stdin
```

## Тесты

```bash
go build ./...
go vet ./...
go test ./...
```

Unit-тесты не требуют БД (сервисы тестируются через мок `store.Store` в
`internal/store/storetest`). Парольный хэш совместим с Node (`password.util.ts`):
статический хэш из Node-бэкенда лежит фикстурой в `internal/auth/password_test.go`.

## Структура

- `cmd/server` — точка входа HTTP-сервера.
- `cmd/migrate` — накатывает up-миграции.
- `cmd/createuser` — bootstrap-скрипт создания учётки.
- `internal/config` — чтение окружения (PORT, CORS_ORIGINS, COOKIE_SECURE,
  SESSION_DAYS, DATABASE_URL, DISTRACTION_BUDGET_DEFAULT, APP_ENCRYPTION_KEY).
- `internal/store` — pgx-реализация `Store`; `internal/store/storetest` — мок для тестов.
- `internal/auth` — scrypt, серверные сессии (`Session`), cookie `sid`.
- `internal/admin` — управление учётками администратором (404 для не-админа).
- `internal/bootstrap` — создание учётки с дефолтными сферами/настройками.
- `internal/server` — chi-роутер, CORS, cookie, лимит тела 2 МБ, `trust proxy`,
  middlewares `SessionGuard`/`AdminGuard`-эквиваленты.
- `internal/model` — строки `User`/`Session`.
