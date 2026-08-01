# Сводка дня в Telegram-канал — дизайн

## Мотивация

Итог дня (сколько помидорок, какие сферы закрыты, оценка) живёт только внутри трекера, доступного на localhost. Чтобы иметь ленту прогресса, которую видно с телефона и которую можно листать назад как историю, при закрытии дня трекер публикует одно сводное сообщение в Telegram-канал через бота.

Telegram выбран потому, что исходящая публикация в канал требует ровно одного HTTP-вызова (`POST https://api.telegram.org/bot<TOKEN>/sendMessage`) — без polling, без webhook, без входящего трафика в сторону localhost. Это ложится на тот же env-gated паттерн, что уже используют `backend/src/obsidian/` и `backend/src/icloud/`.

## Решения (зафиксировано на брейншторме)

- **Триггер — только закрытие дня.** Ровно один пост в сутки, в момент, когда `Day.eveningClosed` переходит из `false` в `true`. Никаких уведомлений на отдельные действия (отметил сферу, добавил помидорку) — это дало бы десятки сообщений в день.
- **Один пост на дату, навсегда.** Идемпотентность обеспечивается новым полем `Day.telegramMessageId`. Если за эту дату уже публиковали, повторное закрытие (после переоткрытия дня) не шлёт ничего и не редактирует старый пост. Лента канала = ровно один пост на дату.
- **Состав сообщения:** дата, день недели, количество помидорок, бинарный список активных сфер с отметками и счётчиком, оценка дня, комментарий. YouTube-минуты и GTD-задачи дня не включаются.
- **Best-effort.** Ошибка отправки (нет сети, неверный токен, бот не админ канала) не ломает закрытие дня: исключение ловится, пишется в `logger.warn`, пользователю ничего не показывается. Поле `telegramMessageId` остаётся `null`, поэтому следующее закрытие этого же дня попробует отправить снова.
- **Отправка с бэкенда, не с фронтенда.** `NEXT_PUBLIC_*` инлайнится в клиентский бандл на этапе `next build`, так что бот-токен на фронтенде утёк бы в исходники страницы.
- **Без cron-джоба.** Закрытие дня — уже событие в коде; отдельный планировщик, сканирующий закрытые дни в конце суток, был бы лишней инфраструктурой.

## Формат сообщения

`parse_mode: HTML`. Лейблы сфер и комментарий экранируются (`&`, `<`, `>`) — иначе символ `<` в названии категории или в комментарии сломал бы разметку и Telegram вернул бы 400.

```
📅 1 августа 2026, суббота

🍅 Помидорок: 7
⭐ Оценка: 8/10

Сферы — 4 / 6
✅ Спорт
✅ Английский
✅ Код
✅ Чтение
❌ Медитация
❌ Дневник

💬 Тяжёлое утро, но вытянул вечер
```

Правила:

- Строка `⭐ Оценка` пропускается, если `rating === null`.
- Строка `💬` пропускается, если `comment` пуст или состоит из пробелов.
- Список сфер — все активные (неархивированные) категории дня, в том же порядке, в каком их отдаёт `DayView.categories` (то есть тот же порядок, что в `SpheresPanel`).
- Если активных категорий нет, блок «Сферы» пропускается целиком.
- `🍅 Помидорок: 0` печатается всегда, даже при нуле.

## Схема БД

Одно новое поле в `model Day`:

```prisma
telegramMessageId Int?
```

Миграция — `prisma migrate dev`, добавляет nullable-колонку, существующие строки не трогает. В `DayView` поле **не выносится**: оно чисто внутреннее, фронтенду не нужно. Ни один фронтенд-компонент не меняется.

## Инфраструктура

Новых зависимостей нет — используется встроенный `fetch`.

Env-переменные (обе необязательны; если любая пуста — интеграция выключена, сетевого вызова не происходит):

- `TELEGRAM_BOT_TOKEN` — токен бота от `@BotFather`.
- `TELEGRAM_CHAT_ID` — `@имя_канала` для публичного канала либо числовой `-100…` для приватного.

Изменения:

- `.env.example` — две строки без значений.
- `docker-compose.yml`, сервис `backend`, блок `environment`: `TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:-}` и `TELEGRAM_CHAT_ID: ${TELEGRAM_CHAT_ID:-}` — по образцу уже имеющихся `ICLOUD_*`.
- `README` — секция с шагами: создать бота у `@BotFather`, добавить его администратором канала с правом публикации сообщений, узнать `chat_id`, заполнить корневой `.env`.

## Backend

Новый модуль `backend/src/telegram/`, по образцу `backend/src/obsidian/`.

### `telegram.helpers.ts` — чистые функции (TDD)

```ts
function escapeHtml(s: string): string;
function formatRuDate(date: string): string;      // '2026-08-01' -> '1 августа 2026, суббота'
function buildDaySummary(day: DayView): string;   // готовое HTML-тело сообщения
```

`formatRuDate` использует статические массивы месяцев (в родительном падеже) и дней недели, а разбор даты идёт через UTC-безопасные хелперы из `backend/src/common/date.util.ts`. `toLocaleDateString` не применяется: в Alpine-контейнере набор ICU-локалей не гарантирован, и вывод зависел бы от окружения.

### `telegram.service.ts`

```ts
async postDaySummary(day: DayView): Promise<number | null>
```

- Читает `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` из `process.env`. Если любая пуста — `return null` немедленно, без сетевого вызова.
- Иначе `fetch` на `https://api.telegram.org/bot<TOKEN>/sendMessage` с телом `{ chat_id, text: buildDaySummary(day), parse_mode: 'HTML' }` и таймаутом 5 секунд (`AbortSignal.timeout(5000)`).
- Успех → возвращает `result.message_id`.
- Не-2xx ответ, `ok: false` в теле, брошенный `fetch` или таймаут → `logger.warn` и `return null`. Наружу ничего не бросается.

Сервис не обращается к Prisma: он возвращает `message_id`, а сохраняет его вызывающая сторона. Так модуль остаётся независимым от схемы БД и тестируется одним лишь подменённым `fetch`.

### `telegram.module.ts`

Экспортирует `TelegramService`; импортируется в `DaysModule`.

### Точка вызова — `DaysService.updateDay`

```ts
async updateDay(dateStr: string, data: UpdateDayData): Promise<DayView> {
  const dayId = await this.getOrCreateDayId(dateStr);
  const before = await this.prisma.day.findUnique({ where: { id: dayId } });
  await this.prisma.day.update({ where: { id: dayId }, data });
  const view = await this.getDay(dateStr);

  if (data.eveningClosed === true && before?.telegramMessageId == null) {
    const messageId = await this.telegram.postDaySummary(view);
    if (messageId != null) {
      await this.prisma.day.update({ where: { id: dayId }, data: { telegramMessageId: messageId } });
    }
  }

  return view;
}
```

Условие проверяет именно `telegramMessageId == null`, а не «предыдущее значение `eveningClosed` было `false`»: это и есть гарантия «один пост на дату навсегда», переживающая переоткрытие дня.

Отправка выполняется внутри запроса (`await`), а не fire-and-forget — иначе `message_id` пришлось бы записывать из отвязанного промиса. Цена — до 5 секунд задержки в наихудшем случае на единственном действии «закрыть день»; при недоступной сети `fetch` обычно падает заметно быстрее.

## Фронтенд

Изменений нет.

## Тестирование

`telegram.helpers.spec.ts` — TDD, до реализации:

- `formatRuDate`: разные месяцы и дни недели; проверка, что нет сдвига на сутки на границе месяца (UTC-безопасность).
- `escapeHtml`: `&`, `<`, `>`; строка без спецсимволов не меняется.
- `buildDaySummary`: полный день; `rating === null` (строка оценки отсутствует); пустой и пробельный `comment` (строка отсутствует); `pomodoros: 0` (строка присутствует); все сферы закрыты; пустой список категорий (блок отсутствует); лейбл категории с `<` (экранирован).

`telegram.service.spec.ts` — с подменённым `global.fetch`:

- нет `TELEGRAM_BOT_TOKEN` → `fetch` не вызывался, результат `null`;
- нет `TELEGRAM_CHAT_ID` → то же;
- успешный ответ → возвращается `message_id`, URL содержит токен, тело содержит `parse_mode: 'HTML'`;
- HTTP 400 → `null`, исключение не брошено;
- `fetch` бросает → `null`, исключение не брошено.

`days.service.spec.ts` — дополняется, `TelegramService` мокается:

- `eveningClosed: true` при `telegramMessageId === null` → `postDaySummary` вызван, `telegramMessageId` записан;
- `eveningClosed: true` при уже заданном `telegramMessageId` → `postDaySummary` не вызван;
- `postDaySummary` вернул `null` → второго `prisma.day.update` нет, метод отработал штатно;
- обновление только `rating`/`comment` без `eveningClosed` → `postDaySummary` не вызван.
