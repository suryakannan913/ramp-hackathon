import { writeFileSync } from "node:fs";
import { evaluate } from "../src/lib/evaluation";
const report = evaluate();
writeFileSync("docs/evaluation.json", JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      dataset: report.dataset,
      overall: report.overall,
      heldOut: report.heldOut,
      limitations: report.limitations,
    },
    null,
    2,
  ),
);
