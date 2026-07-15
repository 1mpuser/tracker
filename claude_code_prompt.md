# Промпт для Claude Code

Скопируй всё, что ниже черты, и вставь как первое сообщение в Claude Code в пустой директории проекта.

---

Создай локальное self-hosted full-stack приложение — персональный трекер дня. Однопользовательское, без авторизации, крутится только на localhost через Docker Compose. Ниже полная спецификация — следуй ей точно, не додумывай функциональность сверх описанного.

## Стек

- **Backend:** NestJS + Prisma + PostgreSQL
- **Frontend:** Next.js (App Router), чистый CSS, без UI-kit библиотек (MUI/Chakra и т.п.); `recharts` — единственное исключение, только для графика YouTube по неделям
- **Инфра:** Docker Compose — три сервиса: `postgres`, `backend`, `frontend`

## Структура репозитория

```
/backend   — NestJS API
/frontend  — Next.js
docker-compose.yml
.env.example
README.md
```

## Схема данных (Prisma)

```prisma
model Category {
  id       Int    @id @default(autoincrement())
  key      String @unique
  label    String
  order    Int    @default(0)
  archived Boolean @default(false)
  statuses DayCategoryStatus[]
}

model Day {
  id             Int      @id @default(autoincrement())
  date           DateTime @unique @db.Date
  youtubeMinutes Int      @default(0)
  eveningClosed  Boolean  @default(false)
  categories     DayCategoryStatus[]
  dailies        DailyTask[]
  createdAt      DateTime @default(now())
}

model DayCategoryStatus {
  id         Int      @id @default(autoincrement())
  day        Day      @relation(fields: [dayId], references: [id], onDelete: Cascade)
  dayId      Int
  category   Category @relation(fields: [categoryId], references: [id])
  categoryId Int
  done       Boolean  @default(false)

  @@unique([dayId, categoryId])
}

model DailyTask {
  id        Int      @id @default(autoincrement())
  day       Day      @relation(fields: [dayId], references: [id], onDelete: Cascade)
  dayId     Int
  text      String
  done      Boolean  @default(false)
  order     Int      @default(0)
  createdAt DateTime @default(now())
}

model TaskTemplate {
  id    Int    @id @default(autoincrement())
  text  String
  order Int    @default(0)
}

model Settings {
  id                   Int     @id @default(1)
  youtubeBudget        Int     @default(60)
  notificationsEnabled Boolean @default(false)
}
```

`archived` на категории — это мягкое удаление: скрывает категорию из сегодняшнего экрана и из формы добавления, но исторические `DayCategoryStatus` не трогает, так что статистика за прошлые дни не ломается.

При первом запуске (миграция/сид) создать 5 категорий:
`sport` → «Спорт», `personal` → «Общение / свидания», `family` → «Семья», `learning` → «Обучение», `work` → «Работа / финансы». И одну строку `Settings` с `youtubeBudget = 60`.

## Backend — эндпоинты (NestJS, модули по фичам: DaysModule, CategoriesModule, DailiesModule, TaskTemplatesModule, SettingsModule, StatsModule)

- `GET /days/:date` — вернуть день (создать лениво, если нет записи; подтянуть неархивные категории из `Category`, для отсутствующих `DayCategoryStatus` считать `done=false`)
- `PATCH /days/:date/categories/:key` `{ done: boolean }` — upsert статуса категории на день
- `POST /days/:date/dailies` `{ text: string }` — добавить задачу
- `PATCH /dailies/:id` `{ done?: boolean, text?: string }`
- `DELETE /dailies/:id`
- `PATCH /days/:date/youtube` `{ delta?: number, reset?: boolean }` — прибавить минуты или обнулить
- `PATCH /days/:date` `{ eveningClosed: boolean }` — отметить/снять флаг «день закрыт»
- `GET /history?limit=21` — массив `{ date, completed, total, ytOver }` за последние N дней (completed = кол-во done-категорий, total = кол-во неархивных категорий, ytOver = youtubeMinutes > budget в этот день). Эндпоинт используется и для 21-дневной полоски, и для heatmap (вызывается с `limit=84`).
- `GET /categories` — только неархивные, отсортированные по `order`
- `POST /categories` `{ key: string, label: string }` — создать новую
- `PATCH /categories/:key` `{ label?: string, order?: number, archived?: boolean }` — переименовать / переставить / архивировать
- `GET /task-templates` / `POST /task-templates` `{ text: string }` / `PATCH /task-templates/:id` `{ text?: string, order?: number }` / `DELETE /task-templates/:id` — библиотека повторяющихся задач (тренировка, обучение и т.п.), из которой можно в один клик добавить пункт в дейлики на сегодня
- `GET /stats/categories?days=30` — массив `{ key, label, doneCount, totalDays, pct }` на категорию за последние N дней
- `GET /stats/youtube?weeks=8` — массив `{ weekStart, avgMinutes, budget }` понедельно
- `GET /stats/youtube-daily?days=30` — массив `{ date, minutes, budget, pct }` за последние N дней (`budget` — текущее значение `Settings.youtubeBudget`, без истории изменений; `pct = round(minutes/budget*100)`). Источник для 30-дневного YouTube-хитмепа и прогресс-бара среднего расхода
- `GET /settings` / `PATCH /settings` `{ youtubeBudget?: number, notificationsEnabled?: boolean }`

Валидация через class-validator DTO. Глобальный `ValidationPipe`. CORS открыт на `http://localhost:4887`.

## Frontend — поведение (Next.js, один экран `/`)

Тёмная дашборд-тема — см. раздел «Дизайн-система» ниже, следовать токенам оттуда буквально. Блоки на экране:

1. **Шапка** — дата, счётчик серии подряд закрытых дней (все неархивные категории done), иконка-шестерёнка справа — открывает модалку настроек. Серия считается по `/history`: подряд идущие дни с `completed === total`, заканчивая вчера; сегодня добавляется к серии только если уже полностью закрыт.
2. **Сферы дня** — тумблеры по категориям (без инлайн-редактирования — переименование только через модалку настроек)
3. **Задачи на сегодня** — список с чекбоксом и удалением + добавление текстом; рядом с полем ввода — маленькая кнопка «из шаблонов» (открывает выпадающий список `task-templates`, клик по пункту добавляет его текстом в дейлики на сегодня)
4. **YouTube** — текущие минуты / бюджет (бюджет редактируется прямо в панели), прогресс-бар (цвет: обычный → жёлтый после 70% → красный при переборе), кнопки быстрого добавления +10/+25/+50, кнопка сброса. Под кнопками — микролейбл `var(--text-dim)`, 11.5px: «Здесь только то, что ты сам занёс вручную. Точные логи — в Qbserve (автотрекер активности на Mac) и в Screen Time (Настройки → Экранное время)»
5. **Статистика** — см. отдельный раздел «Статистика / визуализация» ниже

API-клиент бьёт в `NEXT_PUBLIC_API_URL` (из браузера, не через docker-сеть).

## Дизайн-система

Использовать буквально эти токены (тот же вид, что в прототипе, который уже был показан пользователю) — не заменять на другую палитру:

```css
--bg: #14161b;          /* фон страницы */
--panel: #1b1e25;       /* фон карточек */
--panel-alt: #20242c;   /* фон полей ввода, треков тумблеров */
--border: #2b2f38;
--text: #e8e6de;
--text-muted: #888d98;
--text-dim: #5b5f6a;
--accent: #e0a458;      /* амбер — состояние "включено", позитив, цифры серии */
--accent2: #4fa8c9;     /* холодный циан — вторичные данные, YouTube-бар */
--danger: #d9645a;      /* перебор по бюджету, ошибки */
--radius: 10px;
font-mono: ui-monospace, 'SF Mono', 'JetBrains Mono', Consolas, monospace;  /* для всех чисел */
font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; /* для лейблов и текста */
```

Паттерны компонентов:
- Карточки-панели: `background: var(--panel)`, `border: 1px solid var(--border)`, `border-radius: var(--radius)`, заголовок панели — 12px, uppercase, letter-spacing 0.08em, `var(--text-muted)`.
- Тумблеры категорий: капсула-трек 42×24px на `var(--panel-alt)`, кружок-бегунок 18px; включено — трек с мягкой заливкой `var(--accent)` при 14% прозрачности и bounded-glow бордером, бегунок сплошной `var(--accent)`, translateX на 18px.
- Крупные цифры (счётчик серии, минуты YouTube) — моно-шрифт, жирный, `var(--accent)` для акцентных значений.
- Ничего лишнего: без градиентов, без теней кроме мягкого glow на активном тумблере, минимум анимации (только transition 0.15–0.25s на цвет/transform).

## Модальное окно настроек

Открывается по клику на шестерёнку в шапке. Тёмный оверлей `rgba(0,0,0,0.6)`, панель по центру — тот же `--panel`/`--border`/`--radius`, закрытие по клику вне панели, по крестику, по Escape.

Две вкладки внутри модалки:

1. **Категории** — список текущих категорий (label, поле ввода для переименования, стрелки вверх/вниз для `order`, кнопка «архивировать»). Внизу — форма добавления новой категории (`key` генерируется транслитерацией label на клиенте, label — как ввёл пользователь).
2. **Шаблоны задач** — список `task-templates` (текст + удалить), форма добавления нового шаблона. Это библиотека повторяющихся дел (тренировка, обучение и т.п.) для быстрого добавления в дейлики одним кликом, не перепечатывая каждый день заново.

Изменения в обеих вкладках сохраняются сразу при действии (без отдельной кнопки «сохранить»), как и остальной интерфейс.

## Статистика / визуализация

Заменяет плоскую 21-дневную полоску на более полную аналитику, три компонента в одной панели (или на отдельном табе того же экрана — на усмотрение реализации, но без роутинга на отдельную страницу):

1. **Heatmap-календарь** — сетка «неделя × день недели» за последние 12 недель (~84 дня, `GET /history?limit=84`), в стиле GitHub-контрибуций: квадратик на день, заливка `var(--accent)` с шагом прозрачности по доле выполненных категорий (0/20/40/60/80/100%), тонкая красная полоска снизу если в этот день `ytOver`. Кастомный компонент на SVG/CSS-grid, не библиотека.
2. **Разбивка по категориям** — горизонтальные бары, один на категорию, из `GET /stats/categories?days=30`: подпись категории слева, % закрытых дней за 30 дней справа, длина бара = pct. Сразу видно, какая сфера проседает.
3. **YouTube по неделям** — столбчатый график из `GET /stats/youtube?weeks=8`: одна колонка на неделю, высота = средние минуты/день, горизонтальная линия — уровень бюджета. Использовать `recharts` (уже в проекте как зависимость Next.js) для этого графика; для heatmap recharts не подходит — кастом.
4. **YouTube-хитмеп за 30 дней** — сетка 30 квадратиков из `GET /stats/youtube-daily?days=30`, заливка по `pct` (доля минут от бюджета в этот день): пусто (`var(--panel-alt)`) — минуты не вносили; `var(--accent2)` нарастающей непрозрачности — до 70% бюджета; `var(--accent)` — 70–100% бюджета; `var(--danger)` нарастающей непрозрачности — свыше 100% (та же логика цвета, что у дневного YouTube-бара, применённая поквадратно). Кастомный компонент, как и хитмеп категорий. Над сеткой — прогресс-бар: тот же `.bar`-компонент, что в дневной YouTube-панели, заливка = `min(100, avg/budget*100)%` (avg — среднее минут/день за 30 дней из того же эндпоинта), тот же 3-цветный переход обычный → жёлтый после 70% → красный при переборе. Подпись рядом: `${avg} / ${budget} мин/день · 30 дней`.

Все графики — та же тёмная палитра, шрифт моно для чисел/подписей осей.

## Уведомления (Web Notification API)

Важно: вкладка не имеет доступа к другим вкладкам/сайтам — определить, что пользователь прямо сейчас смотрит YouTube, обычным веб-приложением невозможно (нужно browser extension с tabs-permission, вне скоупа этого промпта). YouTube без алертов вообще — только счётчик минут, как описано выше. Уведомления нужны для двух окон в течение дня, оба про то, что пользователь ещё не заполнил трекер:

Реализовать через стандартный `Notification` API (работает пока вкладка открыта, включая фон/неактивную вкладку; НЕ работает если вкладка или браузер закрыты — это не push, а просто нотификация из уже загруженной страницы):

- Кнопка «Включить уведомления» в шапке → по клику `Notification.requestPermission()` (запрос строго по user gesture, иначе Safari тихо откажет). Состояние (включены/выключены) хранить в `Settings` на бэке — это часть настроек трекера, не одноразовое UI-состояние.
- **Утреннее окно 09:00–21:30**: раз в 10 минут (`setInterval`, интервал стартует сразу при включении и на каждой загрузке страницы, если разрешение уже выдано) — если `dailies.length === 0` для сегодняшнего дня, показать нотификацию «Ещё не занёс задачи на сегодня».
- **Вечернее окно 21:30–24:00**: раз в 10 минут — если день не отмечен закрытым, нотификация «Отметь сферы за сегодня и закрой день».
- Для «дня закрыт» добавить в модель `Day` булево поле `eveningClosed` (default `false`) и кнопку на фронте «Отметить день закрытым» / «День закрыт ✓ (отменить)» рядом со сферами — обновляет флаг через `PATCH /days/:date` `{ eveningClosed: boolean }`.
- Обе проверки — чистый `setInterval` на клиенте по локальному времени браузера, без cron на бэке.

## Docker Compose

- `postgres:16-alpine`, именованный volume для данных (`pgdata`), порт 5432 пробросить на хост для локального psql
- `backend`: multi-stage Dockerfile, на старте `prisma migrate deploy` + сид категорий, затем старт приложения. Порт 3001 на хост. `depends_on: postgres` с healthcheck.
- `frontend`: multi-stage Dockerfile (next build), внутренний порт Next.js (3000) пробросить на хост как `4887:3000`. `NEXT_PUBLIC_API_URL=http://localhost:3001` в build/runtime env.
- `.env.example` с `DATABASE_URL`, `YOUTUBE_BUDGET_DEFAULT` и т.д.
- `README.md` с одной командой запуска: `docker compose up -d --build`, и как накатить миграции вручную если нужно.

## Приёмка

`docker compose up -d --build` → `http://localhost:4887` открывается, показывает сегодняшний день. Тумблеры, дейлики, шаблоны задач, YouTube — работают и сохраняются в Postgres, переживают `docker compose restart`. Шестерёнка открывает модалку, в ней рабочее переименование/архивирование категорий и CRUD шаблонов задач без перезагрузки страницы. Блок статистики показывает heatmap за 12 недель, бары по категориям за 30 дней, график YouTube по неделям и хитмеп YouTube за 30 дней с прогресс-баром среднего расхода — все четыре тянут данные из реальных эндпоинтов, не заглушки. В YouTube-панели виден микролейбл про Qbserve и Screen Time.
