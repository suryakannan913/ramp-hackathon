import { Prisma } from "@prisma/client";
import { db } from "./db";
import { parseEmail } from "./ingest";
import { assess, validRouting, THRESHOLDS } from "./risk";
import { analyzeWithAI, getAnalysisProvider } from "./ai";
import { setRampHold } from "./ramp";
import type {
  Assessment,
  CaseDetail,
  CaseSummary,
  ProposedBank,
  Risk,
  User,
} from "./types";
import { EmailProvenance } from "./analysis/contracts";

export class WorkflowError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const includeCase = {
  vendor: { include: { bills: true } },
  attachments: {
    select: { id: true, name: true, mimeType: true, metadata: true },
  },
  holds: true,
  callback: true,
  decisions: { orderBy: { createdAt: "desc" as const } },
  events: { orderBy: { createdAt: "asc" as const } },
  assessmentHistory: { orderBy: { createdAt: "desc" as const } },
};

function authorize(user: User, action: "read" | "write" | "admin" | "release") {
  if (action === "read") return true;
  if (action === "write")
    return user.role === "reviewer" || user.role === "admin";
  if (action === "release")
    return user.role === "reviewer" || user.role === "admin";
  if (action === "admin") return user.role === "admin";
  return false;
}

export async function listCases(user: User): Promise<CaseSummary[]> {
  const rows = (await db.changeRequest.findMany({
    where: { orgId: user.orgId } as any,
    include: { vendor: { include: { bills: true } }, holds: true },
    orderBy: { createdAt: "desc" },
  })) as any[];
  return rows.map((r) => ({
    id: r.id,
    vendorId: r.vendorId,
    vendorName: r.vendor.name,
    subject: r.subject,
    sender: r.sender,
    risk: r.risk as Risk,
    score: r.score,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    amountCents: r.vendor.bills
      .filter((b: any) => b.status !== "paid")
      .reduce((s: number, b: any) => s + b.amountCents, 0),
    holdCount: r.holds.filter((h: any) => h.status === "confirmed").length,
  }));
}
export async function getCase(id: string, user: User): Promise<CaseDetail> {
  const r = (await db.changeRequest.findFirst({
    where: { id, orgId: user.orgId } as any,
    include: includeCase,
  })) as any;
  if (!r) throw new WorkflowError("Request not found.", 404);
  return {
    id: r.id,
    vendorId: r.vendorId,
    vendorName: r.vendor.name,
    subject: r.subject,
    sender: r.sender,
    replyTo: r.replyTo,
    body: r.body,
    headers: r.headers,
    risk: r.risk as Risk,
    score: r.score,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    amountCents: r.vendor.bills
      .filter((b: any) => b.status !== "paid")
      .reduce((s: number, b: any) => s + b.amountCents, 0),
    holdCount: r.holds.filter((h: any) => h.status === "confirmed").length,
    proposed: JSON.parse(r.proposed) as ProposedBank,
    assessment: {
      ...JSON.parse(r.assessment),
      provenance: r.provenance ? JSON.parse(r.provenance) : undefined,
    } as Assessment,
    vendor: r.vendor,
    attachments: r.attachments,
    bills: r.vendor.bills
      .filter((b: any) => b.status !== "paid")
      .map((b: any) => ({ ...b, dueDate: b.dueDate.toISOString() })),
    holds: r.holds,
    callback: r.callback
      ? { ...r.callback, createdAt: r.callback.createdAt.toISOString() }
      : null,
    decisions: r.decisions.map((d: any) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
    })),
    events: r.events.map((e: any) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}
export async function ingestRequest(
  raw: Buffer,
  vendorId: string,
  options: { fixture?: boolean; skipAI?: boolean } = {},
) {
  let parsed;
  try {
    parsed = await parseEmail(raw);
  } catch (error) {
    throw new WorkflowError(
      error instanceof Error ? error.message : "Email could not be parsed.",
    );
  }
  const existing = await db.changeRequest.findUnique({
    where: { fingerprint: parsed.fingerprint },
  });
  if (existing) {
    if (existing.vendorId !== vendorId)
      throw new WorkflowError(
        "This email is already linked to a different vendor.",
        409,
      );
    return { id: existing.id, duplicate: true };
  }
  const vendor = await db.vendor.findUnique({
    where: { id: vendorId },
    include: { bills: true },
  });
  if (!vendor) throw new WorkflowError("Select a known vendor.", 404);
  const pending = vendor.bills.filter((b) => b.status !== "paid");
  const dueWithinDays = pending.length
    ? Math.min(
        ...pending.map((b) =>
          Math.ceil((b.dueDate.getTime() - Date.now()) / 86400000),
        ),
      )
    : undefined;

  const stages: Record<string, any> = {
    ingest: "complete",
    parsing: "complete",
    auth: options.fixture ? "complete" : "partial",
  };

  const provenance: EmailProvenance | undefined = options.fixture
    ? {
        mailboxIdentity: "sarah@northstar-supply.com",
        providerMessageId: "fixture-id",
        providerThreadId: "fixture-thread",
        retrievedAt: new Date().toISOString(),
        authStatus: {
          dkim: "unknown",
          spf: "unknown",
          dmarc: "unknown",
          aligned: false,
          trustedReceiver: false,
        },
        rawBytesHash: parsed.fingerprint,
      }
    : undefined;

  const input = {
    ...parsed,
    hasDocument: parsed.attachments.some(
      (a) => a.mimeType === "application/pdf",
    ),
    authTrusted: !!options.fixture,
    dueWithinDays,
    provenance,
  };
  stages.extraction = "complete";

  const ai = options.skipAI
    ? {
        evidence: [],
        live: false,
        status: "Seeded fixture — AI not run",
        proposed: undefined,
        similarity: undefined,
      }
    : await analyzeWithAI(input, vendor, parsed.attachments);

  stages.model = options.skipAI
    ? "skipped"
    : ai.live
      ? "complete"
      : getAnalysisProvider()
        ? "failed"
        : "not_configured";

  // Extracted text fields take precedence; AI fills only missing fields from the bank letter.
  const proposed = { ...parsed.proposed };

  // A3.2: Detect conflicts between email and PDF extraction
  const conflicts: string[] = [];
  for (const att of parsed.attachments) {
    if (att.mimeType === "application/pdf") {
      const pdfProposed = JSON.parse(att.metadata).proposed as ProposedBank;
      if (pdfProposed) {
        for (const key of [
          "bankName",
          "accountLast4",
          "routing",
          "country",
        ] as const) {
          if (
            proposed[key] &&
            pdfProposed[key] &&
            proposed[key] !== pdfProposed[key]
          ) {
            if (!conflicts.includes(key)) conflicts.push(key);
          }
          // If body missing field, use PDF field
          if (!proposed[key] && pdfProposed[key])
            proposed[key] = pdfProposed[key];
        }
      }
    }
  }

  for (const key of ["bankName", "accountLast4", "routing", "country"] as const)
    if (!proposed[key] && ai.proposed?.[key]) proposed[key] = ai.proposed[key];

  const assessment = assess({ ...input, proposed }, vendor, ai.evidence);
  stages.scoring = "complete";

  assessment.analysisMode = ai.live ? "live-ai" : "rules";
  assessment.aiStatus = ai.status;
  assessment.similarity = ai.similarity;
  assessment.stages = stages;
  assessment.conflicts = conflicts;

  if (conflicts.length > 0) {
    assessment.evidence.push({
      id: "extraction-conflict",
      category: "Bank details",
      title: "Conflicting evidence detected",
      detail: `The email body and attachments disagree on: ${conflicts.join(", ")}. This requires manual reconciliation.`,
      source: "Multi-source extraction",
      points: 20,
      confidence: "observed",
    });
    assessment.score = Math.min(100, assessment.score + 20);
    if (assessment.score >= THRESHOLDS.high) assessment.risk = "high";
    else if (assessment.score >= THRESHOLDS.medium) assessment.risk = "medium";
    assessment.summary =
      "Email and attachment bank details conflict. Resolve the discrepancies before approval.";
  }

  if (!ai.live) assessment.missing.push("AI vision / stylometry not completed");
  if (options.fixture)
    assessment.aiStatus +=
      " · supplied authentication accepted only for synthetic fixture";
  let request;
  try {
    request = await db.changeRequest.create({
      data: {
        vendorId,
        fingerprint: parsed.fingerprint,
        subject: parsed.subject,
        sender: parsed.sender,
        replyTo: parsed.replyTo,
        body: parsed.body,
        headers: parsed.headers,
        rawEmail: new Uint8Array(raw),
        proposed: JSON.stringify(proposed),
        assessment: JSON.stringify(assessment),
        risk: assessment.risk,
        score: assessment.score,
        provenance: (provenance ? JSON.stringify(provenance) : null) as any,
        attachments: {
          create: parsed.attachments.map(({ id: _analysisId, ...a }) => ({
            ...a,
            content: new Uint8Array(a.content),
          })),
        },
        events: {
          create: [
            {
              type: "received",
              actor: options.fixture ? "Demo seed" : "Local AP reviewer",
              detail: options.fixture
                ? "Synthetic demo email received."
                : "Original .eml preserved; authentication headers are supplied, not independently verified.",
            },
            {
              type: "assessed",
              actor: "Risk policy",
              detail: `Policy ${assessment.policyVersion}: ${assessment.risk} risk, ${assessment.score} points. ${assessment.aiStatus}`,
            },
          ],
        },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const duplicate = await db.changeRequest.findUnique({
        where: { fingerprint: parsed.fingerprint },
      });
      if (!duplicate) throw error;
      if (duplicate.vendorId !== vendorId)
        throw new WorkflowError(
          "This email is already linked to a different vendor.",
          409,
        );
      return { id: duplicate.id, duplicate: true };
    }
    throw error;
  }
  if (assessment.risk === "high") {
    await ensureHolds(request.id);
    await requestCallback(request.id);
  }
  return { id: request.id, duplicate: false };
}
export async function ensureHolds(id: string) {
  const r = await db.changeRequest.findUniqueOrThrow({
    where: { id },
    include: { vendor: { include: { bills: true } } },
  });
  for (const bill of r.vendor.bills.filter((b) => b.status !== "paid")) {
    const mode = bill.source === "ramp-sandbox" ? "ramp-sandbox" : "simulated";
    await db.paymentHold.upsert({
      where: { requestId_billId: { requestId: id, billId: bill.id } },
      create: {
        requestId: id,
        billId: bill.id,
        status: "queued",
        mode,
        detail: "Hold requested by risk policy.",
      },
      update: {},
    });
  }
  await retryHolds(id);
}
export async function retryHolds(id: string) {
  const holds = await db.paymentHold.findMany({
    where: { requestId: id, status: { in: ["queued", "failed"] } },
  });
  for (const hold of holds) {
    const claimed = await db.paymentHold.updateMany({
      where: { id: hold.id, status: { in: ["queued", "failed"] } },
      data: {
        status: "pending",
        detail: "Awaiting payment adapter confirmation.",
      },
    });
    if (!claimed.count) continue;
    try {
      if (hold.mode === "ramp-sandbox") await setRampHold(hold.billId);
      await db.$transaction([
        db.paymentHold.update({
          where: { id: hold.id },
          data: {
            status: "confirmed",
            detail:
              hold.mode === "simulated"
                ? "Simulated hold confirmed locally. No Ramp payment was changed."
                : "Ramp sandbox confirmed ON_HOLD.",
          },
        }),
        db.auditEvent.create({
          data: {
            requestId: id,
            type: "hold_confirmed",
            actor: "Payment adapter",
            detail: `${hold.billId}: ${hold.mode === "simulated" ? "simulated local hold" : "Ramp sandbox hold"} confirmed.`,
          },
        }),
      ]);
    } catch (error) {
      await db.$transaction([
        db.paymentHold.update({
          where: { id: hold.id },
          data: {
            status: "failed",
            detail:
              error instanceof Error
                ? error.message
                : "Payment adapter failed.",
          },
        }),
        db.auditEvent.create({
          data: {
            requestId: id,
            type: "hold_failed",
            actor: "Payment adapter",
            detail: `${hold.billId}: hold not confirmed; reconcile payment status before retrying.`,
          },
        }),
      ]);
    }
  }
}
export async function requestCallback(id: string) {
  const r = await db.changeRequest.findUniqueOrThrow({
    where: { id },
    include: { vendor: true },
  });
  if (!r.vendor.phone)
    throw new WorkflowError(
      "No trusted phone is on file. Add one through a verified vendor onboarding process.",
    );
  await db.$transaction(async (tx) => {
    const found = await tx.callback.findUnique({ where: { requestId: id } });
    if (found) return;
    await tx.callback.create({
      data: {
        requestId: id,
        phone: r.vendor.phone,
        outcome: "pending",
        transcript: "Simulation queued. No external call has been placed.",
      },
    });
    await tx.auditEvent.create({
      data: {
        requestId: id,
        type: "callback_requested",
        actor: "Verification workflow",
        detail: `Simulated callback queued to trusted vendor contact ${r.vendor.phone}. No contact from the request was used.`,
      },
    });
  });
}
export async function completeCallback(
  id: string,
  outcome: "confirmed" | "denied" | "inconclusive",
) {
  await requestCallback(id);
  return db.$transaction(async (tx) => {
    const r = await tx.changeRequest.findUniqueOrThrow({
      where: { id },
      include: { vendor: true, callback: true },
    });
    if (r.status !== "pending")
      throw new WorkflowError(
        "This request already has a final decision.",
        409,
      );
    if (r.callback?.outcome !== "pending")
      throw new WorkflowError("Callback result is already recorded.", 409);
    const reply =
      outcome === "confirmed"
        ? "Yes, we requested this bank change. Please complete your normal approval process."
        : outcome === "denied"
          ? "No, we did not request this change. Those are not our banking details. Please keep our existing account on file."
          : "I cannot verify the bank change. Our finance contact is unavailable.";
    const transcript = `SIMULATED CALLBACK — no external call placed\n\nGuard: Calling ${r.vendor.phone}, the existing contact for ${r.vendor.name}. Did your company request the proposed bank change ending ${JSON.parse(r.proposed).accountLast4 || "unknown"}?\n\nVendor: ${reply}\n\nGuard: Thank you. A human AP reviewer will record the final decision.`;
    await tx.callback.update({
      where: { requestId: id },
      data: { outcome, transcript },
    });
    await tx.auditEvent.create({
      data: {
        requestId: id,
        type: "callback_completed",
        actor: "Callback simulator",
        detail: `Simulated outcome: ${outcome}. Trusted number: ${r.vendor.phone}. This is not real-world verification.`,
      },
    });
  });
}
export async function decide(
  id: string,
  action: "approve" | "reject",
  note: string,
  user: User,
) {
  if (!authorize(user, "write"))
    throw new WorkflowError("Only reviewers can record decisions.", 403);
  if (note.trim().length < 8)
    throw new WorkflowError("Add a decision note of at least 8 characters.");
  return db.$transaction(async (tx) => {
    const r = (await tx.changeRequest.findFirstOrThrow({
      where: { id, orgId: user.orgId } as any,
      include: { callback: true, holds: true },
    })) as any;
    if (r.status !== "pending")
      throw new WorkflowError(
        "This request already has a final decision.",
        409,
      );
    if (action === "approve") {
      const assessment = JSON.parse(r.assessment) as Assessment;
      if (assessment.conflicts?.length)
        throw new WorkflowError(
          "Resolve conflicting bank details before approval.",
        );
      if (
        r.holds.some(
          (hold: { mode: string }) => hold.mode === "ramp-sandbox",
        ) &&
        r.callback?.mode !== "live"
      )
        throw new WorkflowError(
          "A sandbox hold requires live callback verification before approval.",
        );
      if (r.risk !== "low" && r.callback?.outcome !== "confirmed")
        throw new WorkflowError(
          "Medium and high risk requests require a confirmed callback before approval.",
        );
      if (r.callback && ["denied", "inconclusive"].includes(r.callback.outcome))
        throw new WorkflowError("Callback did not confirm this change.");
      if (
        r.holds.some((h: any) => !["confirmed", "released"].includes(h.status))
      )
        throw new WorkflowError(
          "Resolve unconfirmed payment holds before approval.",
        );
      const p = JSON.parse(r.proposed) as ProposedBank;
      if (p.country === "US" && !validRouting(p.routing))
        throw new WorkflowError(
          "A valid US routing number is required before approval.",
        );
      if (
        !p.bankName ||
        !p.accountLast4 ||
        !p.country ||
        (p.country === "US" && !p.routing)
      )
        throw new WorkflowError(
          "Bank details are incomplete. Reject and request complete documentation.",
        );
    }
    const updated = await tx.changeRequest.updateMany({
      where: { id, status: "pending", orgId: user.orgId } as any,
      data: { status: action === "approve" ? "approved" : "rejected" },
    });
    if (!updated.count)
      throw new WorkflowError(
        "Another reviewer already decided this request.",
        409,
      );
    await tx.decision.create({
      data: {
        requestId: id,
        action,
        actor: user.name,
        note: note.trim(),
      },
    });
    await tx.auditEvent.create({
      data: {
        requestId: id,
        type: `request_${action === "approve" ? "approved" : "rejected"}`,
        actor: user.name,
        detail: `${note.trim()} Bank details were not written to Ramp. Existing holds remain until explicitly released.`,
      },
    });
  });
}
export async function releaseHolds(id: string, note: string, user: User) {
  if (!authorize(user, "release"))
    throw new WorkflowError("Only reviewers can release holds.", 403);
  if (note.trim().length < 8)
    throw new WorkflowError("Add a release note of at least 8 characters.");
  const r = (await db.changeRequest.findFirstOrThrow({
    where: { id, orgId: user.orgId } as any,
    include: { holds: true },
  })) as any;
  if (r.status === "pending")
    throw new WorkflowError("Record a final decision before releasing a hold.");
  for (const h of r.holds.filter((h: any) => h.status === "confirmed")) {
    // A Ramp bill hold is shared across requests. Never clear another investigation's protection.
    const other = await db.paymentHold.count({
      where: {
        billId: h.billId,
        requestId: { not: id },
        status: { not: "released" },
      },
    });
    if (other && h.mode === "ramp-sandbox")
      throw new WorkflowError(
        "Another investigation still protects this bill. Resolve it first.",
      );
    if (h.mode === "ramp-sandbox") await setRampHold(h.billId, true);
    await db.$transaction([
      db.paymentHold.update({
        where: { id: h.id },
        data: {
          status: "released",
          detail: `Explicitly released by ${user.name}. ${note.trim()}`,
        },
      }),
      db.auditEvent.create({
        data: {
          requestId: id,
          type: "hold_released",
          actor: user.name,
          detail: `${h.billId} (${h.mode}): ${note.trim()}`,
        },
      }),
    ]);
  }
}
