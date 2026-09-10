#!/usr/bin/env bash
# «Обезоружить» локальный стек после того, как онлайн-версия проверена:
# локальный инстанс больше НЕ должен писать в те же внешние сервисы
# (иначе двойные посты в Telegram и конфликты в iCloud).
# Локальную БД НЕ удаляем — это точка отката.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_DIR"

# Резерв корректного .env (чтобы откатиться).
if [ ! -f .env.before-transit ]; then
  cp .env .env.before-transit
fi

# Комментируем бот/учётки в .env (с бэкапом).
sed -i.bak 's/^TELEGRAM_BOT_TOKEN=/;\0/; s/^TELEGRAM_CHAT_ID=/;\0/; s/^ICLOUD_APPLE_ID=/;\0/; s/^ICLOUD_APP_PASSWORD=/;\0/; s/^SESSION_/;\0/' .env || true
rm -f .env.bak

# Токен бота локально — вон из БД (сервер теперь единственный писатель).
docker compose exec -T postgres psql -U tracker -d tracker -c \
  'UPDATE "Settings" SET "telegramBotToken" = NULL;' 2>/dev/null || echo "предупреждение: UPDATE не выполнен (БД не поднята? пропустите локально)"

echo "Готово. Локально: .env закомментирован (бэкап в .env.before-transit), токен бота снят."
echo "Чтобы снова писать в Telegram/iCloud — верните .env из .env.before-transit и вставьте токен в UI."
