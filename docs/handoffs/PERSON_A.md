# Person A: trusted email, AI investigation, and detection quality

## Your objective

Turn the current rules-based investigation into a provenance-aware, evidence-backed detection pipeline, then measure how well it works. You own **trusted email ingestion, AI/PDF analysis, scoring improvements, and detection evaluation**.

Read [the shared handoff](README.md) first. It defines ownership, proposed contracts, synchronization, and joint acceptance. Obtaining accounts, providing/connecting API tokens, and Vercel deployment are not part of your assignment. Implement and test against fixtures without waiting for external access.

P0 means required for the next credible integration validation. P1 means required before real operational use or a stated follow-up improvement. Do P0 in order; do not spend the first milestone redesigning the whole UI.

## Start here

Use your own clone outside Documents/iCloud or another cloud-synced directory. The repository is `https://github.com/suryakannan913/ramp-hackathon`.

```sh
cd ramp-hackathon
git switch main
git pull --ff-only
git switch -c work/person-a-investigation
npm ci
```

For a fresh clone only, copy `.env.example` to `.env`. Use a private local development database and a separate isolated test database. Then:

```sh
npm run db:setup
npm run typecheck
npm test
npm run evaluate
npm run dev
```

Read `AGENTS.md`, the root README, `src/lib/types.ts`, and the shared contracts. Inspect your main files:

- `src/lib/ingest.ts`: MIME parser, basic text extraction, PDF metadata, content fingerprint.
- `src/lib/ai.ts`: structured analysis and embeddings; errors currently collapse into one failure result.
- `src/lib/risk.ts`: additive scoring and missing-evidence review floor.
- `src/lib/evaluation.ts`: the current correlated synthetic benchmark.
- `scripts/evaluate.ts`, `tests/risk.test.ts`, and `fixtures/emails/`.

Do not directly rewrite Person B's `service.ts`, Prisma schema, route handlers, `types.ts`, or main page. Supply contract changes and UI components to B for integration.

## A1. P0: define testable analysis and intake interfaces

1. Create `src/lib/analysis/contracts.ts` using the fields in the shared handoff.
2. Separate raw parsing, authentication provenance, bank-field extraction, model calls, evidence validation, and policy scoring. Make model and mailbox clients injectable so tests do not require network access.
3. Preserve the existing public behavior through wrappers until B switches the orchestrator to the new contract. Do not break `parseEmail`, `assess`, or sample seeding without an agreed migration.
4. Add source references to extraction results and findings. Use stable attachment IDs or ingestion-time content IDs that B can map to persisted attachment IDs.
5. Add explicit stage status: not configured, skipped, complete, partial, timeout, refused, invalid result, or failed. Missing/failed work must not look like a clean finding.
6. Send B one valid, one partial, and one failed serialized result fixture, along with persistence needs and examples of source conflicts.

**Acceptance:** contract fixtures validate; an invalid model response never enters the evidence list as observed fact; current fixture tests continue to pass.

**Suggested commit:** `Define provenance-aware intake and investigation contracts`.

## A2. P0: implement trustworthy mailbox intake

Use the Gmail API adapter as the first mailbox implementation. Begin with an explicit operator-triggered/polling sync; push delivery can follow once polling and recovery work. Credential acquisition and OAuth connection are handled separately, but the adapter must still handle expired/revoked access and report the failure.

1. Implement `src/lib/email/gmail.ts` behind a mailbox-client interface. Fetch original MIME bytes, provider message/thread IDs, and mailbox identity. Preserve raw bytes and retrieval metadata.
2. Implement initial sync, incremental sync, pagination, and durable checkpoint proposals. Process only the configured test mailbox/label and agreed bank-change candidate rules. Do not silently scan unrelated mail.
3. Return retrieved envelopes and a proposed checkpoint to B. B advances the checkpoint only after durable intake. Design replay so a crash between case creation and acknowledgment is safe.
4. Handle expired history checkpoints through a bounded resync. Do not skip messages simply because a cursor is no longer accepted.
5. Deduplicate using mailbox-scoped provider IDs plus the existing content hash. Do not merge two vendors or organizations solely because their message IDs match.
6. Replace the single `authTrusted` boolean at the analysis boundary with the explicit provenance result. Parse structured authentication results, including alignment information, and inspect only the trusted receiver's contribution.
7. Validate why a receiver is trusted. A message retrieved through Gmail can still contain attacker-added `Authentication-Results` lines. If the receiver boundary or aligned identity cannot be established, return unknown/unverified and keep the review floor.
8. Never allow `.eml` uploads, message bodies, client JSON, or PDF content to set trusted authentication. Keep the synthetic-fixture exception internal and visibly labeled.
9. Match a message to known vendor context cautiously. Domain similarity is a fraud signal, not authority to reassign a vendor or overwrite contacts. Ambiguous matches go to human selection.
10. Provide a concise sync status model for B's UI: last successful sync, pending work, failures, and whether a bounded backfill is incomplete.

**Tests:** paginated inbox; duplicate and out-of-order deliveries; replay after crash; expired checkpoint; revoked access; forged upstream auth header; multiple auth headers; valid DKIM from an unrelated domain; unknown vendor; forwarded message; encoded MIME; malformed PDF; size/page limits.

**Acceptance:** one test email creates one case across repeated syncs; no cursor advances past unpersisted work; untrusted headers cannot unlock low risk.

**Suggested commit:** `Add provenance-aware mailbox ingestion and replay-safe synchronization`.

## A3. P0: improve extraction, document evidence, and live analysis

1. Keep originals immutable. Extract available PDF text locally, retain page boundaries, and support rendered-page/image evidence where needed. Apply size/page/time limits before expensive processing.
2. Extract proposed bank fields from the email and document independently. Report missing fields, per-field confidence/source, and contradictions. Do not keep the current silent preference for email fields over conflicting PDF fields.
3. Validate structured model output with runtime schemas. Require exact source quotes for email findings and attachment-plus-page references for document findings.
4. Fix the current multi-document ambiguity: a page number must be valid for the specific attachment, not merely less than the largest page count among all PDFs. Reject nonexistent sources and pages.
5. Test font/layout inconsistencies and visibly edited account regions as possible anomalies. Distinguish observation from interpretation. Metadata alone, different fonts, or a legitimate scanned letter cannot establish forgery.
6. Keep prompts, output schemas, and model configuration versioned. Treat all incoming content as untrusted. The model gets no ability to place calls, release holds, approve changes, or change vendor records.
7. Make timeout, refusal, truncation, parse failure, empty output, unreadable/encrypted PDF, and embedding failure separate coverage outcomes. A successful text response does not mean vision and embeddings also succeeded.
8. Compare writing against verified historical messages. Exclude the current unverified request from its own baseline and prevent future baseline contamination by rejected requests.
9. Keep semantic embedding similarity labeled as semantic similarity. Do not advertise it as a proven authorship detector or add a universal fraud threshold without evaluation. If you introduce style features, test them against changes in subject matter, author, and legitimate urgency.
10. Record latency and available token usage by stage. Keep raw secrets and unnecessary full bank/account content out of logs and test artifacts.
11. Build source-linked React components under `src/components/evidence/` for findings, coverage, conflicts, and PDF-page references. Give B a small usage example; B wires them into the main page and protected file routes.

**Tests:** invented quote rejected; wrong attachment/page rejected; email/PDF disagreement preserved; model prompt injection cannot change workflow state; service timeout preserves deterministic evidence; embedding failure does not erase successful document findings; scanned or unreadable document stays unknown; missing full bank details cannot be inferred as facts.

**Connected validation, once access is supplied:** run new legitimate, ambiguous, and fraudulent uploads with actual analysis; inspect every cited source; verify processing time and usage; save a redacted run report. Seeded sample cases intentionally skip AI, so loading a sample case is not a live-AI test.

**Acceptance:** every material AI finding is traceable to a real source, partial coverage is visible, and conflicts cannot silently become approved bank details.

**Suggested commit:** `Validate source-linked AI and document investigation results`.

## A4. P0: improve the risk policy without hiding uncertainty

1. Establish reproducible baseline results before changing weights. Keep the original report as a historical baseline rather than replacing its limitations with a success claim.
2. Parse domains consistently: case normalization, Unicode/punycode, subdomains, reply-to differences, and exact trusted identity. A suffix such as `vendor.com.attacker.test` is not a trusted vendor subdomain.
3. Use verified authentication/alignment status, not a raw search across all header text. SPF pass alone does not establish the claimed sender's identity.
4. Improve combined evidence for thread hijack, process avoidance, bank-country change, timing, and email/document disagreement. Avoid adding the same underlying signal multiple times through rules and AI.
5. Retain the missing-evidence review floor. Implement a genuine low-risk path only for sufficiently complete, trusted evidence; never make every clean-looking upload low risk to improve metrics.
6. Distinguish scores from fraud probabilities. If probability calibration is not implemented, label the output as policy points everywhere.
7. Version policy changes and provide B deterministic preflight and final results. B can protect bills immediately when preflight already reaches high risk; late AI findings cannot auto-release a hold.
8. Preserve unconditional human approval. Risk affects investigation and protection intensity, not permission for the AI to edit vendor accounts.

**Acceptance:** targeted cases exercise low/medium/high paths through the actual analysis boundary, a trusted but compromised mailbox is not assumed safe, and each weight change has development-set evidence.

**Suggested commit:** `Refine risk policy with trusted provenance and conflicting-bank evidence`.

## A5. P0: replace the weak benchmark with an honest end-to-end evaluation

1. Create `fixtures/evaluation-v2/` with a manifest, labels, provenance expectations, vendor context, raw emails, and associated documents. Use synthetic/redacted material only.
2. Keep at least 50 legitimate and 50 crafted fraudulent requests. Make them materially distinct; changing a reference number is not a new independent example.
3. Include routine changes, legitimate urgency, staff changes, international vendors, forwarded mail, lookalikes, misleading subdomains, compromised genuine accounts, forged headers, reply diversion, conflicting account details, subtle document edits, and incomplete evidence.
4. Have B independently review the labels and expected evidence. Keep the label outside analyzer inputs. Record disagreements rather than silently changing truth to match the score.
5. Split development and holdout data by scenario/vendor/template family before tuning. Near-duplicate threads/documents must not appear across splits. Keep the holdout untouched until the policy is frozen; if you tune after seeing it, create a new holdout for the next reported result.
6. Provide separate runs for deterministic policy, model-assisted analysis, and the full intake-to-assessment pipeline. A mocked model run validates contracts, not actual AI detection quality.
7. For each run record dataset/split hash, model/prompt/policy versions, source revision, predictions, stage failures, latency, usage, and evidence-validation failures. Repeat a small live subset to expose nondeterminism.
8. Report counts and denominators for high-risk hold precision/recall, legitimate hold rate, medium-plus-high review precision/recall, low-risk fraud escapes, and incomplete-analysis rate. Use N/A for an undefined metric rather than claiming zero or perfect performance.
9. Report performance by attack family, not only an aggregate. Include confidence intervals where appropriate and state that a 100-case synthetic set is limited.
10. Agree on operating thresholds using development data and reviewer workload. Do not invent an achieved precision/recall target. If desired targets are missed, publish the misses and explain the resulting review burden.
11. Add failure examples and proposed follow-up work to `docs/evaluation-v2.md`. Supply B a stable report schema for the website and downloadable results.
12. Document new executable commands in `package.json` through B's package-file merge ownership. Keep routine CI credential-free; explicitly opt in to paid/live model evaluations.

**Acceptance:** the report can be reproduced from committed synthetic inputs; the holdout has no known family leakage; end-to-end results are distinguished from rule-only results; missed attacks are visible.

**Suggested commit:** `Add independent end-to-end detection evaluation and failure analysis`.

## A6. P1: maintainable intake and evidence operations

- Add bounded resync/backfill controls and monitoring signals for stale mailbox ingestion. B owns the scheduler and alerts; supply the health measurements.
- Define when trusted correspondence enters or leaves the baseline, who may approve changes, and how baseline corrections are versioned.
- Add parsers/extraction fixtures for realistic vendor formats and resource-exhaustion cases. Do not execute embedded document content.
- Agree with B on retention/deletion of mail, documents, embeddings, recordings, and redacted evaluation artifacts. B implements storage enforcement; A ensures its outputs honor it.
- Document where vision/stylometry is unreliable and what manual investigation should follow. Never claim document-forensics certainty from a generic vision-model explanation.

## Handoff to Person B

Deliver these items before requesting integration review:

- Contract module and valid/partial/failed fixtures.
- Mailbox adapter, provenance validator, and checkpoint/deduplication behavior.
- Analyzer/scorer interfaces, source references, extraction-conflict behavior, and version metadata.
- UI evidence components with a minimal rendering example.
- Tests, synthetic benchmark inputs, report schema, baseline comparison, and run instructions.
- A list of required schema/type changes. Do not independently generate Prisma migrations.
- A redacted connected-validation report, or an explicit list of connected tests not run because access was unavailable.

## Final checklist

- [ ] Existing and new analysis/intake tests pass without external credentials.
- [ ] New APIs cannot mark arbitrary uploaded mail as trusted.
- [ ] Every material finding has an exact source or is explicitly marked unknown/inferred.
- [ ] Email/PDF conflicts survive extraction and force review.
- [ ] Missing history and failed AI stages cannot appear as successful clean checks.
- [ ] Detection results include false negatives and reviewer workload.
- [ ] B has integrated the contracts/components without duplicate schemas or breaking existing workflows.
- [ ] Connected email/AI tests are passed or individually marked not run.
- [ ] Each completed milestone is committed and pushed to your branch.

## Primary implementation references

Check the current official documentation when implementing; do not copy provider event schemas from memory.

- [Gmail synchronization and checkpoint recovery](https://developers.google.com/workspace/gmail/api/guides/sync)
- [Gmail push delivery, if added after polling](https://developers.google.com/workspace/gmail/api/guides/push)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI PDF/file inputs](https://developers.openai.com/api/docs/guides/file-inputs)
