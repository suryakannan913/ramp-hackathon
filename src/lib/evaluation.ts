import { assess, POLICY_VERSION, THRESHOLDS } from "./risk";
import { vendors } from "./fixtures";
import type { InvestigationInput } from "./types";
const vendor = vendors[0];
export type EvalExample = {
  id: string;
  label: "legitimate" | "fraud";
  family: string;
  split: "development" | "held-out";
  input: InvestigationInput;
};
export function examples(): EvalExample[] {
  const legit = [
    [
      "Routine domestic update",
      "Please update our bank details next month. Use your usual verification process.",
    ],
    [
      "Urgent but legitimate",
      "Please update today so the payment arrives on time. Call our usual number.",
    ],
    [
      "New finance contact",
      "Our finance team has a new colleague. Please verify the account through our existing contact.",
    ],
    [
      "Bank merger",
      "Our bank merged with another institution. We have attached the confirmation.",
    ],
    [
      "New account",
      "We opened a new checking account for customer receipts. Please call the number already on file.",
    ],
    [
      "Thread continuation",
      "Following up on our earlier discussion, here is the bank letter.",
    ],
    [
      "New reply address",
      "We are consolidating customer support into a separate email domain. Please verify with our existing contact.",
    ],
    [
      "Cross-border expansion",
      "We expanded to Canada and are changing the receiving account. Please verify with our established finance team.",
    ],
    [
      "Incomplete headers",
      "Our bank details have changed. Please review the attached confirmation.",
    ],
    [
      "Incomplete bank fields",
      "Please see the attached letter for our updated account. Follow your standard process.",
    ],
  ];
  const fraud = [
    [
      "Lookalike domain",
      "We switched banks. Update immediately today and do not call the office.",
    ],
    [
      "Spoofed sender",
      "Urgent: update the bank before noon. Keep this confidential.",
    ],
    [
      "Reply-to diversion",
      "Please change the receiving account today; reply to our temporary finance mailbox.",
    ],
    [
      "Foreign account diversion",
      "Update immediately to our new overseas account. Do not call.",
    ],
    [
      "Compromised thread",
      "Hi AP team, attached is the new bank letter for next month. Please follow your normal process.",
    ],
    ["Authentication failure", "Our details changed. Please update today."],
    [
      "Executive pressure",
      "Our CFO requires this immediately. This is confidential; bypass the callback.",
    ],
    ["Subdomain trick", "Please update the bank instructions today."],
    [
      "Invalid routing",
      "Please update to this account today. The previous routing number no longer works.",
    ],
    [
      "Quiet account takeover",
      "Hi AP team, here are the revised details for our next invoice. Best, Sarah",
    ],
  ];
  const out: EvalExample[] = [];
  for (const label of ["legitimate", "fraud"] as const)
    for (let family = 0; family < 10; family++)
      for (let variant = 0; variant < 5; variant++) {
        const isFraud = label === "fraud";
        const [name, text] = (isFraud ? fraud : legit)[family];
        let sender = `sarah@${vendor.domain}`,
          replyTo = sender,
          headers =
            "Authentication-Results: fixture; spf=pass; dkim=pass; dmarc=pass";
        let country = "US",
          routing = "021000021";
        if (isFraud) {
          if ([0, 2, 7].includes(family))
            sender =
              family === 7
                ? "sarah@northstar-supply.com.attacker.test"
                : `sarah@northstar-supp${variant % 2 ? "l" : "1"}y.net`;
          if ([0, 2, 7].includes(family))
            replyTo = "finance@payments-attacker.test";
          if ([1, 5].includes(family))
            headers =
              "Authentication-Results: fixture; spf=fail; dkim=fail; dmarc=fail";
          if ([3, 6].includes(family)) country = "GB";
          if (family === 8) routing = "123456789";
        } else {
          if (family === 6) replyTo = "finance@northstar-support.com";
          if (family === 7) country = "CA";
          if (family === 8) headers = "";
        }
        const incomplete = !isFraud && family === 9;
        out.push({
          id: `${label}-${family}-${variant}`,
          label,
          family: name,
          split: variant < 2 ? "development" : "held-out",
          input: {
            sender,
            replyTo,
            headers,
            subject: `Bank change ${variant + 1}`,
            body: `${text}\nReference: ${variant + 1}.`,
            proposed: {
              bankName: incomplete ? "" : "New Business Bank",
              accountLast4: incomplete ? "" : `${7200 + variant}`,
              routing,
              country,
            },
            hasDocument: true,
            authTrusted: false,
            dueWithinDays: variant % 2 ? 2 : 14,
          },
        });
      }
  return out;
}
function metrics(rows: { label: string; risk: string }[]) {
  const tp = rows.filter(
    (r) => r.label === "fraud" && r.risk === "high",
  ).length;
  const fp = rows.filter(
    (r) => r.label === "legitimate" && r.risk === "high",
  ).length;
  const fn = rows.filter(
    (r) => r.label === "fraud" && r.risk !== "high",
  ).length;
  const tn = rows.filter(
    (r) => r.label === "legitimate" && r.risk !== "high",
  ).length;
  const flagged = rows.filter((r) => r.risk !== "low");
  const flaggedFraud = flagged.filter((r) => r.label === "fraud").length;
  return {
    count: rows.length,
    tp,
    fp,
    fn,
    tn,
    holdPrecision: tp + fp ? tp / (tp + fp) : null,
    holdRecall: tp / (tp + fn),
    legitimateHoldRate: fp / (fp + tn),
    reviewPrecision: flagged.length ? flaggedFraud / flagged.length : null,
    reviewRecall: flaggedFraud / (tp + fn),
  };
}
export function evaluate() {
  const rows = examples().map((e) => {
    const a = assess(e.input, vendor);
    return {
      id: e.id,
      label: e.label,
      family: e.family,
      split: e.split,
      score: a.score,
      risk: a.risk,
    };
  });
  return {
    policyVersion: POLICY_VERSION,
    thresholds: THRESHOLDS,
    dataset: "100 synthetic policy-level cases (50 legitimate / 50 fraudulent)",
    method:
      "Fixed thresholds; 40 development cases and 60 held-out variants. No threshold optimization is performed by this script. Same-family variants are correlated, not an independent real-world test.",
    limitations: [
      "Evaluates deterministic scoring only; not MIME parsing, document vision or live AI.",
      "Uploaded authentication headers remain untrusted, so missing independent authentication imposes a medium-risk review floor.",
      "Clean-looking compromised mailboxes can evade high-risk detection.",
      "Synthetic labels and template variants do not establish real-world accuracy.",
    ],
    overall: metrics(rows),
    heldOut: metrics(rows.filter((r) => r.split === "held-out")),
    development: metrics(rows.filter((r) => r.split === "development")),
    rows,
  };
}
