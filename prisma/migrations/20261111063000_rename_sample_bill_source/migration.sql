PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Bill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vendorId" TEXT NOT NULL,
    "invoice" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'sample',
    CONSTRAINT "Bill_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Bill" ("id", "vendorId", "invoice", "amountCents", "dueDate", "status", "source")
SELECT "id", "vendorId", "invoice", "amountCents", "dueDate", "status",
       CASE WHEN "source" = 'demo' THEN 'sample' ELSE "source" END
FROM "Bill";

DROP TABLE "Bill";
ALTER TABLE "new_Bill" RENAME TO "Bill";

UPDATE "AuditEvent"
SET "actor" = 'Sample seed', "detail" = 'Synthetic sample email received.'
WHERE "type" = 'received'
  AND "actor" = 'Demo seed'
  AND "detail" = 'Synthetic demo email received.';

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
