-- AlterTable
ALTER TABLE "DailyTask" ADD COLUMN     "carriedForward" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "carriedFromDate" DATE;
