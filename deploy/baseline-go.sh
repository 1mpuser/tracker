#!/usr/bin/env bash
# Baseline существующей прод-БД (накатанной Prisma) под golang-migrate.
#
# Зачем: на сервере схема создана Prisma-ой, golang-migrate об этом не знает,
# и первый запуск Go-образа падает на «relation ... already exists». Baseline
# создаёт таблицу schema_migrations и проставляет номер последней применённой
# Prisma-миграции, НЕ выполняя ни одного .sql. После этого /out/migrate видит
# базу как актуальную и в статичном случае отвечает «изменений нет».
#
# Это безопасно для работающего Node-бэкенда: Prisma использует собственную
# таблицу _prisma_migrations и не смотрит на schema_migrations, поэтому baseline
# можно накатить до момента переключения на Go.
#
# Использование (на VPS, из папки репозитория, где лежит docker-compose.prod.yml):
#   ./deploy/baseline-go.sh
#
# Шаги: 1) baseline-версия из _prisma_migrations; 2) сверка с файлами
# backend-go/migrations; 3) создание schema_migrations + вставка версии;
# 4) проверка /out/migrate → ожидается «изменений нет».
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
COMPOSE=(docker compose -f "$PROJECT_DIR/docker-compose.prod.yml")

# 1. Baseline-версия = версия последней применённой Prisma-миграции. Числовой
#    префикс в имени миграции и есть версия golang-migrate: файлы
#    backend-go/migrations/*.up.sql скопированы из
#    backend/prisma/migrations/<имя>/migration.sql без переименования.
echo "==> baseline-версия из _prisma_migrations"
BASELINE="$("${COMPOSE[@]}" exec -T postgres psql -U tracker -d tracker -tAc \
  "SELECT max(CAST(substring(migration_name from '^[0-9]+') AS bigint)) FROM _prisma_migrations;")"
if [ -z "$BASELINE" ]; then
  echo "ОШИБКА: в _prisma_migrations нет ни одной применённой миграции — база не Prisma?" >&2
  exit 1
fi
echo "   baseline-версия: $BASELINE"

# 2. Сверка: такая версия обязана существовать в backend-go/migrations.
if ! ls "$PROJECT_DIR/backend-go/migrations/${BASELINE}_"*.up.sql >/dev/null 2>&1; then
  echo "ОШИБКА: в backend-go/migrations нет миграции версии $BASELINE — проверьте набор файлов" >&2
  exit 1
fi
echo "   ok: миграция ${BASELINE}_*.up.sql найдена в backend-go/migrations"

# 3. Создаём schema_migrations (формат golang-migrate) и проставляем baseline
#    БЕЗ выполнения самих .sql.
echo "==> создаём schema_migrations и проставляем версию $BASELINE (dirty=false)"
"${COMPOSE[@]}" exec -T postgres psql -U tracker -d tracker <<SQL
CREATE TABLE IF NOT EXISTS schema_migrations (
  version bigint NOT NULL PRIMARY KEY,
  dirty   boolean NOT NULL
);
INSERT INTO schema_migrations (version, dirty)
SELECT ${BASELINE}, false
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations);
SQL

# 4. Проверка: /out/migrate должен ответить «изменений нет». Запускаем
#    one-off-контейнер с entrypoint=/out/migrate (не трогает работающий бэкенд).
echo "==> проверка: /out/migrate"
"${COMPOSE[@]}" run --rm --no-deps --entrypoint /out/migrate backend

echo "==> готово. Теперь можно переключать compose на Go-образ (backend)."
