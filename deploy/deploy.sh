#!/usr/bin/env bash
# Деплой: git pull → бэкап (если БД не пуста) → up -d --build → ждём /api/health.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# Переменные — из .env проекта (на сервере симлинк на .env.prod), чтобы не
# экспортировать их руками перед каждым деплоем.
if [ -f .env ]; then set -a; . ./.env; set +a; fi

export DOMAIN="${DOMAIN:?задайте DOMAIN}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
export ACME_EMAIL="${ACME_EMAIL:-}"
export APP_ENCRYPTION_KEY="${APP_ENCRYPTION_KEY:-}"

git pull --ff-only

# Бэкап перед каждым деплоем, но не на совершенно пустой БД (первый запуск).
if docker compose -f docker-compose.prod.yml exec -T postgres psql -U tracker -tAc \
     "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name<>'_prisma_migrations';" | grep -q '^0$'; then
  echo "БД пуста — бэкап не нужен (первый запуск)."
else
  ./deploy/backup.sh
fi

docker compose -f docker-compose.prod.yml up -d --build

# Ждём зелёного health до 90 секунд.
for i in $(seq 1 45); do
  if curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1; then
    echo "Деплой успешен: https://$DOMAIN"
    exit 0
  fi
  sleep 2
done

echo "ОШИБКА: /api/health не отвечает за 90 с. Последние логи backend:" >&2
docker compose -f docker-compose.prod.yml logs --tail=100 backend >&2 || true
exit 1
