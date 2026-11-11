import test from "node:test";
import assert from "node:assert/strict";
import { assess, validRouting, editDistance } from "../src/lib/risk";
import { vendors } from "../src/lib/fixtures";
import { parseEmail } from "../src/lib/ingest";
import { demoEmail } from "../src/lib/demo";
import { evaluate, examples } from "../src/lib/evaluation";
const v = vendors[0];
const input = {
  sender: `sarah@${v.domain}`,
  replyTo: `sarah@${v.domain}`,
  subject: "Bank update",
  body: "Please follow the usual verification process.",
  headers: "spf=pass; dkim=pass; dmarc=pass",
  proposed: {
    bankName: "Chase",
    accountLast4: "1234",
    routing: "021000021",
    country: "US",
  },
  hasDocument: true,
  authTrusted: true,
  dueWithinDays: 10,
};
test("clean fixture remains low; uploaded headers impose review floor", () => {
  assert.equal(assess(input, v).risk, "low");
  assert.equal(assess({ ...input, authTrusted: false }, v).risk, "medium");
});
test("lookalike + reply diversion + urgency is high risk with cited evidence", () => {
  const a = assess(
    {
      ...input,
      sender: "sarah@northstar-supp1y.com",
      replyTo: "finance@attacker.test",
      body: "Update immediately today.",
    },
    v,
  );
  assert.equal(a.risk, "high");
  assert.ok(
    a.evidence.some(
      (e) => e.id === "sender-domain" && e.quote === "northstar-supp1y.com",
    ),
  );
});
test("invalid US routing is detected; checksum is not ownership proof", () => {
  assert.ok(validRouting("021000021"));
  assert.ok(!validRouting("000000000"));
  assert.ok(!validRouting("123456789"));
  assert.equal(editDistance("bank", "bunk"), 1);
});
test("unknown evidence cannot produce low risk", () => {
  assert.notEqual(
    assess({ ...input, headers: "", hasDocument: false }, v).risk,
    "low",
  );
});
test("MIME parser preserves the original bank letter and excludes HTML execution", async () => {
  const raw = await demoEmail("attack");
  const parsed = await parseEmail(raw);
  assert.equal(parsed.sender, "sarah@northstar-supp1y.com");
  assert.equal(parsed.attachments[0].mimeType, "application/pdf");
  assert.equal(parsed.proposed.accountLast4, "9017");
  assert.equal(JSON.parse(parsed.attachments[0].metadata).pages, 1);
});
test("parser rejects malformed email", async () => {
  await assert.rejects(() => parseEmail(Buffer.from("not an email")));
});
test("evaluation includes both classes, separates splits and exposes misses", () => {
  const r = evaluate();
  assert.equal(examples().length, 100);
  assert.equal(r.heldOut.count, 60);
  assert.ok(r.heldOut.fn > 0);
  assert.equal(r.overall.tp + r.overall.fn, 50);
  assert.equal(r.overall.fp + r.overall.tn, 50);
});
