-- AlterTable
ALTER TABLE "ChangeRequest" ADD COLUMN "mailboxId" TEXT;
ALTER TABLE "ChangeRequest" ADD COLUMN "provenance" TEXT;
ALTER TABLE "ChangeRequest" ADD COLUMN "providerMessageId" TEXT;
ALTER TABLE "ChangeRequest" ADD COLUMN "providerThreadId" TEXT;
ALTER TABLE "ChangeRequest" ADD COLUMN "retrievedAt" DATETIME;

-- CreateTable
CREATE TABLE "AssessmentVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "analysis" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssessmentVersion_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ChangeRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" TEXT NOT NULL,
    "result" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "error" TEXT,
    "runAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" DATETIME,
    "lockedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MailboxCheckpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cursor" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
