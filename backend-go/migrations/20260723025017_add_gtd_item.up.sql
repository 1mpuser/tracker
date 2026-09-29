-- CreateEnum
CREATE TYPE "GtdStatus" AS ENUM ('inbox', 'backlog', 'calendar', 'someday', 'waiting', 'project', 'reference', 'done', 'archived');

-- CreateTable
CREATE TABLE "GtdItem" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" "GtdStatus" NOT NULL DEFAULT 'inbox',
    "parentId" INTEGER,
    "scheduledDate" DATE,
    "waitingFor" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "GtdItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GtdItem" ADD CONSTRAINT "GtdItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "GtdItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
