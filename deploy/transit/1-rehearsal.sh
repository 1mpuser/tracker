#!/usr/bin/env bash
# РЕПЕТИЦИЯ переезда (локально, можно гонять сколько угодно):
#  1. дамп РАБОЧЕЙ БД → восстановление в tracker_rehearsal;
#  2. verify-migration.sql на рабочей БД;
#  3. миграции ветки на tracker_rehearsal (migrate deploy);
#  4. set-owner на tracker_rehearsal;
#  5. verify-migration.sql на tracker_rehearsal → diff с шагом 2.
# Рабочую БД ТОЛЬКО читает.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_DIR/backend"

WORK_DB_URL="${WORK_DB_URL:-postgresql://tracker:tracker@localhost:5434/tracker}"
REHEARSAL_DB_URL="${REHEARSAL_DB_URL:-postgresql://tracker:tracker@localhost:5434/tracker_rehearsal}"
OWNER_EMAIL="${OWNER_EMAIL:-owner@localhost.invalid}"
OWNER_TZ="${OWNER_TZ:-Europe/Moscow}"

echo "==> дамп рабочей БД"
docker compose exec -T postgres pg_dump -U tracker -Fc tracker > /tmp/tracker-rehearsal.dump

echo "==> пересоздание tracker_rehearsal"
docker compose exec postgres dropdb -U tracker --if-exists tracker_rehearsal
docker compose exec postgres createdb -U tracker tracker_rehearsal
docker compose exec -T postgres pg_restore -U tracker -d tracker_rehearsal --no-owner < /tmp/tracker-rehearsal.dump

echo "==> verify-migration на РАБОЧЕЙ БД (before)"
docker compose exec -T postgres psql -U tracker -d tracker -f - < "$PROJECT_DIR/deploy/verify-migration.sql" > /tmp/before.txt

echo "==> миграции ветки на tracker_rehearsal"
DATABASE_URL="$REHEARSAL_DB_URL" bunx prisma migrate deploy

echo "==> set-owner на tracker_rehearsal (заглушка становится владельцем)"
# Пароль из env, чтобы скрипт был неинтерактивным на репетиции.
printf 'rehearsal-pass-123' | DATABASE_URL="$REHEARSAL_DB_URL" bun run set-owner --email "$OWNER_EMAIL" --timezone "$OWNER_TZ" --password-stdin >/dev/null

echo "==> verify-migration на tracker_rehearsal (after)"
docker compose exec -T postgres psql -U tracker -d tracker_rehearsal -f - < "$PROJECT_DIR/deploy/verify-migration.sql" > /tmp/after.txt

echo "==> diff"
if diff -u /tmp/before.txt /tmp/after.txt; then
  echo "РЕПЕТИЦИЯ ПРОЙДЕНА: before == after"
else
  echo "ОШИБКА: суммы расходятся" >&2
  exit 1
fi
