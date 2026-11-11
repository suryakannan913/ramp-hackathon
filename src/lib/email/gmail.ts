import { google, gmail_v1 } from "googleapis";
import { MailboxClient, EmailProvenance } from "../analysis/contracts";
import { createHash } from "node:crypto";

/**
 * Gmail API adapter for mailbox intake.
 */
export class GmailClient implements MailboxClient {
  private gmail: gmail_v1.Gmail;
  private mailboxIdentity: string;

  constructor(auth: any, mailboxIdentity: string) {
    this.gmail = google.gmail({ version: "v1", auth });
    this.mailboxIdentity = mailboxIdentity;
  }

  /**
   * Sync messages from the mailbox starting from a cursor.
   */
  async sync(cursor?: string): Promise<{
    envelopes: {
      id: string;
      threadId: string;
      raw: Buffer;
      metadata: any;
    }[];
    nextCursor: string;
  }> {
    try {
      const res = await this.gmail.users.messages.list({
        userId: "me",
        // Only sync INBOX and potential bank-change candidates
        q: "label:INBOX", 
        pageToken: cursor,
        maxResults: 20, // Bounded pagination
      });

      const messages = res.data.messages || [];
      const envelopes = [];

      for (const msg of messages) {
        if (!msg.id) continue;
        
        // Fetch raw MIME bytes for provenance and parsing
        const fullMsg = await this.gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "raw",
        });

        if (!fullMsg.data.raw) continue;

        const raw = Buffer.from(fullMsg.data.raw, "base64url");
        envelopes.push({
          id: msg.id,
          threadId: msg.threadId || "",
          raw,
          metadata: {
            historyId: fullMsg.data.historyId,
            internalDate: fullMsg.data.internalDate,
            sizeEstimate: fullMsg.data.sizeEstimate,
            labelIds: fullMsg.data.labelIds,
          },
        });
      }

      return {
        envelopes,
        nextCursor: res.data.nextPageToken || cursor || "",
      };
    } catch (error: any) {
      // Handle expired checkpoints or revoked access
      if (error.code === 401 || error.code === 403) {
        throw new Error("Mailbox access revoked or expired.");
      }
      if (error.code === 404) {
        throw new Error("Mailbox cursor expired; full resync required.");
      }
      throw error;
    }
  }

  /**
   * Extract provenance and authentication results from email headers.
   */
  static extractProvenance(
    raw: Buffer, 
    msgId: string, 
    threadId: string, 
    mailboxIdentity: string
  ): EmailProvenance {
    const headers = raw.toString("utf8").split("\r\n\r\n")[0];
    const rawBytesHash = createHash("sha256").update(raw).digest("hex");

    // A2.6: Parse structured authentication results
    // We look for Authentication-Results headers added by the trusted receiver.
    const authResults = headers.match(/Authentication-Results:([^\r\n]*)/gi) || [];
    
    let dkim: any = "unknown";
    let spf: any = "unknown";
    let dmarc: any = "unknown";
    let aligned = false;

    for (const res of authResults) {
      if (res.includes("dkim=")) dkim = res.includes("dkim=pass") ? "pass" : "fail";
      if (res.includes("spf=")) spf = res.includes("spf=pass") ? "pass" : "fail";
      if (res.includes("dmarc=")) dmarc = res.includes("dmarc=pass") ? "pass" : "fail";
      if (res.includes("header.i=") || res.includes("policy.alignment=pass")) {
        aligned = true; // Simplistic alignment check
      }
    }

    return {
      mailboxIdentity,
      providerMessageId: msgId,
      providerThreadId: threadId,
      retrievedAt: new Date().toISOString(),
      authStatus: {
        dkim,
        spf,
        dmarc,
        aligned,
        trustedReceiver: true, // This adapter assumes the API connection itself is the trust boundary
      },
      rawBytesHash,
    };
  }
}
