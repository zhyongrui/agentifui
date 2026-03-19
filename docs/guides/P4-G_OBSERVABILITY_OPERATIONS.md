# P4-G Observability Operations

## Purpose
- provide the runbook targets referenced by `/admin/observability`
- document the minimum triage flow for gateway latency, degraded providers, and SLI regressions
- define the current incident-command and postmortem expectations for fresh sessions

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

## Trace Collection

1. Start with the `x-trace-id` returned by any `/api/gateway/*` response in the browser or gateway response headers.
2. The web proxy preserves an inbound `x-trace-id` and generates one when the browser request does not provide it.
3. Gateway request logs include the same trace id plus a `traceSource` field so you can tell whether the trace came from upstream or was generated at the edge.
4. Audited DB-backed mutations now persist `traceId`, `requestId`, `method`, and `route` in the audit payload, so `/admin/audit` can pivot on the same request path.
5. Chat/runtime flows reuse that trace id for run persistence, provider selection metadata, and audit lookups.

## Incident Command Flow

1. Assign one incident commander and record the start time, tenant scope, and the first known `x-trace-id`.
2. Assign one operator to evidence collection:
   - gateway `/health`
   - gateway `/metrics`
   - `/admin/observability`
   - `/admin/audit` filtered by trace, tenant, and run id
3. Assign one operator to mitigation:
   - reduce blast radius first
   - switch tenant runtime mode only if the observability trail shows provider or policy mismatch
   - record every manual action as an observability annotation
4. Keep one running timeline in the incident notes:
   - first detection time
   - current user impact
   - active mitigations
   - unresolved risks
5. Do not close the incident until the same trace family or smoke path succeeds after the mitigation.

## Postmortem Expectations

1. Every incident needs a short postmortem entry within the next working cycle.
2. The postmortem must capture:
   - customer-visible impact
   - start and end timestamps
   - primary trace ids and run ids used during triage
   - root cause
   - mitigation applied
   - follow-up work with explicit owner
3. If the issue was detected through degraded-provider or SLI alerts, include the exact alert card and threshold that fired.
4. If a manual config or policy change helped recovery, link the related annotation or audit event.
5. Follow-up items should land back in `docs/plans/PHASE2_EXECUTION_PLAN.md` or the current execution queue before the postmortem is considered complete.

## Notes
- `/admin/observability` is intentionally tenant-scoped by default.
- platform admins can switch tenant scope; tenant admins should remain on their own tenant.
- runbook links in alert payloads depend on the anchor ids in this file.
