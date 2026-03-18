# P4-G Observability Operations

## Purpose
- provide the runbook targets referenced by `/admin/observability`
- document the minimum triage flow for gateway latency, degraded providers, and SLI regressions

## Triage Gateway 5xx
<a id="triage-gateway-5xx"></a>

1. Open `/admin/observability` and confirm the alert summary plus recent incident timeline entries.
2. Cross-check `/metrics` and `/health` on the gateway host.
3. Filter `/admin/audit` by the alert trace or recent warning/critical events.
4. If the failure is policy-related, inspect recent `workspace.policy.*` and `workspace.run.safety_flagged` events.
5. If the failure is run-related, pull the affected run via `/workspace/runs/:runId`.

## Runtime Degraded
<a id="runtime-degraded"></a>

1. Open `/admin/observability` and inspect the degraded provider entries in the incident timeline.
2. Compare the current runtime health snapshot with provider-routing expectations for the affected tenant.
3. Check whether `policyPack.runtimeMode` forced a stricter route than the provider fleet can currently satisfy.
4. If a provider circuit is open, review recent fallback behavior and confirm whether the fallback provider is healthy.
5. Record a manual annotation when deploys or config edits align with the degradation window.

## SLI Response
<a id="sli-response"></a>

1. Review the failing SLI card and note observed value versus target.
2. Inspect the route metrics table for the corresponding endpoint family.
3. Confirm whether the regression is global or tenant-specific by switching tenant scope.
4. Add an operator annotation with the trace, run id, or deployment marker used during triage.
5. Escalate to the owning workstream if the regression persists beyond one verification cycle.

## Notes
- `/admin/observability` is intentionally tenant-scoped by default.
- platform admins can switch tenant scope; tenant admins should remain on their own tenant.
- runbook links in alert payloads depend on the anchor ids in this file.
