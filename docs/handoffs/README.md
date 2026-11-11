# Two-person implementation handoff

This is an execution plan for the remaining Bank-Change Guard work. It describes **future work**, not capabilities already delivered. Obtaining accounts, supplying API tokens, and connecting credentials are outside both assignments. Vercel deployment is also out of scope.

- [Person A: email intake, AI investigation, and evaluation](PERSON_A.md)
- [Person B: payment protection, callbacks, identity, and operations](PERSON_B.md)

## Current baseline

The repository contains a Next.js/TypeScript application, Prisma/SQLite persistence, `.eml` upload, deterministic scoring, three synthetic cases, simulated holds/callbacks, human decisions, an audit timeline, optional OpenAI/Ramp adapters, and 10 existing tests. The last completed implementation validation passed tests, type checking, and a production build.

Important limitations to preserve in documentation:

- OpenAI and Ramp adapters have not been validated against connected live services.
- PDF metadata inspection works; live visual and historical-language analysis need validation.
- Gmail ingestion and real telephony are not implemented.
- Uploaded authentication headers are not independently verified. Ordinary uploads have a medium-risk review floor. Only internal synthetic fixtures bypass this through `options.fixture`.
- Callback outcomes are manually selected simulations. Approval never writes bank details to Ramp.
- The actor is currently a fixed local reviewer, and there is no organization isolation.
- The current 100-case evaluation uses correlated template variants and tests only deterministic scoring. Held-out high-risk hold precision is 8/8 (100%); hold recall is 8/30 (26.7%). It is not evidence of production accuracy.
- The source folder on the original development Mac is linked to a stable checkout because Documents/iCloud offloaded files. Collaborators should use their own normal Git clones outside cloud-synced folders.

## Assignment boundaries

Person A owns what enters an investigation, what evidence it produces, and whether detection is effective. Person B owns the persisted workflow, external actions, reviewer permissions, and operational correctness.

Person A owns these existing files:

- `src/lib/ingest.ts`, `src/lib/ai.ts`, `src/lib/risk.ts`, `src/lib/evaluation.ts`
- `scripts/evaluate.ts`, `scripts/export-fixtures.ts`
- `tests/risk.test.ts`, new intake/AI/evaluation tests
- `docs/evaluation.json` and new benchmark material

Person B owns these existing files:

- `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts`
- `src/lib/service.ts`, `src/lib/ramp.ts`, `src/lib/db.ts`, `src/lib/http.ts`, `src/lib/types.ts`
- `src/app/api/`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/layout.tsx`
- `tests/workflow.test.ts`, `tests/ramp.test.ts`
- `scripts/setup-vendor.ts`, `scripts/reset-samples.ts`, deployment-independent worker/runtime configuration

Person A can create `src/lib/email/`, `src/lib/analysis/`, `src/components/evidence/`, and `fixtures/evaluation-v2/`. Person B can create `src/lib/voice/`, `src/lib/auth/`, `src/lib/jobs/`, `workers/`, and new API routes.

Person B is the merge owner for shared types, database migrations, the main page, package/lock files, `.env.example`, and the root README. Person A supplies additive changes or a small dedicated commit for these files; do not edit the same file on both branches simultaneously. Do not commit actual `.env` files, keys, private mail, or real banking documents.

## Work order and dependencies

1. Both people read the baseline and agree to the contracts below. Create separate branches: `work/person-a-investigation` and `work/person-b-workflow`.
2. A implements evidence/provenance contracts with fixture-backed adapters. B adds persistence, actors, and durable job boundaries using those contracts.
3. A builds trusted mailbox ingestion and investigation improvements. B builds sandbox hold reconciliation and the voice callback service. These tracks can proceed independently against mocks.
4. A hands B contract fixtures and UI evidence components. B wires them into the API, job runner, and main UI.
5. A runs detection evaluation. B runs state, permission, provider-failure, and restart tests.
6. Both complete the integrated workflow and compare persisted records with actual sandbox/provider state once external access is supplied.
7. Complete the production-hardening checks before allowing real payment-related use.

No task requires the other person to finish a complete subsystem before work begins. Use the agreed fixtures and interfaces while waiting.

## Shared contracts: proposed, not yet implemented

A creates `src/lib/analysis/contracts.ts` as the analysis/intake contract source. B imports it instead of maintaining a second copy. The structures below are the minimum fields; agree on additive fields in a small contract commit before building consumers.

### Intake envelope

`IntakeEnvelope` contains:

- `schemaVersion: 1`
- `source: 'eml-upload' | 'gmail' | 'synthetic-fixture'`
- `rawEmail: Buffer`, `receivedAt: ISO timestamp`
- `providerMessageId?: string`, `mailboxId?: string`, `threadId?: string`
- `authentication: { trust: 'unverified' | 'trusted-receiver' | 'synthetic', receiverId?: string, explanation: string, spf: 'pass' | 'fail' | 'unknown', dkim: 'pass' | 'fail' | 'unknown', dmarc: 'pass' | 'fail' | 'unknown', alignedDomain?: string }`
- `sourceFingerprint: SHA-256 of the original bytes`

`trusted-receiver` means a server-validated receiver boundary, not merely a message fetched through the Gmail API. The public upload endpoint cannot accept a trust flag. A supplies provenance validation; B persists it and prevents bypasses.

A mailbox adapter must separate retrieval from acknowledgment. B commits the investigation and checkpoint/deduplication state before A advances or acknowledges delivery. Record mailbox scope with provider IDs. Repeated deliveries must return the existing case without placing another call or repeating a hold.

### Investigation result

The analyzer returns:

- `requestId`, `assessmentVersion`, `policyVersion`, `promptVersion`, `modelId`
- `status: 'complete' | 'partial' | 'failed'`
- `proposed`: bank fields plus field-level source references
- `evidence[]`: stable ID, category, observed/inferred/unknown status, explanation, policy points, and source reference
- `missing[]`, `errors[]`, and `requiresReview: boolean`
- `score`, `risk`, start/end timestamps, and available token usage

Each source reference identifies an email/header or an attachment ID and page. Optional region coordinates must declare their coordinate system. Fields that disagree between the email and PDF are retained as conflicting observations; they are not silently overwritten.

A can wrap the existing `assess` and `analyzeWithAI` functions to produce this contract. B is responsible for persistence/API compatibility. Assessment versions are append-only; asynchronous completion cannot replace the assessment attached to an already-decided request without reopening review.

### Action request and completion

B owns action records with `requestId`, `assessmentVersion`, `kind`, `mode`, an idempotency key, attempt count, provider operation ID when available, timestamps, and a state.

Keep transport/action state separate from business verification:

- Hold state: `queued | pending | confirmed | uncertain | failed | released`.
- Call transport state: `queued | dialing | connected | completed | failed | canceled`.
- Verification outcome: `pending | confirmed | denied | inconclusive`.
- Callback mode: `simulated | live`.

A completed call is not automatically a confirmed verification. An HTTP timeout after a hold request creates an uncertain outcome until reconciled; it is not proof that no hold exists.

When the latest approved policy assessment becomes high risk, B durably requests protection and a callback. If an initial deterministic pass is already high risk, do not wait for slow AI analysis before requesting protection. Later findings cannot automatically release a hold or approve a change.

### Identity and review

B passes a server-derived actor into mutation services: authenticated subject ID, organization ID, and permissions. Never accept these values as authoritative fields in an ordinary client request.

Preserve these rules:

- All bank changes require an explicit human decision and note.
- Keep the existing medium/high callback requirement unless both owners explicitly document and test a policy change.
- A simulated callback cannot authorize a live/sandbox integration path. It is valid only for a clearly separated sample workflow.
- Voice/model output cannot approve changes, release holds, change contacts, or write vendor bank details.
- Rejection does not release payments. Release is separate, authorized, documented, and checked against every active protection reason.
- Approval is a recorded decision, not a bank-account mutation. Adding actual bank-detail writes is a separate scope decision after account verification and change-control requirements are agreed.

## Credential-independent and connected completion

Each person must deliver working fixture/mock tests, failure handling, setup-independent code, and a runbook without waiting for tokens. Those tasks are not blocked by access.

Connected validation is a separate checklist. If external access has not been supplied, mark it **not run: access unavailable**. Do not replace it with a mock and call it live validation. A test recipient, trusted vendor baseline, representative documents, and an approved callback/webhook address are non-token prerequisites; identify them in the relevant handoff rather than assuming they exist.

## Merge and Git instructions

1. Start from the latest `main`. Check `AGENTS.md`; read the installed Next.js documentation before changing framework code.
2. Work in separate clones/worktrees and use separate local test databases. Preserve the existing local `.env`; copy `.env.example` only when creating a new environment.
3. Commit one coherent milestone at a time. Include relevant tests and an honest validation note. Push the branch after each completed milestone.
4. Run the applicable checks. Workflow/database changes need an isolated migrated test database. Never point automated tests at production or shared financial data.
5. A sends B a list of contract/schema needs first. B lands additive schema changes before either person depends on them.
6. Avoid dependency or lockfile conflicts: B lands agreed package additions, then A rebases. Do not run two installers in the same checkout.
7. Integrate through small reviewed PRs. Do not force-push a shared branch or overwrite unrelated work.

Existing validation commands:

```sh
npm run typecheck
npm test
npm run evaluate
npm run build
```

A adds new explicit evaluation commands; B adds explicit worker/voice startup and provider-smoke commands. Document commands when implemented, not as though they already exist.

## Joint acceptance walkthrough

- A trusted test email arrives and produces exactly one investigation, including on replay/restart.
- Evidence links to the correct email or PDF page; incomplete analysis is clearly labeled.
- A high-risk request requests protection promptly. Ramp sandbox independently shows the intended bill on hold before the UI labels it confirmed.
- A real test callback uses only the stored trusted phone. Its transcript and, where enabled for the test, recording are attached to the right call and case.
- Denial, voicemail, dropped calls, and inconclusive answers cannot unlock approval.
- The authenticated reviewer rejects the request. The hold remains active.
- A separate authorized release, after all protection reasons are resolved, is confirmed and audited.
- A verified legitimate case exercises the low-risk path without any automatic bank-detail write.
- Network failure, duplicate events, out-of-order callbacks, concurrent review, and worker restart produce no false confirmations or duplicate external actions.
- The evaluation report includes recall and failures alongside precision, with independent holdout limitations stated.

Integration completion means this walkthrough and the P0 tasks in both guides pass. Production readiness additionally requires both P1 checklists and a documented release review. Neither means that the system detects every fraud attempt.
