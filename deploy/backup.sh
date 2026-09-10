#!/usr/bin/env bash
# Ночной бэкап прод-БД: pg_dump -Fc в /var/backups/tracker, хранение 14 дней,
# опционально rclone-копия наружу.
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/tracker}"
KEEP_DAYS="${KEEP_DAYS:-14}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?задайте POSTGRES_PASSWORD}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%F-%H%M)"
FILE="$BACKUP_DIR/tracker-$STAMP.dump"

docker compose -f "$PROJECT_DIR/docker-compose.prod.yml" exec -T postgres \
  pg_dump -U tracker -Fc tracker > "$FILE"

chmod 600 "$FILE"
# Пустой файл = провал, а не «успешный бэкап ничтожества».
if [ ! -s "$FILE" ]; then
  echo "ОШИБКА: бэкап пуст ($FILE)" >&2
  rm -f "$FILE"
  exit 1
fi

# Удаляем старше KEEP_DAYS дней.
find "$BACKUP_DIR" -name 'tracker-*.dump' -mtime "+$((KEEP_DAYS-1))" -delete

if [ -n "$RCLONE_REMOTE" ]; then
  rclone copy "$FILE" "$RCLONE_REMOTE/tracker"
fi

echo "OK: $FILE ($(du -h "$FILE" | cut -f1))"
