#!/usr/bin/env bash
# Восстановление прод-БД из дампа. Останавливает backend, стирает текущую БД
# (--clean) и поднимает обратно. Требует явного подтверждения.
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
if [ "$#" -ne 1 ]; then
  echo "Использование: $0 <file.dump>" >&2
  exit 1
fi
DUMP="$1"
if [ ! -f "$DUMP" ]; then
  echo "Файл не найден: $DUMP" >&2
  exit 1
fi

read -rp "Восстановить БД прод из $DUMP (текущие данные будут удалены)? [y/N] " ans
if [ "$ans" != "y" ] && [ "$ans" != "Y" ]; then
  echo "Отменено"
  exit 0
fi

export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?задайте POSTGRES_PASSWORD}"
docker compose -f "$PROJECT_DIR/docker-compose.prod.yml" stop backend
docker compose -f "$PROJECT_DIR/docker-compose.prod.yml" exec -T postgres \
  sh -c "pg_restore --clean --if-exists --no-owner -U tracker -d tracker" < "$DUMP"
docker compose -f "$PROJECT_DIR/docker-compose.prod.yml" start backend
echo "Готово. Бэкенд поднят, те же миграции применятся при старте."
