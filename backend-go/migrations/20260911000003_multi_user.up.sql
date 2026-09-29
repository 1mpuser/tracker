-- 1. Пользователи.
CREATE TABLE "User" (
  "id" SERIAL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- 2. Колонки пока nullable.
ALTER TABLE "Category"     ADD COLUMN "userId" INTEGER;
ALTER TABLE "Day"          ADD COLUMN "userId" INTEGER;
ALTER TABLE "TaskTemplate" ADD COLUMN "userId" INTEGER;
ALTER TABLE "Settings"     ADD COLUMN "userId" INTEGER;
ALTER TABLE "GtdItem"      ADD COLUMN "userId" INTEGER;
ALTER TABLE "Routine"      ADD COLUMN "userId" INTEGER;
ALTER TABLE "TelegramChat" ADD COLUMN "userId" INTEGER;

-- 3. Существующая однопользовательская инсталляция: всё — владельцу.
-- Адрес-заглушка; настоящий и пароль ставит scripts/set-owner.ts.
-- .invalid — зарезервированный TLD, письмо туда никогда не уйдёт.
DO $$
DECLARE owner_id INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM "Category") OR EXISTS (SELECT 1 FROM "Day") OR EXISTS (SELECT 1 FROM "GtdItem")
     OR EXISTS (SELECT 1 FROM "Settings") OR EXISTS (SELECT 1 FROM "Routine") THEN
    INSERT INTO "User" ("email") VALUES ('owner@localhost.invalid') RETURNING "id" INTO owner_id;
    UPDATE "Category"     SET "userId" = owner_id;
    UPDATE "Day"          SET "userId" = owner_id;
    UPDATE "TaskTemplate" SET "userId" = owner_id;
    UPDATE "Settings"     SET "userId" = owner_id;
    UPDATE "GtdItem"      SET "userId" = owner_id;
    UPDATE "Routine"      SET "userId" = owner_id;
    UPDATE "TelegramChat" SET "userId" = owner_id;
  END IF;
END $$;

-- 4. NOT NULL и внешние ключи.
ALTER TABLE "Category"     ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Day"          ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "TaskTemplate" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Settings"     ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "GtdItem"      ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Routine"      ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "TelegramChat" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Day" ADD CONSTRAINT "Day_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GtdItem" ADD CONSTRAINT "GtdItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramChat" ADD CONSTRAINT "TelegramChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Уникальности в пределах пользователя.
DROP INDEX "Category_key_key";
CREATE UNIQUE INDEX "Category_userId_key_key" ON "Category"("userId", "key");
DROP INDEX "Day_date_key";
CREATE UNIQUE INDEX "Day_userId_date_key" ON "Day"("userId", "date");
DROP INDEX "TelegramChat_chatId_key";
CREATE UNIQUE INDEX "TelegramChat_userId_chatId_key" ON "TelegramChat"("userId", "chatId");
CREATE UNIQUE INDEX "Settings_userId_key" ON "Settings"("userId");
CREATE INDEX "TaskTemplate_userId_idx" ON "TaskTemplate"("userId");
CREATE INDEX "GtdItem_userId_idx" ON "GtdItem"("userId");
CREATE INDEX "Routine_userId_idx" ON "Routine"("userId");

-- 6. Settings.id больше не синглтон 1.
CREATE SEQUENCE "Settings_id_seq" OWNED BY "Settings"."id";
ALTER TABLE "Settings" ALTER COLUMN "id" SET DEFAULT nextval('"Settings_id_seq"');
SELECT setval('"Settings_id_seq"', COALESCE((SELECT MAX("id") FROM "Settings"), 0) + 1, false);
