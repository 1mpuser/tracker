#!/usr/bin/env bash
# ФИНАЛЬНЫЙ дамп в день переезда. Останавливает frontend и backend — с этого
# момента писать некому (окно заморозки). Postgres не останавливает.
# После этого: scp tracker-final.dump + .sha256 на сервер.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${OUT:-$PROJECT_DIR/tracker-final.dump}"

echo "==> останавливаем frontend и backend (окно заморозки)"
docker compose stop frontend backend

echo "==> verify-migration (before)"
docker compose exec -T postgres psql -U tracker -d tracker -f - < "$PROJECT_DIR/deploy/verify-migration.sql" > "$PWD/transit-before.txt"

echo "==> pg_dump -Fc"
docker compose exec -T postgres pg_dump -U tracker -Fc tracker > "$OUT"
chmod 600 "$OUT"

echo "==> контрольная сумма"
shasum -a 256 "$OUT" > "$OUT.sha256"

echo ">> Данные владельца не потеряются:"
echo ">>   scp $OUT $OUT.sha256 deploy@VPS:~/tracker/"
