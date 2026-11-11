import test from 'node:test';
import assert from 'node:assert/strict';
import { setRampHold,rampFetch } from '../src/lib/ramp';
test('sandbox adapter requires credentials, validates hold confirmation and never calls production',async()=>{
 const savedFetch=globalThis.fetch,savedToken=process.env.RAMP_ACCESS_TOKEN,savedEnv=process.env.RAMP_ENVIRONMENT;
 try{
  delete process.env.RAMP_ACCESS_TOKEN;await assert.rejects(()=>rampFetch('/bills'),/not configured/);
  process.env.RAMP_ACCESS_TOKEN='test-only';process.env.RAMP_ENVIRONMENT='production';await assert.rejects(()=>rampFetch('/bills'),/Only Ramp sandbox/);
  process.env.RAMP_ENVIRONMENT='sandbox';
  let status='ON_HOLD';const calls:string[]=[];
  globalThis.fetch=async(input,init)=>{calls.push(`${init?.method} ${input}`);return new Response(JSON.stringify({id:'bill-test',status:'OPEN',status_summary:status,amount:{amount:4800000,currency_code:'USD'},due_at:'2026-12-01'}),{status:200});};
  await setRampHold('bill-test');assert.ok(calls[0].includes('https://demo-api.ramp.com/developer/v1/bills/bill-test/hold'));
  status='PAYMENT_SCHEDULED';await assert.rejects(()=>setRampHold('bill-test'),/did not confirm/);
  globalThis.fetch=async()=>new Response('{}',{status:403});await assert.rejects(()=>setRampHold('bill-test'),/HTTP 403/);
 }finally{globalThis.fetch=savedFetch;if(savedToken===undefined)delete process.env.RAMP_ACCESS_TOKEN;else process.env.RAMP_ACCESS_TOKEN=savedToken;if(savedEnv===undefined)delete process.env.RAMP_ENVIRONMENT;else process.env.RAMP_ENVIRONMENT=savedEnv;}
});
