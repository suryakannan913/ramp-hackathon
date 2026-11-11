import "dotenv/config";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { vendors } from "../src/lib/fixtures";
import { sampleEmail } from "../src/lib/sample-cases";
import {
  ingestRequest,
  getCase,
  decide,
  completeCallback,
  releaseHolds,
} from "../src/lib/service";
const reviewer = {
  id: "test-reviewer",
  name: "Test reviewer",
  role: "reviewer",
  orgId: "default-org",
} as const;
const vendorId = `test-vendor-${Date.now()}`;
async function email(key: string) {
  return Buffer.concat([
    await sampleEmail(key),
    Buffer.from(`\r\nTest run ${vendorId}`),
  ]);
}
test("high-risk lifecycle preserves holds through rejection and uses trusted contacts", async () => {
  await db.vendor.create({ data: { ...vendors[0], id: vendorId } });
  await db.bill.create({
    data: {
      id: `test-bill-${vendorId}`,
      vendorId,
      invoice: "TEST-48K",
      amountCents: 4800000,
      dueDate: new Date(Date.now() + 86400000),
    },
  });
  const raw = await email("attack");
  const result = await ingestRequest(raw, vendorId, {
    fixture: true,
    skipAI: true,
  });
  const duplicate = await ingestRequest(raw, vendorId, {
    fixture: true,
    skipAI: true,
  });
  assert.equal(result.id, duplicate.id);
  assert.ok(duplicate.duplicate);
  let c = await getCase(result.id, reviewer);
  assert.equal(c.risk, "high");
  assert.equal(c.holds.length, 1);
  assert.equal(c.holds[0].status, "confirmed");
  assert.equal(c.callback?.phone, vendors[0].phone);
  await assert.rejects(
    () => decide(c.id, "approve", "Looks good to me", reviewer),
    /callback/,
  );
  await assert.rejects(
    () => releaseHolds(c.id, "Safe to release now", reviewer),
    /final decision/,
  );
  await completeCallback(c.id, "denied");
  await assert.rejects(
    () => completeCallback(c.id, "confirmed"),
    /already recorded/,
  );
  await assert.rejects(
    () => decide(c.id, "approve", "Vendor denied request", reviewer),
    /callback/,
  );
  await decide(
    c.id,
    "reject",
    "Vendor denied the change on the trusted callback.",
    reviewer,
  );
  c = await getCase(c.id, reviewer);
  assert.equal(c.status, "rejected");
  assert.equal(c.holds[0].status, "confirmed");
  await assert.rejects(
    () => decide(c.id, "approve", "Trying again after reject", reviewer),
    /final decision/,
  );
  await releaseHolds(
    c.id,
    "Rejected proposed bank details; retain original vendor account.",
    reviewer,
  );
  c = await getCase(c.id, reviewer);
  assert.equal(c.holds[0].status, "released");
  assert.ok(c.events.some((e) => e.type === "hold_released"));
});
test("medium-risk approval needs callback; bank baseline remains unchanged", async () => {
  const result = await ingestRequest(await email("ambiguous"), vendorId, {
    fixture: true,
    skipAI: true,
  });
  await assert.rejects(
    () => decide(result.id, "approve", "Reviewed the email", reviewer),
    /callback/,
  );
  await completeCallback(result.id, "confirmed");
  await decide(
    result.id,
    "approve",
    "Confirmed through simulated trusted contact.",
    reviewer,
  );
  const c = await getCase(result.id, reviewer);
  assert.equal(c.status, "approved");
  assert.equal(c.vendor.accountLast4, "2841");
  assert.equal(c.holds.length, 0);
});
after(async () => {
  const requests = await db.changeRequest.findMany({
    where: { vendorId },
    select: { id: true },
  });
  const ids = requests.map((r) => r.id);
  await db.$transaction([
    db.auditEvent.deleteMany({ where: { requestId: { in: ids } } }),
    db.decision.deleteMany({ where: { requestId: { in: ids } } }),
    db.callback.deleteMany({ where: { requestId: { in: ids } } }),
    db.paymentHold.deleteMany({ where: { requestId: { in: ids } } }),
    db.attachment.deleteMany({ where: { requestId: { in: ids } } }),
    db.changeRequest.deleteMany({ where: { vendorId } }),
    db.bill.deleteMany({ where: { vendorId } }),
    db.vendor.deleteMany({ where: { id: vendorId } }),
  ]);
  await db.$disconnect();
});
