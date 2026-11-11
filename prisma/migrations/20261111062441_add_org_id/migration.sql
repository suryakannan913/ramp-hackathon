-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChangeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL DEFAULT 'default-org',
    "vendorId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "replyTo" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "headers" TEXT NOT NULL,
    "rawEmail" BLOB NOT NULL,
    "proposed" TEXT NOT NULL,
    "assessment" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "mailboxId" TEXT,
    "providerMessageId" TEXT,
    "providerThreadId" TEXT,
    "retrievedAt" DATETIME,
    "provenance" TEXT,
    CONSTRAINT "ChangeRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ChangeRequest" ("assessment", "body", "createdAt", "fingerprint", "headers", "id", "mailboxId", "proposed", "provenance", "providerMessageId", "providerThreadId", "rawEmail", "replyTo", "retrievedAt", "risk", "score", "sender", "status", "subject", "updatedAt", "vendorId") SELECT "assessment", "body", "createdAt", "fingerprint", "headers", "id", "mailboxId", "proposed", "provenance", "providerMessageId", "providerThreadId", "rawEmail", "replyTo", "retrievedAt", "risk", "score", "sender", "status", "subject", "updatedAt", "vendorId" FROM "ChangeRequest";
DROP TABLE "ChangeRequest";
ALTER TABLE "new_ChangeRequest" RENAME TO "ChangeRequest";
CREATE UNIQUE INDEX "ChangeRequest_fingerprint_key" ON "ChangeRequest"("fingerprint");
CREATE TABLE "new_Vendor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL DEFAULT 'default-org',
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountLast4" TEXT NOT NULL,
    "routing" TEXT NOT NULL,
    "history" TEXT NOT NULL
);
INSERT INTO "new_Vendor" ("accountLast4", "bankName", "country", "domain", "history", "id", "name", "phone", "routing") SELECT "accountLast4", "bankName", "country", "domain", "history", "id", "name", "phone", "routing" FROM "Vendor";
DROP TABLE "Vendor";
ALTER TABLE "new_Vendor" RENAME TO "Vendor";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
