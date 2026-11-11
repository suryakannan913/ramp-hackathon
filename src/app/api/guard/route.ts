import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAnalysisProvider } from "@/lib/ai";
import { db } from "@/lib/db";
import {
  listCases,
  getCase,
  ingestRequest,
  completeCallback,
  decide,
  releaseHolds,
  retryHolds,
  WorkflowError,
} from "@/lib/service";
import { loadDemo, demoEmail } from "@/lib/demo";
import { MAX_EMAIL_BYTES } from "@/lib/ingest";
import { authorize, apiError } from "@/lib/http";
import { evaluate } from "@/lib/evaluation";
import { getSandboxVendorBills } from "@/lib/ramp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const user = authorize(req);
    const id = req.nextUrl.searchParams.get("id");
    if (id) return NextResponse.json(await getCase(id, user));
    if (req.nextUrl.searchParams.has("evaluation"))
      return NextResponse.json(evaluate());
    const fixture = req.nextUrl.searchParams.get("fixture");
    if (fixture) {
      if (!["attack", "legitimate", "ambiguous"].includes(fixture))
        throw new WorkflowError("Unknown fixture.");
      return new NextResponse(new Uint8Array(await demoEmail(fixture)), {
        headers: {
          "Content-Type": "message/rfc822",
          "Content-Disposition": `attachment; filename="${fixture}.eml"`,
        },
      });
    }
    return NextResponse.json({
      cases: await listCases(user),
      vendors: await db.vendor.findMany({
        select: { id: true, name: true, domain: true, phone: true },
      }),
      settings: {
        aiConfigured: !!getAnalysisProvider(),
        aiProvider: getAnalysisProvider(),
        rampConfigured: !!process.env.RAMP_ACCESS_TOKEN,
        rampEnvironment: process.env.RAMP_ENVIRONMENT ?? "sandbox",
        mode: "Local demo",
        callbackMode: "simulated",
        bankSync: false,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("demo"),
    key: z.enum(["attack", "legitimate", "ambiguous"]),
  }),
  z.object({
    action: z.literal("callback"),
    id: z.string(),
    outcome: z.enum(["confirmed", "denied", "inconclusive"]),
  }),
  z.object({
    action: z.literal("decide"),
    id: z.string(),
    decision: z.enum(["approve", "reject"]),
    note: z.string().max(2000),
  }),
  z.object({
    action: z.literal("release"),
    id: z.string(),
    note: z.string().max(2000),
  }),
  z.object({ action: z.literal("retry"), id: z.string() }),
  z.object({
    action: z.literal("sandbox-preview"),
    vendorId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("sandbox-import"),
    localVendorId: z.string(),
    rampVendorId: z.string().uuid(),
  }),
]);
export async function POST(req: NextRequest) {
  try {
    const user = authorize(req);
    if (
      Number(req.headers.get("content-length") ?? 0) >
      MAX_EMAIL_BYTES + 1_000_000
    )
      throw new WorkflowError("Upload too large.", 413);
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const vendorId = z.string().parse(form.get("vendorId"));
      if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".eml"))
        throw new WorkflowError("Choose an .eml file.");
      if (file.size > MAX_EMAIL_BYTES)
        throw new WorkflowError("Email exceeds 12 MB.", 413);
      return NextResponse.json(
        await ingestRequest(Buffer.from(await file.arrayBuffer()), vendorId),
      );
    }
    const data = actionSchema.parse(await req.json());
    if (data.action === "demo")
      return NextResponse.json(await loadDemo(data.key));
    if (data.action === "callback")
      await completeCallback(data.id, data.outcome);
    if (data.action === "decide")
      await decide(data.id, data.decision, data.note, user);
    if (data.action === "release") await releaseHolds(data.id, data.note, user);
    if (data.action === "retry") await retryHolds(data.id);
    if (data.action === "sandbox-preview")
      return NextResponse.json(await getSandboxVendorBills(data.vendorId));
    if (data.action === "sandbox-import") {
      // Never overwrite trusted local contacts with unverified email or Ramp contact data.
      const vendor = await db.vendor.findUniqueOrThrow({
        where: { id: data.localVendorId },
      });
      if (await db.changeRequest.count({ where: { vendorId: vendor.id } }))
        throw new WorkflowError(
          "Import bills before investigating this vendor. Create a separate trusted vendor baseline using the setup script.",
          409,
        );
      const { bills, next } = await getSandboxVendorBills(data.rampVendorId);
      if (next)
        throw new WorkflowError(
          "More than 100 sandbox bills were returned. Import was stopped to avoid partial protection. Paginated production sync is outside this MVP.",
        );
      let imported = 0;
      for (const b of bills)
        if (
          b.status === "OPEN" &&
          b.amount.currency_code === "USD" &&
          !["PAYMENT_PROCESSING", "PAYMENT_COMPLETED", "ARCHIVED"].includes(
            b.status_summary,
          )
        ) {
          await db.bill.upsert({
            where: { id: b.id },
            create: {
              id: b.id,
              vendorId: vendor.id,
              invoice: b.invoice_number ?? b.id,
              amountCents: b.amount.amount,
              dueDate: new Date(b.due_at),
              source: "ramp-sandbox",
            },
            update: {},
          });
          imported++;
        }
      return NextResponse.json({
        imported,
        message:
          "Sandbox bills imported. Existing local contacts were preserved.",
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
