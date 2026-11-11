import { z } from 'zod';
const rampBill=z.object({id:z.string(),status:z.string(),status_summary:z.string(),amount:z.object({amount:z.number().int(),currency_code:z.string()}),invoice_number:z.string().optional(),due_at:z.string(),vendor:z.unknown()}).passthrough();
export async function rampFetch(path:string,method='GET',body?:unknown) {
  if(!process.env.RAMP_ACCESS_TOKEN) throw new Error('Ramp sandbox token is not configured.');
  if(process.env.RAMP_ENVIRONMENT !== 'sandbox') throw new Error('Only Ramp sandbox connections are enabled in this MVP.');
  const response=await fetch(`https://demo-api.ramp.com/developer/v1${path}`,{method,headers:{Authorization:`Bearer ${process.env.RAMP_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(15_000)});
  if(!response.ok) throw new Error(`Ramp sandbox returned HTTP ${response.status}. Check access, scopes, feature availability and bill eligibility.`);
  return response.json();
}
export async function setRampHold(billId:string,release=false) {
  const raw=await rampFetch(`/bills/${encodeURIComponent(billId)}/${release?'release':'hold'}`,'POST',release?undefined:{reason:'Bank-Change Guard: bank-change verification required'});
  const bill=rampBill.parse(raw);
  if(bill.id!==billId) throw new Error('Ramp response bill ID did not match.');
  if(!release && bill.status_summary!=='ON_HOLD') throw new Error('Ramp did not confirm ON_HOLD. Reconcile the bill in Ramp before retrying.');
  if(release && bill.status_summary==='ON_HOLD') throw new Error('Ramp still reports ON_HOLD.');
  return bill;
}
export async function getSandboxVendorBills(vendorId:string) {
  const vendor=z.object({id:z.string(),name:z.string(),country:z.string()}).passthrough().parse(await rampFetch(`/vendors/${encodeURIComponent(vendorId)}`));
  const result=z.object({data:z.array(rampBill),page:z.object({next:z.string().nullable()})}).parse(await rampFetch(`/bills?vendor_id=${encodeURIComponent(vendorId)}&page_size=100`));
  return {vendor,bills:result.data,next:result.page.next};
}
