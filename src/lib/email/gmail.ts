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
        nextCursor: res.data.nextPageToken ?? "",
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
    mailboxIdentity: string,
  ): EmailProvenance {
    const rawBytesHash = createHash("sha256").update(raw).digest("hex");
    // Raw MIME can contain sender-supplied authentication headers. Receiver
    // provenance must be established separately before those results are trusted.

    return {
      mailboxIdentity,
      providerMessageId: msgId,
      providerThreadId: threadId,
      retrievedAt: new Date().toISOString(),
      authStatus: {
        dkim: "unknown",
        spf: "unknown",
        dmarc: "unknown",
        aligned: false,
        trustedReceiver: false,
      },
      rawBytesHash,
    };
  }
}
