import { simpleParser } from "mailparser";
import { PDFDocument } from "pdf-lib";
import { PDFParse } from "pdf-parse";
import { createHash } from "node:crypto";
import type { Evidence, ProposedBank } from "./types";
export const MAX_EMAIL_BYTES = 12 * 1024 * 1024;
export type ParsedAttachment = {
  id: string;
  name: string;
  mimeType: string;
  content: Buffer;
  metadata: string;
};
export async function parseEmail(raw: Buffer) {
  if (raw.length > MAX_EMAIL_BYTES)
    throw new Error("Email exceeds the 12 MB limit.");
  const parsed = await simpleParser(raw, {
    skipHtmlToText: false,
    skipTextToHtml: true,
    maxHtmlLengthToParse: 500_000,
  });
  const sender = parsed.from?.value[0]?.address ?? "";
  if (!sender || !parsed.subject)
    throw new Error("Email must include a valid From address and Subject.");
  const replyTo = parsed.replyTo?.value[0]?.address ?? sender;
  const headers = parsed.headerLines.map((h) => h.line).join("\n");
  const body = (parsed.text ?? "").slice(0, 100_000);
  const attachments: ParsedAttachment[] = [];
  const documentFindings: Evidence[] = [];
  for (const file of parsed.attachments) {
    if (attachments.length >= 5)
      throw new Error("Maximum five attachments per request.");
    const pdf = file.content.subarray(0, 5).toString() === "%PDF-";
    const mimeType = pdf ? "application/pdf" : file.contentType;
    const sha256 = createHash("sha256").update(file.content).digest("hex");
    const id = `att-${attachments.length + 1}-${sha256.slice(0, 12)}`;

    let metadata: Record<string, unknown> = {
      bytes: file.size,
      sha256,
    };
    if (pdf) {
      try {
        const doc = await PDFDocument.load(file.content, {
          updateMetadata: false,
        });
        if (doc.getPageCount() > 10)
          throw new Error("Bank letters must be 10 pages or fewer.");

        // A3.1: Extract PDF text locally
        const parser = new PDFParse({ data: file.content });
        const pdfData = await parser.getText().finally(() => parser.destroy());

        metadata = {
          ...metadata,
          pages: doc.getPageCount(),
          producer: doc.getProducer() ?? null,
          creator: doc.getCreator() ?? null,
          created: doc.getCreationDate()?.toISOString() ?? null,
          modified: doc.getModificationDate()?.toISOString() ?? null,
          text: pdfData.text,
          proposed: extractBank(pdfData.text),
        };
        documentFindings.push({
          id: `pdf-${attachments.length}`,
          category: "Document",
          title: "PDF metadata preserved",
          detail: `${doc.getPageCount()} page(s). Producer: ${doc.getProducer() ?? "not supplied"}. Metadata can be edited and does not prove authenticity.`,
          source: file.filename ?? "PDF attachment",
          points: 0,
          confidence: "observed",
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("10 pages"))
          throw error;
        metadata = { ...metadata, parseError: true };
        documentFindings.push({
          id: `pdf-error-${attachments.length}`,
          category: "Document",
          title: "PDF could not be inspected",
          detail:
            "The attachment may be encrypted or malformed. Manual document review is required.",
          source: file.filename ?? "PDF attachment",
          points: 25,
          confidence: "unknown",
        });
      }
    }
    attachments.push({
      id,
      name: (file.filename ?? `attachment-${attachments.length + 1}`).replace(
        /[^a-zA-Z0-9._ -]/g,
        "_",
      ),
      mimeType,
      content: file.content,
      metadata: JSON.stringify(metadata),
    });
  }
  const bodyProposed = extractBank(body);

  return {
    sender,
    replyTo,
    subject: parsed.subject,
    body,
    headers,
    proposed: bodyProposed,
    attachments,
    documentFindings,
    fingerprint: createHash("sha256").update(raw).digest("hex"),
  };
}
export function extractBank(text: string): ProposedBank {
  return {
    bankName:
      text.match(/(?:^|\n)\s*Bank(?: name)?:\s*([^\r\n]+)/i)?.[1]?.trim() ?? "",
    accountLast4:
      text.match(
        /(?:account (?:ending|last ?4)|last four):?\s*(?:[*x• -]*)(\d{4})\b/i,
      )?.[1] ?? "",
    routing:
      text
        .match(/routing(?: number)?:\s*([\d -]+)/i)?.[1]
        ?.replace(/\D/g, "") ?? "",
    country:
      text.match(/(?:^|\n)\s*Country:\s*([A-Z]{2})\b/i)?.[1]?.toUpperCase() ??
      "",
  };
}
