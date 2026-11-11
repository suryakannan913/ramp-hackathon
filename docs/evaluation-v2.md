# Detection Evaluation Report (v2)

## Overview
- **Policy Version**: 2026-11-10.2
- **Dataset**: 100 synthetic policy-level cases (50 legitimate / 50 fraudulent)
- **Method**: Fixed thresholds; 40 development cases and 60 held-out variants.

## Metrics (Held-out Set)
- **Hold Precision**: 100% (No false positives in high-risk tier)
- **Hold Recall**: 73.3% (Fraud that reaches high-risk tier automatically)
- **Legitimate Hold Rate**: 0% (No legitimate requests were automatically held)
- **Review Precision**: 50% (Fraud among medium + high requests)
- **Review Recall**: 100% (All fraud was caught at either medium or high risk level)

## Performance by Attack Family
- **Lookalike domain**: 100% recall
- **Spoofed sender**: 100% recall
- **Reply-to diversion**: 100% recall
- **Foreign account diversion**: 100% recall
- **Compromised thread**: 0% recall (Escaped to Medium risk due to clean headers)
- **Authentication failure**: 100% recall
- **Executive pressure**: 0% recall (Escaped to Medium risk due to clean headers)
- **Subdomain trick**: 100% recall
- **Invalid routing**: 100% recall
- **Quiet account takeover**: 0% recall (Escaped to Medium risk)

## Limitations
1. Evaluates deterministic scoring only; not MIME parsing, document vision or live AI.
2. Uploaded authentication headers remain untrusted, so missing independent authentication imposes a medium-risk review floor.
3. Clean-looking compromised mailboxes can evade high-risk detection.
4. Synthetic labels and template variants do not establish real-world accuracy.

## Failure Analysis & Follow-up
- **Compromised genuine accounts**: Requests from the real sender domain with passing (but supplied) headers currently land in the `medium` risk tier. This forces a human review but misses the automatic `high` risk hold.
- **Follow-up**: Integrate live AI vision to detect subtle document edits that deterministic rules miss. Implement verified mailbox ingestion (Task A2) to distinguish truly trusted headers from supplied ones.
