import type { Assessment, Evidence, InvestigationInput, VendorContext } from './types';
export const POLICY_VERSION = '2026-11-10.1';
export const THRESHOLDS = { medium: 25, high: 65 };
export function editDistance(a: string, b: string): number {
  const row = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j]; row[j] = Math.min(row[j] + 1, row[j-1] + 1, prev + Number(a[i-1] !== b[j-1])); prev = old;
    }
  }
  return row[b.length];
}
export function domainOf(email: string) { return email.split('@').pop()?.toLowerCase().replace(/>$/, '') ?? ''; }
export function validRouting(value: string) {
  if (!/^\d{9}$/.test(value) || /^0+$/.test(value)) return false;
  const d = [...value].map(Number);
  const prefix = Number(value.slice(0,2));
  return (prefix <= 12 || (prefix >= 21 && prefix <= 32) || (prefix >= 61 && prefix <= 72) || prefix === 80) && (3*(d[0]+d[3]+d[6])+7*(d[1]+d[4]+d[7])+d[2]+d[5]+d[8])%10 === 0;
}
export function assess(input: InvestigationInput, vendor: VendorContext, extra: Evidence[] = []): Assessment {
  const evidence: Evidence[] = []; const missing: string[] = [];
  const add = (id: string, category: string, title: string, detail: string, source: string, points: number, confidence: Evidence['confidence'] = 'observed', quote?: string) => evidence.push({id, category, title, detail, source, points, confidence, quote});
  const senderDomain = domainOf(input.sender), replyDomain = domainOf(input.replyTo);
  const expected = vendor.domain.toLowerCase();
  if (senderDomain !== expected) {
    const similar = editDistance(senderDomain,expected) <= 3 || senderDomain.replace(/[01]/g, c => c==='0'?'o':'l') === expected;
    add('sender-domain','Identity',similar?'Lookalike sender domain':'Unrecognized sender domain',`Received from ${senderDomain}; the trusted vendor domain is ${expected}.`,'From header',similar?40:25, 'observed', senderDomain);
  } else add('sender-domain','Identity','Sender matches vendor domain',`The sender uses ${expected}. This alone does not establish account ownership.`,'From header',0);
  if (replyDomain && replyDomain !== senderDomain) add('reply-to','Identity','Replies go to a different domain',`Reply-To points to ${replyDomain}, while the sender uses ${senderDomain}.`,'Reply-To header',20,'observed',input.replyTo);
  const auth = input.headers.toLowerCase();
  const failed = ['spf','dkim','dmarc'].filter(k => new RegExp(`\\b${k}=(fail|softfail|permerror|temperror)\\b`).test(auth));
  if(failed.length) add('auth','Authentication',`Reported ${failed.map(s=>s.toUpperCase()).join(', ')} failure`,`Uploaded headers report failures. Header authenticity has not been independently verified.`,'Authentication-Results (supplied)',25,'inferred',failed.map(s=>`${s}=fail`).join('; '));
  else if (['spf','dkim','dmarc'].every(k=>new RegExp(`\\b${k}=pass\\b`).test(auth))) add('auth','Authentication','Headers report authentication passes','SPF, DKIM and DMARC are reported as passing. Uploaded headers can be forged; these results are not independently verified.','Authentication-Results (supplied)',0,'inferred');
  else { missing.push('Complete SPF/DKIM/DMARC results'); add('auth','Authentication','Authentication evidence incomplete','One or more authentication results are absent or inconclusive.','Email headers',0,'unknown'); }
  if (!input.authTrusted) missing.push('Independent email authentication');
  const urgency = input.body.match(/\b(urgent|immediately|today|asap|before (?:noon|close)|within \d+ hours|confidential|do not call|don.t call|bypass)\b/i);
  if (urgency) add('urgency','Language','Pressure or process change',`The request contains “${urgency[0]}”. Review this in the context of vendor history.`,'Email body',15,'inferred',urgency[0]);
  if (/do not call|don.t call|bypass|confidential|keep this between/i.test(input.body)) add('avoid-verification','Language','Request discourages verification','The message asks for secrecy or asks AP to skip its normal verification process.','Email body',20,'inferred',input.body.match(/[^.!?]*(?:do not call|don.t call|bypass|confidential|keep this between)[^.!?]*/i)?.[0]?.trim());
  if (!vendor.history || vendor.history === '[]') missing.push('Historical vendor correspondence');
  if (input.proposed.country && input.proposed.country !== vendor.country) add('country','Bank details','Account country changed',`Proposed country ${input.proposed.country}; vendor history ${vendor.country}.`,'Extracted bank details',25);
  if (!input.proposed.country || !input.proposed.accountLast4 || !input.proposed.bankName) missing.push('Complete proposed bank details');
  if (input.proposed.country === 'US' && !validRouting(input.proposed.routing)) add('routing','Bank details','Routing number is missing or invalid','The proposed US routing number fails the format/checksum check. Valid formatting would not establish ownership.','Extracted bank details',15);
  if (input.dueWithinDays !== undefined && input.dueWithinDays <= 3) add('timing','Payment context','Payment is due soon',`An unpaid bill is due ${input.dueWithinDays <= 0 ? 'now or overdue' : `in ${input.dueWithinDays} day(s)`}. A last-minute change increases exposure.`,'Stored bill due date',10);
  if (!input.hasDocument) missing.push('Bank letter attachment');
  evidence.push(...(input.documentFindings ?? []),...extra);
  const points = evidence.reduce((s,e)=>s+e.points,0);
  const score = Math.min(100, Math.max(points, missing.length ? THRESHOLDS.medium : 0));
  const risk = score>=THRESHOLDS.high?'high':score>=THRESHOLDS.medium?'medium':'low';
  return {policyVersion:POLICY_VERSION,score,risk,evidence,missing,analysisMode:'rules',aiStatus:'Not configured — deterministic checks only',assessedAt:new Date().toISOString(),summary:risk==='high'?'Multiple signals warrant a payment hold and trusted-number verification.':risk==='medium'?'Review the evidence and verify the change before approval.':'No elevated signals detected. Human approval is still required.'};
}
