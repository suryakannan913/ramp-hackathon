import { writeFileSync, mkdirSync } from "node:fs";
import { sampleEmail } from "../src/lib/sample-cases";
async function main() {
  mkdirSync("fixtures/emails", { recursive: true });
  for (const key of ["attack", "legitimate", "ambiguous"])
    writeFileSync(`fixtures/emails/${key}.eml`, await sampleEmail(key));
  console.log("Exported three synthetic .eml examples with PDF attachments.");
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
