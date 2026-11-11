import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { demoCases, vendors } from './fixtures';
import { db } from './db';
import { ingestRequest } from './service';
export async function demoEmail(key:string) {
  const fixture=demoCases.find(c=>c.key===key);if(!fixture) throw new Error('Unknown demo case');
  const vendor=vendors.find(v=>v.id===fixture.vendorId)!;
  const pdf=await PDFDocument.create();
  const font=await pdf.embedFont(StandardFonts.Helvetica);const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const page=pdf.addPage([612,792]);
  page.drawText(vendor.name,{x:55,y:720,size:19,font:bold,color:rgb(.12,.24,.25)});
  page.drawText('BANK ACCOUNT CONFIRMATION',{x:55,y:665,size:12,font:bold});
  const lines=['Synthetic document for the Bank-Change Guard demo.','',`Beneficiary: ${vendor.name}`,`Bank: ${fixture.bank}`,`Account ending: ${fixture.last4}`,`Routing: ${fixture.routing}`,`Country: ${fixture.country}`,'','Please verify changes with your existing vendor contact.'];
  lines.forEach((text,i)=>page.drawText(text,{x:55,y:620-i*28,size:11,font}));
  if(key==='attack') page.drawText('REVISED',{x:450,y:510,size:10,font:bold,color:rgb(.5,.15,.15)});
  pdf.setTitle('Synthetic bank confirmation');pdf.setCreator('Bank-Change Guard fixture generator');pdf.setProducer('pdf-lib');
  const attachment=Buffer.from(await pdf.save()).toString('base64').match(/.{1,76}/g)!.join('\r\n');
  const boundary='bankguard-demo-boundary';
  return Buffer.from([`From: ${fixture.sender}`,'To: ap@example.com',`Reply-To: ${fixture.reply}`,`Subject: ${fixture.subject}`,`Message-ID: <${fixture.key}@bankguard.demo>`,`Authentication-Results: demo.fixture; ${fixture.auth}`,'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=utf-8','',fixture.body,`--${boundary}`,'Content-Type: application/pdf; name="bank-confirmation.pdf"','Content-Disposition: attachment; filename="bank-confirmation.pdf"','Content-Transfer-Encoding: base64','',attachment,`--${boundary}--`,''].join('\r\n'));
}
export async function seedVendors() {
  for(const vendor of vendors) await db.vendor.upsert({where:{id:vendor.id},create:vendor,update:{}});
  const specs=[{id:'bill-northstar',vendorId:'v-northstar',invoice:'NS-1042',amountCents:4_800_000,days:1},{id:'bill-cedar',vendorId:'v-cedar',invoice:'CC-2091',amountCents:850_000,days:18},{id:'bill-harbor',vendorId:'v-harbor',invoice:'HL-782',amountCents:1_275_000,days:7}];
  for(const {days,...bill} of specs) await db.bill.upsert({where:{id:bill.id},create:{...bill,dueDate:new Date(Date.now()+days*86400000)},update:{}});
}
export async function loadDemo(key:string) {
  await seedVendors();const f=demoCases.find(c=>c.key===key);if(!f) throw new Error('Unknown demo');
  return ingestRequest(await demoEmail(key),f.vendorId,{fixture:true,skipAI:true});
}
