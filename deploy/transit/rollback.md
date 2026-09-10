# Откат после переезда

## Сценарий A: онлайн не заработал, новых данных там нет

1. Остановить сервер: `docker compose -f docker-compose.prod.yml stop`.
2. Локально вернуть env: `cp .env.before-transit .env`.
3. В локальной БД вернуть токен бота (шаг «обезоруживания» его снял): вставить через UI во вкладке «Telegram-бот» или `UPDATE "Settings" SET "telegramBotToken"='<токен>' WHERE ...`.
4. `docker compose start frontend backend` — локально работаем как раньше.
5. Локальная БД не была тронута миграциями нового кода — данные на месте.

## Сценарий B: онлайн работал N дней, потом решили вернуться

1. Снять дамп с сервера: `./deploy/backup.sh` (или `docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U tracker -Fc tracker > server.dump`).
2. Остановить сервер, чтобы не было двух писателей: `docker compose -f docker-compose.prod.yml stop`.
3. Локально восстановить дамп **в стек ветки `feat/multi-user`** (схема новая; однопользовательский `master` его не прочитает):
   - создать пустую БД `tracker`, поднять `postgres`;
   - `pg_restore --no-owner -d tracker < server.dump`;
   - поднять backend ветки (`bunx prisma migrate deploy` применит миграции, если их ещё не было);
   - `APP_ENCRYPTION_KEY` должен быть тот же, что на сервере, — иначе секреты интеграций (Telegram, iCloud) не расшифровать и вводить заново.
4. Войти своим паролем (он тот же, что на сервере).
