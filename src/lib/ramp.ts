import { z } from "zod";

/**
 * Ramp bill schema based on API documentation.
 */
export const rampBill = z
  .object({
    id: z.string(),
    status: z.string(),
    status_summary: z.string(),
    amount: z.object({ amount: z.number().int(), currency_code: z.string() }),
    invoice_number: z.string().optional(),
    due_at: z.string(),
    vendor: z.unknown(),
  })
  .passthrough();

export type RampBill = z.infer<typeof rampBill>;

/**
 * Interface for Ramp client to allow injection in tests.
 */
export interface RampClient {
  fetch(path: string, method?: string, body?: unknown): Promise<any>;
  setHold(billId: string, release?: boolean): Promise<RampBill>;
  getVendorBills(
    vendorId: string,
    pageToken?: string,
  ): Promise<{ bills: RampBill[]; next?: string }>;
}

/**
 * Default Ramp sandbox client implementation.
 */
export class RampSandboxClient implements RampClient {
  private token: string;
  private baseUrl = "https://demo-api.ramp.com/developer/v1";

  constructor(token: string) {
    if (!token.trim()) throw new Error("Ramp sandbox token is not configured.");
    if (process.env.RAMP_ENVIRONMENT !== "sandbox") {
      throw new Error("Only Ramp sandbox connections are enabled.");
    }
    this.token = token.trim();
  }

  async fetch(path: string, method = "GET", body?: unknown) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(
        `Ramp sandbox returned HTTP ${response.status}. Check access, scopes, and bill eligibility.`,
      );
    }
    return response.json();
  }

  async setHold(billId: string, release = false): Promise<RampBill> {
    if (!release) {
      // B2.4: Distinguish app-owned holds and preexisting holds.
      const existing = rampBill.parse(
        await this.fetch(`/bills/${encodeURIComponent(billId)}`),
      );

      if (existing.id !== billId)
        throw new Error("Ramp returned the wrong bill ID.");
      if (existing.status_summary === "ON_HOLD") {
        throw new Error(
          "Bill is already on hold. Reconcile its owner in Ramp; this app will not claim an existing hold.",
        );
      }

      if (
        existing.status !== "OPEN" ||
        ["PAYMENT_PROCESSING", "PAYMENT_COMPLETED", "ARCHIVED"].includes(
          existing.status_summary,
        )
      ) {
        throw new Error("This bill is not eligible for a new payment hold.");
      }
    }

    const raw = await this.fetch(
      `/bills/${encodeURIComponent(billId)}/${release ? "release" : "hold"}`,
      "POST",
      release
        ? undefined
        : { reason: "Bank-Change Guard: bank-change verification required" },
    );

    const bill = rampBill.parse(raw);
    if (bill.id !== billId) throw new Error("Ramp returned the wrong bill ID.");

    // B2.5: Confirm hold status after action.
    if (!release && bill.status_summary !== "ON_HOLD") {
      throw new Error("Ramp did not confirm ON_HOLD status.");
    }
    if (release && bill.status_summary === "ON_HOLD") {
      throw new Error("Ramp still reports ON_HOLD after release.");
    }

    return bill;
  }

  async getVendorBills(
    vendorId: string,
    pageToken?: string,
  ): Promise<{ bills: RampBill[]; next?: string }> {
    const query = new URLSearchParams({
      vendor_id: vendorId,
      page_size: "100",
    });
    if (pageToken) query.append("page_token", pageToken);

    const res = await this.fetch(`/bills?${query.toString()}`);
    const parsed = z
      .object({
        data: z.array(rampBill),
        page: z.object({ next: z.string().nullable() }),
      })
      .parse(res);

    return {
      bills: parsed.data,
      next: parsed.page.next || undefined,
    };
  }

  /**
   * B2.7: Reconcile current provider state on timeout or crash.
   */
  async reconcile(billId: string): Promise<RampBill> {
    const raw = await this.fetch(`/bills/${encodeURIComponent(billId)}`);
    return rampBill.parse(raw);
  }
}

// Legacy export for compatibility
export async function rampFetch(path: string, method = "GET", body?: unknown) {
  const client = new RampSandboxClient(process.env.RAMP_ACCESS_TOKEN || "");
  return client.fetch(path, method, body);
}

export async function setRampHold(billId: string, release = false) {
  const client = new RampSandboxClient(process.env.RAMP_ACCESS_TOKEN || "");
  return client.setHold(billId, release);
}

export async function getSandboxVendorBills(vendorId: string) {
  const client = new RampSandboxClient(process.env.RAMP_ACCESS_TOKEN || "");
  const { bills, next } = await client.getVendorBills(vendorId);

  const vendor = z
    .object({ id: z.string(), name: z.string(), country: z.string() })
    .passthrough()
    .parse(await client.fetch(`/vendors/${encodeURIComponent(vendorId)}`));

  return { vendor, bills, next };
}
