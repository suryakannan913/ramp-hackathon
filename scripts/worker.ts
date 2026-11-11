import { runWorker, registerJobHandler } from "../src/lib/jobs";
import { analyzeWithAI } from "../src/lib/ai";
import { db } from "../src/lib/db";
import { assess } from "../src/lib/risk";

// A dummy worker to demonstrate background processing
async function main() {
  console.log("Starting background worker...");

  registerJobHandler("analysis", async (payload) => {
    const { requestId, vendorId } = payload;
    
    const request = await db.changeRequest.findUnique({
      where: { id: requestId },
      include: { vendor: true, attachments: true }
    }) as any;

    if (!request) throw new Error("Request not found");

    const input = {
      sender: request.sender,
      replyTo: request.replyTo,
      subject: request.subject,
      body: request.body,
      headers: request.headers,
      proposed: JSON.parse(request.proposed),
      hasDocument: request.attachments.some((a: any) => a.mimeType === "application/pdf"),
      authTrusted: false, // Background jobs for uploaded mail are untrusted by default
    };

    const ai = await analyzeWithAI(input, request.vendor, request.attachments);
    
    // Update assessment with AI findings
    const assessment = assess(input, request.vendor, ai.evidence);
    assessment.analysisMode = "live-ai";
    assessment.aiStatus = ai.status;

    await db.changeRequest.update({
      where: { id: requestId },
      data: {
        assessment: JSON.stringify(assessment),
        risk: assessment.risk,
        score: assessment.score,
      }
    });

    return { status: "complete", score: assessment.score };
  });

  await runWorker();
}

main().catch(console.error);
