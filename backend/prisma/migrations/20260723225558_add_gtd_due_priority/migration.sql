-- AlterTable
ALTER TABLE "GtdItem" ADD COLUMN     "dueDate" DATE,
ADD COLUMN     "priority" BOOLEAN NOT NULL DEFAULT false;
