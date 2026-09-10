-- Токен бота живёт в настройках (env остаётся фоллбэком на уровне кода).
ALTER TABLE "Settings" ADD COLUMN "telegramBotToken" TEXT;

-- Чат, куда уходят сводки. Может быть несколько.
CREATE TABLE "TelegramChat" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "daily" BOOLEAN NOT NULL DEFAULT true,
    "weekly" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramChat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramChat_chatId_key" ON "TelegramChat"("chatId");

-- Факт публикации сводки в чат: идемпотентность «один пост на день на чат».
CREATE TYPE "TelegramPostKind" AS ENUM ('day', 'week');

CREATE TABLE "TelegramPost" (
    "id" SERIAL NOT NULL,
    "dayId" INTEGER NOT NULL,
    "chatId" TEXT NOT NULL,
    "kind" "TelegramPostKind" NOT NULL,
    "messageId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TelegramPost_dayId_idx" ON "TelegramPost"("dayId");
CREATE UNIQUE INDEX "TelegramPost_dayId_chatId_kind_key" ON "TelegramPost"("dayId", "chatId", "kind");
ALTER TABLE "TelegramPost" ADD CONSTRAINT "TelegramPost_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "Day"("id") ON DELETE CASCADE ON UPDATE CASCADE;
