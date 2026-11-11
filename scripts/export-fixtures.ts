import { writeFileSync,mkdirSync } from 'node:fs';
import { demoEmail } from '../src/lib/demo';
async function main(){mkdirSync('fixtures/emails',{recursive:true});for(const key of ['attack','legitimate','ambiguous'])writeFileSync(`fixtures/emails/${key}.eml`,await demoEmail(key));console.log('Exported three synthetic .eml examples with PDF attachments.');}
main().catch(e=>{console.error(e);process.exitCode=1;});
