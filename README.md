# Bank-Change Guard

A local accounts-payable investigation workspace for vendor bank-change requests. Upload an email, inspect evidence, protect pending payments, verify through a trusted contact, and record a human decision.

## Run locally

Requires Node.js 22+ and npm.

```sh
npm ci
cp .env.example .env
npm run db:setup
npm run dev
```

Open http://127.0.0.1:3000. The database setup seeds three synthetic vendors, three bills and three investigations. No credentials are needed to use the sample cases. SQLite stores original emails, PDFs, assessments, callbacks, decisions and audit events locally; the database and environment files are ignored by Git.

If macOS offloads files in Documents/iCloud as `dataless`, clone this repository into a folder outside iCloud (for example `~/Developer/ramp-hackathon`) before installing dependencies.

## Investigation walkthrough

1. Open **Review inbox** and select **Northstar Industrial Supply**.
2. Inspect the lookalike domain, reply-to diversion, reported authentication failures, urgency and country change.
3. Inspect the **$48,000** sample bill and its explicitly **simulated hold**.
4. Open **Original email** to read the request and download its PDF or original `.eml`.
5. Open **Verification** and choose **Vendor denies**. The simulated transcript uses only the stored vendor phone number.
6. Enter a review note and **Reject change**. The hold remains active.
7. Open **Audit trail**. To release payment, add an explicit release note and use **Explicitly release hold**.
8. Open Cedar's low-risk fixture to review standard human approval. Harbor covers medium-risk review and callback gating.
9. Open **Policy evaluation** to inspect precision, recall, false positives, missed fraud and all 100 labeled cases.

Use **New investigation** to upload an `.eml` or load a sample case. Run `npm run samples:reset` to replay the three shipped synthetic cases; it preserves other uploads and refuses to reset non-simulated holds. Downloadable examples are in `fixtures/emails/`; regenerate with `npm run fixtures`. Loading a sample case is idempotent. Re-uploading an email treats authentication headers as untrusted, so a clean uploaded email has a medium-risk review floor. Only synthetic seeded fixtures can exercise the low-risk path.

## What is real and what is simulated

- **Working locally:** MIME parsing; PDF metadata inspection; bank-field extraction from email; domain/reply-to/authentication/urgency/country/routing/timing checks; versioned policy scores; persistent requests; explicit reviewer decisions; approval gates; audit events; deterministic evaluation.
- **Optional live AI:** Set `ANTHROPIC_API_KEY` for Claude or `OPENAI_API_KEY` for OpenAI in `.env`, then restart. Claude takes priority when both keys are set. Both providers analyze email, vendor history, and readable PDFs. The separate embedding score runs in OpenAI mode. Upload a new `.eml` to test live analysis. Seeded cases and duplicate uploads reuse their existing analysis. Service failures produce a review signal.
- **Simulated by default:** Bill holds, callbacks and transcripts. No real phone call is placed. A simulated callback does not establish real-world identity.
- **Optional Ramp sandbox:** Reads vendors/bills and calls documented hold/release endpoints. Only sandbox hosts are supported. A hold is confirmed only when Ramp returns `ON_HOLD`. An API error never appears as successful protection. Sandbox access and feature eligibility require your own credentials and have not been verified against a live account.
- **Bank updates:** Approval records the reviewer’s decision in the workspace.

## Ramp sandbox setup

Set `RAMP_ACCESS_TOKEN` and `RAMP_ENVIRONMENT=sandbox` in `.env`, with `vendors:read`, `bills:read` and `bills:write` scopes and bill-hold feature access. The Integrations screen can inspect a vendor by its Ramp UUID.

Create a fresh trusted local vendor baseline **before importing bills**. Supply known onboarding information, never values taken from the suspicious request:

```sh
npm run vendor:add < trusted-vendor.json
```

The input is `{ "id": "trusted-vendor", "name": "Vendor", "domain": "vendor.example", "phone": "+14155550142", "country": "US", "bankName": "Known bank", "accountLast4": "1234", "routing": "021000021", "history": ["A known historical message"] }`.

Import eligible USD sandbox bills via `POST /api/guard` with `{ "action": "sandbox-import", "localVendorId": "trusted-vendor", "rampVendorId": "RAMP_VENDOR_UUID" }`. Include your access token if configured. Bills must be imported before creating an investigation. Then upload a request matched to this baseline. High-risk requests hold the imported sandbox bills. Sample bills always use simulated holds regardless of whether a Ramp token is configured. Import stops without importing if more than 100 bills exist, to avoid implying complete payment protection from a partial sync. Existing Ramp holds are not claimed by this app; reconcile them with their owner.

Documented APIs: [Ramp OpenAPI](https://docs.ramp.com/openapi/developer-api.json), [hold behavior](https://support.ramp.com/hold-payment-for-bills-and-vendors/), [OpenAI structured output](https://developers.openai.com/api/docs/guides/structured-outputs), [PDF inputs](https://developers.openai.com/api/docs/guides/file-inputs).

## Validation and evaluation

```sh
npm run typecheck
npm test
npm run evaluate
npm run build
```

Tests cover spoof detection, unknown-evidence review floors, routing checks, MIME/PDF parsing, duplicate intake, trusted callback numbers, blocked approvals, rejection/hold separation, explicit release and sandbox adapter errors. Workflow tests create and clean up isolated test records in the configured database.

`npm run evaluate` writes `docs/evaluation.json` and a detailed report to `docs/evaluation-v2.md`. The 100 cases contain 50 legitimate and 50 crafted fraudulent requests, with 40 development variants and 60 held-out variants. Performance is broken down by attack family (e.g., lookalike domains, spoofed senders).

## Background jobs

An experimental database-backed job runner is available for manually queued analysis jobs. The intake route processes investigations directly.

```sh
npm run worker
```

The worker backs off after failed attempts. Interrupted jobs may need manual recovery. The separate voice worker requires `TWILIO_AUTH_TOKEN`, an HTTPS `VOICE_PUBLIC_ORIGIN`, and `OPENAI_API_KEY`. It bridges call audio. The dashboard still uses simulated callbacks.

## Boundaries

This is a local workspace with a single local reviewer identity. Set `APP_ACCESS_TOKEN` to require Bearer authentication for API reads and writes; the browser prompts for the token and keeps it only in session storage. Do not expose this app publicly without production identity/roles, encrypted sensitive-data storage, durable background jobs, integration reconciliation, rate limits and tamper-resistant auditing. SQLite audit events are application records, not an immutable compliance ledger. In-flight sandbox holds interrupted by a process crash require reconciliation in Ramp; the app does not automatically assume success.

Email content is rendered as text. Upload limits: 12 MB, five attachments, ten pages per PDF. Original attachments are downloaded, not executed. PDF metadata and supplied email headers can be forged. Risk points are policy severity, not probabilities.
