-- Проверка «без потерь» при переезде: считается на локальной БД до дампа и на
-- сервере после миграций; числа должны совпасть. Серверная версия — плюс userId,
-- поэтому суммы считаются по полям, существовавшим до переезда.
SELECT 'Day' AS t, count(*) AS n, md5(string_agg(date::text || ':' || "distractionMinutes" || ':' || pomodoros || ':' || "eveningClosed" || ':' || coalesce(rating::text,'') || ':' || coalesce(comment,''), '|' ORDER BY date)) AS sum FROM "Day"
UNION ALL SELECT 'DayCategoryStatus', count(*), md5(string_agg("dayId" || ':' || "categoryId" || ':' || done, '|' ORDER BY "dayId", "categoryId")) FROM "DayCategoryStatus"
UNION ALL SELECT 'Category', count(*), md5(string_agg(key || ':' || label || ':' || archived, '|' ORDER BY key)) FROM "Category"
UNION ALL SELECT 'GtdItem', count(*), md5(string_agg(id || ':' || title || ':' || status || ':' || coalesce("plannedDate"::text,''), '|' ORDER BY id)) FROM "GtdItem"
UNION ALL SELECT 'Routine', count(*), md5(string_agg(id || ':' || title, '|' ORDER BY id)) FROM "Routine"
UNION ALL SELECT 'RoutineLog', count(*), md5(string_agg("routineId" || ':' || date || ':' || count, '|' ORDER BY "routineId", date)) FROM "RoutineLog"
UNION ALL SELECT 'TaskTemplate', count(*), md5(string_agg(id || ':' || text, '|' ORDER BY id)) FROM "TaskTemplate"
UNION ALL SELECT 'TelegramChat', count(*), md5(string_agg("chatId" || ':' || daily || ':' || weekly, '|' ORDER BY "chatId")) FROM "TelegramChat"
UNION ALL SELECT 'TelegramPost', count(*), md5(string_agg("dayId" || ':' || "chatId" || ':' || kind || ':' || "messageId", '|' ORDER BY "dayId", "chatId", kind)) FROM "TelegramPost";
