import "dotenv/config";
import { z } from "zod";
import { db } from "../src/lib/db";
// Read trusted onboarding data from stdin, never credentials or unverified request content.
const schema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().min(1),
  domain: z.string().min(3),
  phone: z.string().min(8),
  country: z.string().length(2),
  bankName: z.string().min(1),
  accountLast4: z.string().regex(/^\d{4}$/),
  routing: z.string(),
  history: z.array(z.string()),
});
async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const v = schema.parse(JSON.parse(input));
  await db.vendor.create({
    data: { ...v, history: JSON.stringify(v.history) },
  });
  console.log(
    "Created trusted vendor baseline. Existing vendor records cannot be overwritten by this script.",
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
