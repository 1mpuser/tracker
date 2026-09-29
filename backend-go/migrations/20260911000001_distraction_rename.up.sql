-- Переименование, а не drop+add: минуты за всю историю должны сохраниться.
ALTER TABLE "Day" RENAME COLUMN "youtubeMinutes" TO "distractionMinutes";
ALTER TABLE "Settings" RENAME COLUMN "youtubeBudget" TO "distractionBudget";
ALTER TABLE "Settings" ADD COLUMN "distractionLabel" TEXT NOT NULL DEFAULT 'Залипание';
-- У уже существующей инсталляции (владельца) это был YouTube — сохраняем название.
UPDATE "Settings" SET "distractionLabel" = 'YouTube';
