# P4-F Masking Standards

This guide defines the minimum masking rules for screenshots, shared links, and exported payloads that leave the primary operator session.

## 1. Scope

Apply these rules to:

- browser screenshots used for QA, incident review, or release sign-off
- shared conversation links and artifact previews
- admin audit exports, evidence bundles, billing exports, and ad hoc JSON dumps

## 2. Screenshot Rules

- Mask full email addresses unless the screenshot is strictly local and only used during active debugging.
- Mask bearer tokens, invite tokens, session ids, and MFA recovery values in full.
- Mask raw trace ids and run ids when the screenshot is intended for external review; keep only a short suffix if correlation is required.
- Mask uploaded file names when they contain customer names, employee ids, or regulated terms.
- Do not include browser password managers, autofill overlays, or unrelated tabs in shared screenshots.
- Prefer cropping to the smallest panel that still shows the bug, decision, or policy outcome.

## 3. Shared Link Rules

- Default new shared conversations to the least-privileged access mode that still supports the review.
- Do not post share ids in public channels without context about expiry and intended audience.
- Treat shared artifact previews as externally visible surfaces even when they stay on the same host.
- Do not expose raw audit payloads, detector previews, or operator-only notes on shared pages.
- When a shared transcript is used for escalation, capture the share id in the incident record instead of copying the whole URL into screenshots.

## 4. Export Payload Rules

- Prefer masked payload mode for audit exports and evidence bundles.
- Use raw payload mode only for tenant-scoped admin review, incident forensics, or legal hold support.
- Raw exports must be stored in a restricted location and deleted after the review window closes.
- Do not attach raw exports to tickets that are visible outside the operator group.
- If a raw export is required, note the reason in the dev log or incident record.

## 5. Detector-Specific Guidance

- `secret`: never expose full matched values; previews must stay truncated.
- `pii`: show only the minimum preview needed to explain why the detector matched.
- `regulated_term`: full term display is acceptable if it does not reveal source content.
- `exfiltration_pattern`: keep the matched phrase, but avoid including surrounding proprietary text unless required for review.

## 6. Review Checklist

Before sharing a screenshot, link, or export:

1. Confirm the audience actually needs raw identifiers.
2. Confirm the surface is not exposing bearer/session/invite secrets.
3. Confirm masking does not remove the policy or runtime evidence needed for triage.
4. Record where the artifact was shared and when it should be deleted.

## 7. Current Implementation Alignment

- Audit exports already support masked vs raw payload modes.
- Shared transcript surfaces intentionally exclude operator-only detail.
- Evidence bundles derive detector summaries from existing audit payloads; do not expand those summaries to include raw secrets.

