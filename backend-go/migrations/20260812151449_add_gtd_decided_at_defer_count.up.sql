-- AlterTable
ALTER TABLE "GtdItem" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "deferCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "GtdItem" SET "decidedAt" = "createdAt" WHERE "decidedAt" IS NULL;
