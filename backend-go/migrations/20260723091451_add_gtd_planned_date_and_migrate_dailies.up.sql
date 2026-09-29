-- AlterTable
ALTER TABLE "GtdItem" ADD COLUMN     "plannedDate" DATE;

-- Data migration: copy existing DailyTask rows into GtdItem (DailyTask table left intact as a safety net)
INSERT INTO "GtdItem" (title, status, "plannedDate", "completedAt", "order", "createdAt", "updatedAt")
SELECT dt.text,
       (CASE WHEN dt.done THEN 'done' ELSE 'backlog' END)::"GtdStatus",
       d.date,
       (CASE WHEN dt.done THEN d.date::timestamp ELSE NULL END),
       dt."order",
       dt."createdAt",
       now()
FROM "DailyTask" dt
JOIN "Day" d ON d.id = dt."dayId";
