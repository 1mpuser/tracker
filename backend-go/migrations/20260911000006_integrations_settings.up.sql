-- Учётные данные iCloud и настройки Session — только добавления.
ALTER TABLE "Settings" ADD COLUMN "icloudAppleId" TEXT;
ALTER TABLE "Settings" ADD COLUMN "icloudAppPasswordEnc" TEXT;
ALTER TABLE "Settings" ADD COLUMN "icloudRemindersList" TEXT NOT NULL DEFAULT 'GTD';
ALTER TABLE "Settings" ADD COLUMN "sessionCalendarName" TEXT;
ALTER TABLE "Settings" ADD COLUMN "sessionMinMinutes" INTEGER NOT NULL DEFAULT 20;
