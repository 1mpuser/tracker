# Как поднять трекер на своём VPS

Пошаговая инструкция для человека. Команды — для копирования. Всё, кроме
шагов «Домен/VPS», выполняется из репозитория с ветки `feat/multi-user`
(см. `docs/superpowers/plans/2026-09-11-multi-user-hosting.md`).

## 1. Что купить

- **VPS**: Ubuntu 24.04, 2 vCPU / 4 ГБ RAM (сборка Next.js ест ~1–1,5 ГБ; на 2 ГБ — со swap).
- **Домен**. A/AAAA-запись на IP VPS.

Перед покупкой на длительный срок проверьте с будущего сервера доступность внешних сервисов:

```bash
curl -sI https://api.telegram.org https://caldav.icloud.com | head -20
```

## 2. DNS

A/AAAA на IP VPS. Проверить:

```bash
dig +short ваш-домен
```

## 3. Сервер

```bash
sudo useradd -m -s /bin/bash deploy
# скопировать локальный публичный ключ
ssh-copy-id deploy@IP
sudo passwd -l deploy         # вход только по ключам

# запретить root по SSH и пароли
sudo sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/; s/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# минимальный фаервол (наружу только 80/443 и SSH)
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp && sudo ufw enable

sudo apt update && sudo apt install -y fail2ban unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Docker (официальный скрипт)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker deploy

# swap, если RAM < 4 ГБ
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 4. Код

GitHub → Settings → Deploy keys, **read-only**, на `/home/deploy/.ssh`:

```bash
ssh deploy@IP
git clone git@github.com:ВАШ-АККАУНТ/tracker.git
cd tracker
git checkout feat/multi-user
cp .env.prod.example .env.prod && nano .env.prod   # заполнить
ln -s .env.prod .env
chmod 600 .env.prod
```

Сгенерировать пароли:

```bash
echo "POSTGRES_PASSWORD: $(openssl rand -base64 24 | tr -d '/+=' | tr -d '\n')"
echo "APP_ENCRYPTION_KEY: $(openssl rand -base64 32)"   # СОХРАНИТЬ В МЕНЕДЖЕР ПАРОЛЕЙ
```

## 5. Первый запуск

Если это **переезд** существующих данных владельца — сначала Фаза 5 (раздел
«Переезд») ниже. Иначе:

```bash
./deploy/deploy.sh
```

Проверить: `https://домен` (страница входа), `https://домен/api/health` → `{"status":"ok"}`.

На чистой базе создать первого админа. Go-образ не содержит bootstrap-утилиту —
`createuser` (вне compose, см. `backend-go/README.md`), поэтому её запускают один
раз из репозитория с `DATABASE_URL` на БД внутри сети compose:

```bash
cd backend-go
printf '%s' 'ваш-пароль' | DATABASE_URL='postgresql://tracker:POSTGRES_PASSWORD@postgres:5432/tracker' \
  go run ./cmd/createuser --email you@example.com --timezone Europe/Moscow --admin --password-stdin
```

`POSTGRES_PASSWORD` — из `.env.prod`. Хост `postgres` (имя сервиса compose)
резолвится только внутри сети compose, поэтому команду выполняют там, где эта
сеть доступна (контейнер/хост с доступом в `tracker_default`).

Дальше учётки выдаются в `/admin`.

## 6. Бэкапы

Крон от имени `deploy` (crontab -e):

```
15 3 * * * /home/deploy/tracker/deploy/backup.sh >> /var/log/tracker-backup.log 2>&1
```

- Дампы: `/var/backups/tracker`, хранение 14 дней.
- Внешняя копия: `RCLONE_REMOTE=remote:folder` в `.env` → бэкап уйдёт ещё и туда.
- Раз в месяц — пробное восстановление в `tracker_restore_test`.

## 7. Мониторинг

UptimeRobot (или аналог) на `https://домен/api/health`.

## 8. Обновление

```bash
./deploy/deploy.sh
```

Автоматически: `git pull --ff-only` → бэкап → `up -d --build` → ожидание health.

Миграции БД накатывает сам Go-образ при старте: его entrypoint выполняет
`/out/migrate`, и только при успехе запускает `/out/server` (см.
`backend-go/docker-entrypoint.sh`). Отдельного шага с `prisma migrate deploy`
больше нет; при ошибке миграции контейнер падает, что ловит health-чек ниже.

**База, уже накатанная Prisma** (есть таблица `_prisma_migrations`): первый запуск
Go-образа упадёт на «relation ... already exists», т.к. golang-migrate не знает о
схеме и попытается заново выполнить все `.sql` из `backend-go/migrations/`.
Перед первым запуском нужно **забазлайнить** базу — см. раздел
«Переход на Go-бэкенд (baseline)» ниже. Для чистой БД этого не требуется.

**Откат:** `git checkout <коммит>` → `up -d --build`; если нужен и откат данных —
`deploy/restore.sh <последний дамп>`. Миграции БД назад не катятся.

---

## Переход на Go-бэкенд (baseline)

Когда прод-БД создана Prisma-бэкендом (`_prisma_migrations` есть, а
`schema_migrations` нет), golang-migrate не знает текущей версии схемы. Если
просто поднять Go-образ, его entrypoint выполнит `/out/migrate`, тот решит, что
база пустая, и начнёт накатывать `*.up.sql` с нуля — первая же миграция
`20260714233127_init.up.sql` упадёт на `relation "Category" already exists`, и
контейнер не поднимется.

Baseline решает это: мы говорим golang-migrate «схема уже накатана до версии X»,
создавая `schema_migrations` и проставляя один ряд. Ни один `.sql` при этом не
выполняется, данные не трогаются. Prisma-бэкенд (`_prisma_migrations`) на
добавленную таблицу не смотрит, поэтому baseline безопасно накатить заранее, ещё
до остановки Node-бэкенда.

> **Почему номер берём из `_prisma_migrations`, а не «на глаз».** Файлы
> `backend-go/migrations/*.up.sql` скопированы из
> `backend/prisma/migrations/<имя>/migration.sql` без переименования, поэтому
> числовой префикс (числа до `_`) в имени Prisma-миграции — это в точности версия
> golang-migrate. Baseline-версия = максимум этих префиксов среди применённых
> миграций. Она обязана существовать в `backend-go/migrations/` — это проверяется.

### Шаг 0. Дамп живой прод-БД «на всякий случай»

Даже если baseline не трогает данные, перед любым вмешательством в БД снимаем
резервную копию (прод — источник правды):

```bash
cd /opt/tracker
STAMP=$(date +%F-%H%M)
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U tracker -Fc tracker > /opt/tracker/backup-safety-$STAMP.dump
ls -la /opt/tracker/backup-safety-$STAMP.dump
```

### Шаг 1. Baseline-версия из `_prisma_migrations`

```bash
cd /opt/tracker
BASELINE=$(docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U tracker -d tracker -tAc \
  "SELECT max(CAST(substring(migration_name from '^\d+') AS bigint)) FROM _prisma_migrations;")
echo "baseline=$BASELINE"
# проверяем, что версия есть среди файлов golang-migrate:
ls backend-go/migrations/${BASELINE}_*.up.sql
```

Ожидается `baseline=20260911232214` и найдена
`backend-go/migrations/20260911232214_add_user_admin_and_blocked.up.sql`.

### Шаг 2. Создать `schema_migrations` и проставить версию

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U tracker -d tracker <<SQL
CREATE TABLE IF NOT EXISTS schema_migrations (
  version bigint NOT NULL PRIMARY KEY,
  dirty   boolean NOT NULL
);
INSERT INTO schema_migrations (version, dirty)
SELECT ${BASELINE}, false
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations);
SQL
```

Проверить:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U tracker -d tracker -tAc "SELECT version, dirty FROM schema_migrations;"
# 20260911232214 | f
```

### Шаг 3. Проверить `/out/migrate` → «изменений нет»

Запускаем migrate в one-off-контейнере (не трогает работающий бэкенд):

```bash
docker compose -f docker-compose.prod.yml run --rm --no-deps \
  --entrypoint /out/migrate backend
```

Ожидается лог `База уже актуальна, изменений нет` (вывод `migrate.ErrNoChange`).
Это и есть подтверждение, что у Go-ветки нет миграций сверх накатанных Prisma.

### Шаг 4. Переключить compose на Go-образ

```bash
docker compose -f docker-compose.prod.yml up -d --build backend
sleep 30
docker compose -f docker-compose.prod.yml ps backend
curl -fsS https://домен/api/health
```

Health-чек вернёт `{"status":"ok"}`, а при ошибке миграции контейнер падает и
health-чек ловит это. Ручной smoke: войти реальным пользователем на
`https://домен`, пролистать сферы / дни / GTD / рутины / настройки — данные должны
читаться без 500/404.

### Автоматизация

То же самое одной командой — `deploy/baseline-go.sh` (см. комментарии в файле):
считает baseline из `_prisma_migrations`, сверяет с `backend-go/migrations`,
накатывает `schema_migrations` и прогоняет `/out/migrate`.

```bash
./deploy/baseline-go.sh
```

## 9. Учётки выдаёт администратор

Самостоятельно завести аккаунт нельзя — учётки создаёт и раздаёт администратор
в разделе `/admin`.

## 10. Частые проблемы

- **Сертификат не выпускается**: DNS не на IP / TCP 443 занят чем-то другим. Caddy публикует только TCP 443 и получает сертификат через TLS-ALPN: порт 80 на нашем VPS нужен acme.sh для сертификата VPN, UDP 443 перенаправлен на hysteria. Поэтому редиректа `http://` → `https://` нет. `docker compose -f docker-compose.prod.yml logs caddy`.
- **401 сразу после входа**: фронт собран с абсолютным API-URL вместо `NEXT_PUBLIC_API_URL=/api`, либо `COOKIE_SECURE=true` при http (`cookieSecure` в составе URL не проверяется) — пересобрать фронт.
- **502**: бэкенд упал на проверке env (не задан `APP_ENCRYPTION_KEY`) — `docker compose -f docker-compose.prod.yml logs backend`.
- **iCloud не подключается**: нужен **пароль приложения** (appleid.apple.com → Вход и безопасность → Пароли приложений), а не пароль Apple ID.

---

## Переезд с локального трекера (день X)

Цель: **ни одной потерянной записи, ни одного задвоенного поста в Telegram,
ни одного конфликта в iCloud** — и возможность вернуться. Подробности — таблица
рисков в `docs/superpowers/specs/2026-09-11-multi-user-hosting-design.md` и
`deploy/transit/rollback.md`.

### За день

1. Сервер поднят по пп. 1–5, но `deploy.sh` **не запускался**.
2. Репетиция зелёная: `cd deploy && ./transit/1-rehearsal.sh` **минимум дважды**, before == after.
3. В локальном `.env` `TZ` = тому поясу, который укажете в `set-owner --timezone`.

### Окно заморозки (~15–30 минут)

Не закрывать день и не трогать GTD во время окна. Лучше утром, до первых отметок;
**не в воскресенье вечером** (недельная сводка в Telegram).

1. Локально: `./transit/2-final-dump.sh` (с этого момента писать некому — `frontend` и `backend` остановлены).
2. `scp tracker-final.dump tracker-final.dump.sha256 deploy@VPS:~/tracker/`
3. На VPS: `OWNER_EMAIL=you@example.com ./transit/3-restore-on-server.sh` (пароль введёте интерактивно). Сравнить `before`/`after` — все суммы совпадают.
4. Войти на `https://домен` своей почтой и паролем. Проверить руками: сферы; последние 14 дней и хитмепы; GTD по всем бакетам; рутины и их недели; залипание; Telegram-бот и чаты.
5. Локально: `./transit/4-disarm-local.sh`.
6. **Только после п. 5** на сервере: вкладка «iCloud» (Apple ID + пароль приложения) → «Синхронизировать все напоминания» (UID от id GTD-элементов — дублей не будет). Вкладка «Session» — имя календаря и минимальная длина; синк помидорок за сегодня.
7. Первое закрытие дня онлайн: сводка в Telegram **один раз**.
8. Дамп `tracker-final.dump` и локальную БД хранить минимум месяц.
