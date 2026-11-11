-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountLast4" TEXT NOT NULL,
    "routing" TEXT NOT NULL,
    "history" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vendorId" TEXT NOT NULL,
    "invoice" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'demo',
    CONSTRAINT "Bill_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    CONSTRAINT "ChangeRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "content" BLOB NOT NULL,
    "metadata" TEXT NOT NULL,
    CONSTRAINT "Attachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ChangeRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentHold" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mode" TEXT NOT NULL DEFAULT 'simulated',
    "detail" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaymentHold_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ChangeRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaymentHold_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Callback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'simulated',
    "outcome" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Callback_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ChangeRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Decision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ChangeRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ChangeRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ChangeRequest_fingerprint_key" ON "ChangeRequest"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentHold_requestId_billId_key" ON "PaymentHold"("requestId", "billId");

-- CreateIndex
CREATE UNIQUE INDEX "Callback_requestId_key" ON "Callback"("requestId");
