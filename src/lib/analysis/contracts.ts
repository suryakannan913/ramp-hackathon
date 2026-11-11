import { z } from "zod";
import type { Evidence, ProposedBank, VendorContext } from "../types";

/**
 * Stage status for tracking progress and failures across the pipeline.
 * Missing or failed work must never look like a clean finding.
 */
export const AnalysisStageStatusSchema = z.enum([
  "not_configured",
  "skipped",
  "pending",
  "complete",
  "partial",
  "timeout",
  "refused",
  "invalid_result",
  "failed",
]);

export type AnalysisStageStatus = z.infer<typeof AnalysisStageStatusSchema>;

/**
 * Provenance information for email ingestion to establish trust.
 */
export const EmailProvenanceSchema = z.object({
  mailboxIdentity: z.string(),
  providerMessageId: z.string(),
  providerThreadId: z.string(),
  retrievedAt: z.string().datetime(),
  authStatus: z.object({
    dkim: z.enum(["pass", "fail", "none", "unknown"]),
    spf: z.enum(["pass", "fail", "none", "unknown"]),
    dmarc: z.enum(["pass", "fail", "none", "unknown"]),
    aligned: z.boolean(),
    trustedReceiver: z.boolean(),
  }),
  rawBytesHash: z.string(),
});

export type EmailProvenance = z.infer<typeof EmailProvenanceSchema>;

/**
 * Result of extraction from a specific source (body or attachment).
 */
export const ExtractionResultSchema = z.object({
  value: z.string(),
  sourceId: z.string(), // "email-body" or stable attachment ID
  confidence: z.number().min(0).max(1),
  quote: z.string().optional(),
  page: z.number().optional(),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

/**
 * The core analysis result contract for the investigation.
 */
export const InvestigationAnalysisSchema = z.object({
  version: z.string(), // Versioned policy/model config
  stages: z.object({
    ingest: AnalysisStageStatusSchema,
    parsing: AnalysisStageStatusSchema,
    auth: AnalysisStageStatusSchema,
    extraction: AnalysisStageStatusSchema,
    model: AnalysisStageStatusSchema,
    scoring: AnalysisStageStatusSchema,
  }),
  provenance: EmailProvenanceSchema.optional(),
  proposedBank: z.object({
    fields: z.object({
      bankName: z.array(ExtractionResultSchema),
      accountLast4: z.array(ExtractionResultSchema),
      routing: z.array(ExtractionResultSchema),
      country: z.array(ExtractionResultSchema),
    }),
    conflicts: z.array(z.string()), // List of field names with conflicting evidence
  }),
  findings: z.any(), // Array of Evidence, but kept generic here to avoid circularity if needed
  rawModelOutput: z.string().optional(),
  tokenUsage: z.object({
    prompt: number(),
    completion: number(),
    total: number(),
  }).optional(),
  latencyMs: z.number().optional(),
});

// Helper for Zod number since it's used above
function number() { return z.number(); }

export type InvestigationAnalysis = z.infer<typeof InvestigationAnalysisSchema>;

/**
 * Interface for mailbox clients (e.g., Gmail adapter).
 */
export interface MailboxClient {
  sync(cursor?: string): Promise<{
    envelopes: {
      id: string;
      threadId: string;
      raw: Buffer;
      metadata: any;
    }[];
    nextCursor: string;
  }>;
}

/**
 * Interface for analysis providers (e.g., AI + Rules engine).
 */
export interface AnalysisProvider {
  analyze(
    input: {
      body: string;
      subject: string;
      sender: string;
      headers: string;
      vendor: VendorContext;
      attachments: { id: string; name: string; content: Buffer; metadata: any }[];
    }
  ): Promise<InvestigationAnalysis>;
}
