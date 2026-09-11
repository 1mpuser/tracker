#!/usr/bin/env bash
# На VPS, ПЕРВЫМ запуском до любого «deploy.sh». Предполагает, что backend ещё
# ни разу не стартовал (прод-БД пуста). Проверяет контрольную сумму, наполняет
# БД дампом, применяет миграции, назначает владельца, снимает before/after.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_DIR"

DUMP="${1:-tracker-final.dump}"
OWNER_EMAIL="${OWNER_EMAIL:?задайте OWNER_EMAIL (bun run set-owner --email ...)}"
OWNER_TZ="${OWNER_TZ:-Europe/Moscow}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?задайте POSTGRES_PASSWORD}"
export DOMAIN="${DOMAIN:?задайте DOMAIN}"
export APP_ENCRYPTION_KEY="${APP_ENCRYPTION_KEY:?задайте APP_ENCRYPTION_KEY}"
export ACME_EMAIL="${ACME_EMAIL:-}"

echo "==> контрольная сумма"
shasum -a 256 -c "$DUMP.sha256"

echo "==> прод-БД должна быть пустой (backend НЕ должен был стартовать)"
if docker compose -f docker-compose.prod.yml exec -T postgres psql -U tracker -tAc \
     "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | grep -q '^[1-9]'; then
  echo "ОШИБКА: в прод-БД уже есть таблицы. Прервите, если это не первый запуск." >&2
  exit 1
fi

echo "==> поднимаем postgres и восстанавливаем дамп"
docker compose -f docker-compose.prod.yml up -d postgres
sleep 3
docker compose -f docker-compose.prod.yml exec -T postgres \
  sh -c "pg_restore --no-owner -U tracker -d tracker" < "$DUMP"

echo "==> деплой (применит миграции и зашифрует токен Telegram)"
./deploy/deploy.sh

echo "==> назначение владельца (пароль — интерактивно)"
docker compose -f docker-compose.prod.yml exec -it backend bun run set-owner --email "$OWNER_EMAIL" --timezone "$OWNER_TZ"

echo "==> verify-migration (after) — сравните с before"
docker compose -f docker-compose.prod.yml exec -T postgres psql -U tracker -d tracker -f - < deploy/verify-migration.sql > "$PWD/transit-after.txt"
cat "$PWD/transit-after.txt"

echo "==> удаляем дамп с сервера"
shred -u "$DUMP" 2>/dev/null || rm -f "$DUMP"
