import 'dotenv/config';
import { seedVendors, loadDemo } from '../src/lib/demo';
import { db } from '../src/lib/db';
async function main() {await seedVendors();for(const key of ['attack','legitimate','ambiguous']) await loadDemo(key);console.log('Seeded three synthetic vendor cases. All payment holds and callbacks are simulated.');}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.$disconnect());
