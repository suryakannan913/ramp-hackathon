# Person B: payment protection, real callbacks, identity, and reliable workflows

## Your objective

Make the investigation workflow execute external actions safely, attribute decisions to real reviewers, and survive failures. You own **Ramp sandbox validation, voice callbacks, persisted orchestration, identity/permissions, database evolution, and operational controls**.

Read [the shared handoff](README.md) first. Obtaining accounts, supplying/connecting API tokens, and Vercel deployment are outside your assignment. Build provider-independent tests and runbooks first. Actual sandbox calls and test phone calls are separate connected acceptance checks once external access is supplied.

P0 means required for the next credible integration validation, including baseline access controls for any exposed callback endpoint. P1 means required before real financial operational use. Real callbacks and production hardening exceed the original weekend's simulated-callback scope, so keep those milestones distinct.

## Start here

Use your own clone outside cloud-synced storage and a branch separate from A's:

```sh
cd ramp-hackathon
git switch main
git pull --ff-only
git switch -c work/person-b-workflow
npm ci
```

For a fresh clone only, copy `.env.example` to `.env`. Preserve any existing environment file and use isolated databases for tests.

```sh
npm run db:setup
npm run typecheck
npm test
npm run build
```

Read `AGENTS.md` and the applicable installed Next.js docs before changing routes or runtime behavior. Inspect:

- `src/lib/service.ts`: orchestration, holds, callback simulation, approval, and release.
- `src/lib/ramp.ts`: sandbox-only HTTP adapter and hold response validation.
- `src/lib/http.ts`: optional shared token and origin checks; no real user identity.
- `prisma/schema.prisma`, `src/lib/db.ts`, and existing migration.
- `src/app/api/guard/route.ts`, `src/app/api/files/[id]/route.ts`.
- `src/app/page.tsx`: current combined workspace UI.
- `tests/workflow.test.ts`, `tests/ramp.test.ts`, and `scripts/reset-samples.ts`.

You are the merge owner for shared schema/types, package files, environment examples, main UI, and root README. Preserve A's ownership of parsing, AI, scoring, and benchmark logic.

## B1. P0: persist explicit states and durable work

1. Agree with A on the contracts in the shared handoff before changing the central service. Land additive schema/type changes first.
2. Add records for intake provenance, mailbox checkpoints/delivery deduplication, immutable assessment versions, jobs/action attempts, provider identifiers, callback attempts, and authenticated actors. Store references to the precise assessment and proposed bank details being reviewed.
3. Separate analysis state from review state, hold state, and call state. A pending analysis is not a low-risk request. A completed call is not verified confirmation.
4. Persist a request and analysis job before doing a long model call. Commit checkpoint advancement only after durable intake; failed processing must remain recoverable.
5. Implement a database-backed outbox/job runner with claims/leases, bounded retries, timeouts, backoff, attempt records, and a visible terminal failure. Add a documented worker command. A single durable local worker is sufficient for the first integration milestone; do not invent a distributed platform first.
6. Persist protection/callback intents atomically with the policy transition that requires them. Run external calls outside database transactions. Save their results afterward.
7. If A's deterministic preflight already marks a case high risk, enqueue protection before waiting for AI. A later low score cannot automatically remove protection.
8. Add `uncertain` action status for timeouts/crashes where the provider may have accepted an operation. Reconcile before retrying, confirming success, or sending another call.
9. Use unique job/action keys and conditional state updates. A replayed email, worker restart, or duplicate webhook must not duplicate an external action.
10. Prevent asynchronous analysis from changing the grounds of an already-recorded decision. New material evidence creates a new assessment/review step, not a silent rewrite.
11. Keep SQLite/local workspace compatibility for P0. Database portability can follow in P1; never replace the existing SQLite migration with a PostgreSQL migration in the same migration history.

**Tests:** restart after intake; crash after external action before persistence; expired lease; two workers claiming one job; duplicate message; slow analysis; late assessment after decision; failed job visible in UI.

**Acceptance:** requests and intended protections survive a process restart, and uncertain work cannot appear confirmed.

**Suggested commit:** `Persist versioned investigations and durable external-action jobs`.

## B2. P0: validate and reconcile Ramp sandbox protection

The existing adapter only targets the sandbox and validates `ON_HOLD`. Preserve sandbox-only writes for this project phase. Do not add production payment or bank-detail mutations.

1. Make the Ramp client injectable. Expand fixture-backed tests for reads, paginated responses, hold/release outcomes, rate limits, expired access, forbidden scope, malformed results, paid/processing bills, and mismatched IDs.
2. Persist explicit local-vendor-to-Ramp-vendor mapping. Before importing or acting, verify the returned vendor/bill relationship, organization/environment, currency, and eligibility. Do not rely solely on an editable display name or an arbitrary client-supplied bill ID.
3. Implement complete paginated bill synchronization or explicitly refuse incomplete protection. The existing import refuses more than 100 bills; do not remove that guard until pagination is correct. Refresh bill state before a protection action, and define treatment of new bills arriving during an active high-risk case.
4. Distinguish app-owned holds, other active investigation reasons, and preexisting holds from another workflow. Never claim or release an external hold merely because the bill says `ON_HOLD`.
5. Implement the hold action as durable intent -> provider request -> readback/confirmation -> persisted result. Save provider IDs/status and useful trace references without storing credentials.
6. Do not assume an endpoint supports an idempotency header. Verify documented behavior; use application deduplication, ownership records, and provider reconciliation where needed.
7. On timeout or crash, query current provider state and resolve ownership before retrying. A failed HTTP response and a declined hold have different certainty from a network timeout.
8. Coordinate hold release with new hold requests so concurrent investigations cannot release one another's protection. Perform authorization and all-active-reasons checks; ensure an action cannot race past a newly-created protection reason. Preserve preexisting external protection.
9. Keep explicit release separate from approval/rejection. If release fails, do not mark it released. Releasing a hold is not the same as rescheduling or paying a bill.
10. Add UI states for requested, confirmed, uncertain, failed, and released protection. A simulated hold must remain visibly distinct even when credentials exist.
11. Extend the trusted-vendor setup/import workflow so an operator can inspect the mapping and whether all eligible bills are covered. Do not overwrite a trusted phone or bank baseline using the suspicious request.

**Connected validation:** use a supplied sandbox vendor and unpaid bill, submit a high-risk request, verify the bill is held in Ramp independently of the app, exercise rejection with the hold retained, then explicitly release after all protection reasons are resolved. Also test one real sandbox error path.

**Acceptance:** both systems agree on hold state; incomplete sync and API failure never produce a false protection claim; test evidence contains sandbox IDs and timestamps, with sensitive data redacted.

**Suggested commit:** `Reconcile sandbox bill holds and protect concurrent investigations`.

## B3. P0: build the real callback service

Use Twilio Programmable Voice with bidirectional Media Streams and a server-side OpenAI realtime voice session as the initial implementation direction. Confirm current official protocol/audio requirements before coding. Do not mix the event schemas of different voice APIs or model families. Keep model choice configurable and document the specific tested API/model combination.

Credential connection is excluded, but the media bridge, webhook verification, call lifecycle, transcripts, and tests are your work. Build this as a separate long-running Node service under `workers/voice/`; do not assume a normal short-lived Next.js route can host a persistent audio WebSocket. Document local startup and the externally reachable HTTPS/WSS addresses required for a real test. Exposing those endpoints and selecting a consenting test recipient are explicit connected-test prerequisites, not completed setup.

1. Define an injectable telephony/voice adapter and retain the simulator as a separate mode. Add explicit live versus simulated case/action boundaries.
2. Create a call job that loads the trusted phone from the stored vendor record. Snapshot its verified version. Reject any request-body/model argument that tries to override the destination or transfer the call.
3. Restrict initial connected testing to an allowlisted, expected test recipient. Enforce concurrency, duration, and retry limits so one case cannot repeatedly call a vendor.
4. Start the outbound call, associate provider call/stream IDs with a unique callback attempt, and persist state transitions.
5. Validate provider signatures on webhooks and WebSocket upgrade requests using the actual configured URL and provider instructions. Do not apply the browser-origin check as a substitute for provider authentication. Reject replayed/unrecognized call events and bind them to the intended request.
6. Bridge the documented telephony audio format to the chosen voice API, including any required transcoding. Implement start, stop, disconnect, interruption, timeouts, and cleanup. Keep secrets on the server.
7. Give the agent a narrow script: identify itself and the AP verification purpose, establish that it is speaking to an appropriate contact, and ask whether the specific proposed change was requested. Refer to only the minimum needed bank identifiers, such as last four digits; do not solicit full account credentials.
8. Treat spoken instructions and transcripts as untrusted. The voice model cannot approve a request, release payment, change a trusted phone, collect passwords/one-time codes, or execute arbitrary tools.
9. Store a timestamped speaker-labeled transcript and proposed outcome. A bare “yes,” voicemail, ambiguous identity, contradictory answers, dropped audio, or a failed model session must not become confirmed verification. Require reviewer attestation of adequate verification evidence before unlocking a live approval.
10. Support denied and inconclusive results explicitly. Keep transport failure and vendor denial separate. A completed telephony status alone cannot mark verification confirmed.
11. For the original vision's recording capability, implement controlled recording and protected playback/storage, with the project's approved notice/consent and retention behavior. Test only with an expected recipient and agreed recording settings. Do not claim a transcript is an audio recording. If recording is disabled, label that coverage accurately.
12. Handle duplicate/out-of-order webhooks and callbacks received after the request was decided. Preserve history and route new material information to review; never silently change a final decision.
13. Remove the ability for a browser caller to use the current simulated `callback` action to mark a live/sandbox request confirmed. Keep simulator controls only inside the isolated sample workflow.
14. Add UI call progress, provider failure, retry eligibility, transcript, outcome, recording availability, and reviewer verification state. Preserve the trusted-phone display.

**Tests:** supplied email phone ignored; client destination override rejected; fake provider signature rejected; wrong call/request association rejected; duplicate/out-of-order events; voicemail; no answer; “yes” without adequate identity; denial; dropped stream; retry after uncertain initiation; recording disabled/unavailable; transcript prompt injection; simulated confirmation cannot authorize sandbox workflow.

**Connected acceptance:** an expected test recipient receives exactly one call at the stored number; the correct transcript and recording state appear; denial/inconclusive cases block approval; no provider/model outcome directly changes bank details or releases payment.

**Suggested commit:** `Implement authenticated trusted-number voice verification with durable call history`.

## B4. P0: real reviewer identity and server-enforced permissions

1. Replace the fixed `Local AP reviewer` actor with a server-derived authenticated subject and organization. Use a maintained session/authentication library; credential/provider connection is supplied separately. Keep authentication behind an adapter so local tests can use signed test sessions.
2. Define viewer, reviewer, and administrator permissions. Reviewers can investigate and record decisions; an explicitly permitted actor can release holds; administrators maintain trusted vendor baselines. Document any dual-approval requirement rather than silently assuming it exists.
3. Check permissions and organization ownership in service functions and every API/file/recording route. Hiding a button is not authorization. Background jobs use a scoped system actor and retain the initiating user reference.
4. Protect original email, PDF, transcript, recording, and export access. Prevent cross-organization object-ID access even if a caller knows the ID.
5. Persist actor IDs, assessment version, reviewed bank-detail snapshot, note, and outcome together. Client fields cannot impersonate another reviewer or organization.
6. Define how a pending request is invalidated/re-reviewed when trusted contacts or the proposed bank version change. Bind verification to the exact proposal being approved.
7. Disable anonymous fallback and synthetic fixture endpoints in the live mode. A shared access token is not a multi-user identity system.
8. Keep the current callback-gated medium/high approval policy, plus the distinction between simulated/live verification. Make any simulation exception explicit and impossible to apply to imported sandbox bills.
9. Cover CSRF/session handling and provider webhook authentication through their respective paths; do not loosen all origin/auth checks to make a webhook work.

**Tests:** anonymous read/write; viewer mutation; unauthorized hold release; spoofed actor; wrong organization; protected attachment/recording access; changed proposal after verification; sample endpoint in live mode; concurrent approve/reject.

**Acceptance:** mutations are attributable to an authenticated authorized actor; unauthorized API calls fail even if the UI is bypassed.

**Suggested commit:** `Enforce reviewer identity, organization access and approval permissions`.

## B5. P0: integrate A's evidence and finish the connected workflow

1. Consume A's envelope/result contracts in `service.ts`. Keep compatibility with existing sample cases and clearly distinguish source/provenance from analysis coverage.
2. Persist A's original bytes, source links, assessment versions, conflicts, and missing evidence. Coordinate mailbox checkpoint commits with A's adapter.
3. Split the large main page into maintainable workspace components where useful, preserving the existing visual structure. Integrate A's evidence components rather than reimplementing their source logic.
4. Display separate states for intake, analysis, protection, verification, and reviewer decision. Show specific actionable failures rather than one generic “done” or “AI enabled” badge.
5. Wire actual evaluation results into the Policy evaluation screen; label deterministic, live-AI, mock, and full-pipeline runs distinctly. Do not imply that 100% precision means all fraud was stopped.
6. Add browser walkthroughs for source-linked findings, partial analysis, held bill, real/simulated callback distinction, rejected change with retained hold, and explicit release.
7. Document repeatable worker/voice startup, isolated testing, recovery, and integration testing. Keep `samples:reset` unable to delete or reset real/sandbox action records.
8. Keep approval as a recorded decision. Actual vendor bank-account writes remain explicitly out of scope until the team separately defines account verification and controlled application of approved changes.

**Acceptance:** the joint walkthrough in the shared handoff passes; no late model result, browser button, or synthetic callback bypasses approval or protection controls.

**Suggested commit:** `Integrate connected investigation, verification and review workflows`.

## B6. P1: production operational controls before real financial use

This work is not a Vercel deployment request. Develop and verify the controls independently of the eventual hosting choice.

- **Durable storage:** move multi-user operation to a suitable persistent database and private attachment/recording storage. If choosing PostgreSQL, keep provider-specific schemas/migration histories explicit, generate a new migration baseline, test rollback/restore, and document the transition. Do not relabel SQLite SQL as PostgreSQL.
- **Sensitive data:** define storage access, encryption/key management, retention/deletion, and backup policies for raw mail, bank documents, transcripts, recordings, and secrets. Do not treat a private Git repository as document storage.
- **Audit integrity:** restrict modification/deletion of decision events, add an external append-only or equivalently protected audit sink, and verify completeness. A database timestamp or hash chain alone does not prove an administrator cannot alter history.
- **Reconciliation:** schedule provider-state reconciliation for uncertain/active holds, interrupted calls, missing callbacks, and stale mailbox sync. Give operators a queue for unresolved cases. Do not auto-release on reconciliation uncertainty.
- **Monitoring:** expose job health, queue age, sync lag, unconfirmed protection, call failures, and analysis coverage. Log correlation IDs and redacted error classes. Test an alert path without contacting real vendors unnecessarily.
- **Recovery:** test worker restart, duplicate delivery, database restore, external hold preserved during outage, and recovery from provider downtime. Document manual checks in Ramp when ownership/status cannot be established.
- **Bounded resource use:** rate-limit uploads and callback initiation; limit parse/model/audio resources; avoid allowing unbounded worker retries or long database transactions across network calls.
- **Isolation:** verify organization scoping across records, storage objects, jobs, exports, and provider mappings. Keep production, sandbox, and sample records/actions distinct.
- **Change control:** version policy/prompt/worker releases, add CI with isolated test data, gate paid/live tests explicitly, and document rollback. Do not auto-migrate production data from preview/test jobs.
- **Release review:** complete an actual permission/failure/recovery review and record unresolved risks before using real payment workflows. Real bank-detail application requires its own separately agreed controls.

**Acceptance:** the team can identify and recover interrupted work, access is scoped, sensitive artifacts are protected, and a service outage cannot silently remove payment protection.

**Suggested commits:** separate storage, audit, reconciliation/monitoring, and recovery changes rather than one oversized hardening commit.

## Handoff to Person A

Supply A with the intake/job integration interface, stable attachment IDs and protected URLs, assessment persistence rules, actor/organization context, and the report schema expected by the UI. Confirm exactly when mailbox checkpoints are advanced. Give A provider-response fixtures for operational failures without exposing secrets or private financial data.

Ask A to independently review the integrated workflow and your callback/protection behavior. Independently review A's benchmark labels; do not change labels to match predictions.

## Final checklist

- [ ] Existing and new workflow/provider/permission tests pass without credentials.
- [ ] Database changes are additive or have an explicit tested migration plan.
- [ ] High-risk protection intent is durable and does not wait unnecessarily for slow AI.
- [ ] Provider uncertainty stays visible until reconciled.
- [ ] Another case's or external workflow's hold cannot be released accidentally.
- [ ] Trusted-number-only calls, webhook authentication, and replay handling work.
- [ ] Simulated verification cannot unlock live/sandbox approval.
- [ ] Authenticated actors and organization permissions are enforced in services/routes.
- [ ] A's provenance/evidence/evaluation components are integrated.
- [ ] Connected Ramp/voice checks are passed or individually marked not run.
- [ ] P1 storage/audit/recovery work is explicitly tracked before any production-readiness claim.
- [ ] Milestones are committed and pushed, and the root README explains actual startup and remaining limitations.

## Primary implementation references

Check the current documentation for exact supported request, event, signature, and audio formats before implementation.

- [Ramp API reference](https://docs.ramp.com/llms-api.txt)
- [Ramp hold behavior](https://support.ramp.com/hold-payment-for-bills-and-vendors/)
- [Twilio Media Streams](https://www.twilio.com/docs/voice/media-streams)
- [OpenAI realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [OpenAI voice WebSocket transport](https://developers.openai.com/api/docs/guides/voice-websockets)

OpenAI's voice documentation covers multiple API families. Select and pin one tested family; do not combine example URLs/events across them. No specific untested model version or provider event sequence is promised by this handoff.
