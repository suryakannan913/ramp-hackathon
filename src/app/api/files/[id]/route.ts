import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorize, apiError } from "@/lib/http";
import { WorkflowError } from "@/lib/service";
export const runtime = "nodejs";
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    authorize(req);
    const { id } = await ctx.params;
    if (req.nextUrl.searchParams.has("email")) {
      const r = await db.changeRequest.findUnique({
        where: { id },
        select: { rawEmail: true },
      });
      if (!r) throw new WorkflowError("Email not found.", 404);
      return new NextResponse(new Uint8Array(r.rawEmail), {
        headers: {
          "Content-Type": "message/rfc822",
          "Content-Disposition": 'attachment; filename="original.eml"',
          "Cache-Control": "no-store",
        },
      });
    }
    const a = await db.attachment.findUnique({ where: { id } });
    if (!a) throw new WorkflowError("Attachment not found.", 404);
    return new NextResponse(new Uint8Array(a.content), {
      headers: {
        "Content-Type":
          a.mimeType === "application/pdf"
            ? "application/pdf"
            : "application/octet-stream",
        "Content-Disposition": `attachment; filename="${a.name.replace(/["\\]/g, "_")}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
