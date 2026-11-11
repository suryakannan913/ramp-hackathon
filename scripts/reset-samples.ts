import "dotenv/config";
import { db } from "../src/lib/db";
import { loadSampleCase } from "../src/lib/sample-cases";
import { vendors } from "../src/lib/fixtures";
async function main() {
  // Select cases created by the seed workflow, including earlier versions.
  const requests = await db.changeRequest.findMany({
    where: {
      vendorId: { in: vendors.map((v) => v.id) },
      events: { some: { type: "received", actor: "Sample seed" } },
    },
    include: { holds: true },
  });
  if (requests.some((r) => r.holds.some((h) => h.mode !== "simulated")))
    throw new Error(
      "Reset refused: a synthetic case has a non-simulated hold.",
    );
  const requestId = { in: requests.map((r) => r.id) };
  await db.$transaction([
    db.auditEvent.deleteMany({ where: { requestId } }),
    db.decision.deleteMany({ where: { requestId } }),
    db.callback.deleteMany({ where: { requestId } }),
    db.paymentHold.deleteMany({ where: { requestId } }),
    db.assessmentVersion.deleteMany({ where: { requestId } }),
    db.attachment.deleteMany({ where: { requestId } }),
    db.changeRequest.deleteMany({ where: { id: requestId } }),
  ]);
  for (const key of ["attack", "legitimate", "ambiguous"])
    await loadSampleCase(key);
  console.log(
    "Restored three synthetic sample cases. Other uploads and sandbox investigations were preserved.",
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
