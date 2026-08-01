# Daily Tracker

Personal, single-user, self-hosted daily tracker. No auth, runs on localhost via Docker Compose.

## Run it (Docker only — no Bun / Node needed)

The **only** things you need installed are **Docker** (with Compose) and **Git**. Everything else — Bun, the database, migrations — lives inside the containers.

- Docker Desktop: [macOS](https://docs.docker.com/desktop/setup/install/mac-install/) · [Windows](https://docs.docker.com/desktop/setup/install/windows-install/) (on Windows, enable the **WSL2** backend when prompted)
- Git: [macOS](https://git-scm.com/download/mac) · [Windows](https://git-scm.com/download/win)

Then, in a terminal (macOS Terminal, or on Windows: PowerShell / Git Bash):

```bash
git clone <repo-url>
cd tracker
docker compose up -d --build postgres backend frontend
```

Open **http://localhost:4887**. That's it. 🎉

- You do **not** need Bun or Node — the containers already have everything.
- The backend **applies database migrations and seeds the data automatically** on startup. No manual step.
- Data is stored in a Docker volume (`pgdata`) and survives restarts.

Handy commands:

```bash
docker compose ps            # service status
docker compose logs -f       # follow logs (add a service name to filter)
docker compose down          # stop everything (data is kept in the volume)
docker compose down -v       # stop AND wipe the database volume
```

> The 4th service, `caddy`, is only for the optional HTTPS hostname below — that's why it's left out of the command above. Skipping it means one less thing to set up, and `http://localhost:4887` works without it.

---

## Updating to a new version

When new changes land, pull them and rebuild the containers:

```bash
git pull
docker compose up -d --build postgres backend frontend
```

That's the whole update. 🎉

- **`--build` is required.** Without it Docker reuses the old images and your new code never makes it into the containers. `--build` rebuilds them from the freshly pulled source; `-d` runs them in the background.
- **Migrations apply themselves.** The backend runs `prisma migrate deploy` on startup, so any new database migrations that came with the update are applied automatically the moment the rebuilt `backend` container boots. There is no manual migration step.
- **Your data is safe.** The database lives in the `pgdata` Docker volume, which is untouched by a rebuild — existing days, categories and settings survive the update.
- Only the containers whose source changed actually rebuild; the rest are reused, so repeat updates are fast.

If you also use the optional HTTPS hostname, add `caddy` to the command (or just run `docker compose up -d --build` with no service names to rebuild everything):

```bash
docker compose up -d --build            # rebuilds all 4 services, incl. caddy
```

Watch it come up and confirm migrations ran:

```bash
docker compose ps                        # all services should be "healthy"/"running"
docker compose logs -f backend           # look for the prisma migrate deploy output on startup
```

---

## Local development (optional)

**Only** needed if you want to edit the code with hot-reload or run the test suites. A regular user just running the app can skip this whole section.

This is the only part that needs **Bun** installed on your machine — [install instructions](https://bun.sh/docs/installation) (`curl -fsSL https://bun.sh/install | bash` on macOS/Linux, `scoop install bun` on Windows).

### Backend

```bash
docker compose up -d postgres            # just the database
cd backend
cp ../.env.example .env                   # then set DATABASE_URL to use localhost:5434:
                                          #   postgresql://tracker:tracker@localhost:5434/tracker
bun install
bunx prisma migrate dev                   # create/apply migrations
bunx prisma db seed                       # seed categories + settings
bun run start:dev                         # dev server on http://localhost:3001
bun run test                              # backend tests
```

### Frontend

```bash
docker compose up -d postgres backend     # backend deps
cd frontend
cp .env.example .env.local                 # NEXT_PUBLIC_API_URL=http://localhost:3001
bun install
bun run dev                                # dev server on http://localhost:4887 (NOT 3000 — backend CORS is locked to 4887)
bun run test                               # frontend tests
```

### Database migrations

The running backend container applies existing migrations on startup automatically. You only touch this when **creating a new** migration during development (`bunx prisma migrate dev`, above). To re-apply migrations manually inside the container:

```bash
docker compose exec backend bunx prisma migrate deploy
```

---

### Obsidian-экспорт Заметок (GTD)

GTD-пункты со статусом «Заметка» (`reference`) автоматически экспортируются `.md`-файлами
в Obsidian. Путь к папке хранилища задаётся `OBSIDIAN_VAULT_DIR` в корневом `.env`
(по умолчанию — локальная `./data/obsidian-export`). Backend монтирует её как `/vault`
и пишет туда при изменении Заметок + разово синкает все Заметки на старте.

### iCloud Reminders (GTD)

GTD-пункты с дедлайном (`dueDate`), а также пункты в статусе «Календарь» (по их дате),
автоматически синкаются в список **«GTD»** в iCloud Reminders — это даёт настоящее
системное напоминание на телефоне/часах. Календарные события (Calendar.app) НЕ
создаются автоматически — пользователь ставит их сам.

Настройка (один раз, руками):
1. Сгенерировать пароль приложения на appleid.apple.com → «Вход и безопасность» →
   «Пароли для приложений».
2. Создать пустой список **«GTD»** в Reminders.app (или на icloud.com).
3. Заполнить в корневом `.env`: `ICLOUD_APPLE_ID` (email Apple ID),
   `ICLOUD_APP_PASSWORD` (пароль приложения из шага 1).

Без этих двух переменных интеграция молча выключена — остальной трекер работает как обычно.

### Сводка дня в Telegram

Когда день отмечается закрытым, бэкенд публикует в Telegram-канал одно сводное
сообщение: дата с днём недели, количество помидорок, бинарный список сфер с отметками,
оценка дня и комментарий. Ровно один пост на дату — переоткрытие и повторное закрытие
дня ничего не шлёт (идемпотентность обеспечивается полем `Day.telegramMessageId`).

Настройка (один раз, руками):
1. Создать бота у `@BotFather` (`/newbot`) и забрать токен.
2. Добавить бота администратором канала с правом публикации сообщений.
3. Узнать `chat_id`: для публичного канала это `@имя_канала`, для приватного —
   числовой идентификатор вида `-1001234567890` (например, переслать любой пост
   канала боту `@userinfobot`).
4. Заполнить в корневом `.env`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

Без этих двух переменных интеграция молча выключена — остальной трекер работает как обычно.
Ошибка отправки (нет сети, неверный токен, бот не админ) не ломает закрытие дня:
она пишется в лог бэкенда, а поле `telegramMessageId` остаётся пустым, поэтому
следующее закрытие этого же дня попробует отправить снова.

### Мобильный захват в Корзину (iOS-шорткат)

Чтобы скидывать мысли в GTD-Корзину прямо с телефона (не открывая браузер), сделай
iOS-шорткат, который POST'ит в API по локальной сети. Шорткат — не браузер, поэтому
CORS/сертификаты его не касаются; нужно лишь, чтобы телефон был в той же Wi-Fi.

Эндпоинт (стабильный, переживает смену IP через Bonjour):

```
POST http://Alekseis-MacBook-Pro.local:3001/gtd/items
Content-Type: application/json
{ "title": "<текст мысли>" }
```

Фолбэк по IP (если `.local` не резолвится): `http://192.168.3.78:3001/gtd/items`
(IP может смениться при перезагрузке роутера — тогда обнови в шорткате или зарезервируй
адрес в роутере).

**Шаги (приложение «Команды» → новый шорткат):**
1. Действие **«Запросить ввод»** (тип: Текст, запрос «Мысль?»).
2. Действие **«Получить содержимое URL»**:
   - URL: `http://Alekseis-MacBook-Pro.local:3001/gtd/items`
   - Метод: **POST**, Заголовки: `Content-Type: application/json`
   - Тело запроса: **JSON** → ключ `title` = переменная «Запрошенный ввод».
3. Назови шорткат «В Корзину», добавь на экран «Домой» / в виджет / скажи Siri.

Пункт появится в GTD → Корзина со статусом `inbox` и пройдёт обычную воронку разбора.
Работает только в домашней сети (бэкенд слушает `0.0.0.0:3001`, наружу не торчит).

---

## HTTPS via `tracker.performance` (optional — a macOS nicety)

**Fully optional. Most people don't need this.** Plain `http://localhost:4887` works everywhere.

This exists only because of two **Safari / macOS** quirks on plain `http://localhost`:

- Safari doesn't reliably show the favicon for the literal hostname `localhost`.
- The Notification API silently does nothing on non-`localhost` HTTP origins.

**On Windows / Linux with Chrome, Edge or Firefox you do not need any of this** — `http://localhost:4887` is already a "secure context" (loopback is trusted), so notifications and favicons work there. Just use **http://localhost:4887** and skip this section.

If you still want the pretty HTTPS hostname (mainly for Safari on a Mac), it uses [mkcert](https://github.com/FiloSottile/mkcert) for a locally-trusted certificate plus the `caddy` reverse proxy:

### macOS

```bash
brew install mkcert
mkcert -install                                     # add local CA to the trust store (asks for sudo)
echo '127.0.0.1  tracker.performance' | sudo tee -a /etc/hosts
mkdir -p caddy/certs && cd caddy/certs
mkcert -cert-file tracker.performance.pem -key-file tracker.performance-key.pem tracker.performance
cd ../..
docker compose up -d --build                        # now includes caddy
```

Open **https://tracker.performance:4888**.

### Windows

1. Install mkcert: `choco install mkcert` (Chocolatey) or `scoop install mkcert` (Scoop).
2. `mkcert -install` — adds the local CA to the Windows trust store (Chrome/Edge pick it up).
3. Add the hostname to the hosts file: open **Notepad as administrator**, File → Open `C:\Windows\System32\drivers\etc\hosts`, add a line `127.0.0.1  tracker.performance`, save.
4. Generate the certificate:
   ```powershell
   mkdir caddy\certs; cd caddy\certs
   mkcert -cert-file tracker.performance.pem -key-file tracker.performance-key.pem tracker.performance
   cd ..\..
   ```
5. `docker compose up -d --build` (now includes caddy), then open **https://tracker.performance:4888**.

> The generated certificate + private key live in `caddy/certs/` and are git-ignored — generate your own per machine, and never commit the private key.

---

**Note:** `http://localhost:4887` always works for direct access. `backend/src/main.ts` allows both CORS origins (`http://localhost:4887` and `https://tracker.performance:4888`), so both routes work once set up.
