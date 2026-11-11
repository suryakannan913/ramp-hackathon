# Bank-Change Guard MVP

## Milestones
1. Foundation: Next.js, TypeScript, SQLite/Prisma, versioned schema, fixtures.
2. Investigation: MIME/PDF ingestion, deterministic policy, optional live AI and embeddings.
3. Workflow: durable simulated holds, trusted-number callback, gated decisions and audit log.
4. Product: AP inbox, evidence viewer, upload, vendor history, evaluation view.
5. Verification: workflow tests, synthetic evaluation, production build and demo guide.

## Integration boundary
No credentials were provided at setup. Demo mode works entirely locally. Ramp vendor/bill reads are optional; hold mutations must not be fabricated. The public API reference and OpenAPI schema must establish a supported hold operation before implementing live holds. Until then all local holds are explicitly simulated. Callbacks are simulated and human approvals do not mutate Ramp bank details.

Sources checked: https://docs.ramp.com/llms-api.txt, https://support.ramp.com/hold-payment-for-bills-and-vendors/, https://developers.openai.com/api/docs/guides/structured-outputs, https://developers.openai.com/api/docs/guides/file-inputs.

## Invariants
Every bank change requires human review. Medium/high requests require callback confirmation before approval. Only stored vendor contacts are used. Rejection never silently releases holds. Holds are per request and bill; releasing one cannot release another request's hold. Uploads and model output are untrusted. Authentication-Results in uploaded mail are not verified by this application. Risk scores are policy points, not fraud probabilities. Missing evidence raises a review floor. Original email and attachments stay in SQLite, never in Git.
