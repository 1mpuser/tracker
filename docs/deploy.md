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

**Откат:** `git checkout <коммит>` → `up -d --build`; если нужен и откат данных —
`deploy/restore.sh <последний дамп>`. Миграции БД назад не катятся.

## 9. Учётки выдаёт администратор

Самостоятельно завести аккаунт нельзя — учётки создаёт и раздаёт администратор
в разделе `/admin`.

## 10. Частые проблемы

- **Сертификат не выпускается**: DNS не на IP / порт 80 закрыт. `docker compose -f docker-compose.prod.yml logs caddy`.
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
