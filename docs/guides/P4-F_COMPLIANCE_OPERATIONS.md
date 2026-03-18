# P4-F Compliance Operations

This guide defines the operating procedure for policy exceptions, legal-hold review, evidence export, and compliance escalations.

## 1. Daily Operator Loop

1. Review `/admin/policy` for new blocked or flagged evaluations.
2. Review `/admin/audit` with severity and detector filters for tenant activity spikes.
3. Confirm active policy exceptions still have a valid business owner and expiry.
4. Confirm legal-hold tenants have not accumulated accidental delete or prune requests.

## 2. Policy Exception Workflow

- Create exceptions only with:
  - a clear label
  - a written note
  - the narrowest applicable scope: `runtime`, `app`, `group`, then `tenant`
- Prefer shorter expiries for `secret` and `pii` exceptions.
- Every extension must add a new review note.
- Reuse existing exceptions only when the detector, scope, and business reason are the same.

## 3. Scope Selection Rules

- `tenant`: use only for broad policy carve-outs approved by tenant leadership.
- `group`: use when a specific working group owns the exception.
- `app`: use when the exception should stay inside one workspace app.
- `runtime`: use when the exception is only safe on a constrained provider/runtime path.

## 4. Evidence Export Workflow

1. Start with `/admin/audit` filtered by tenant, trace, detector, and date range.
2. Export masked JSON or CSV first.
3. Export an evidence bundle when the review needs cross-event trace summaries.
4. Use raw payload mode only when masked output is insufficient.
5. Record the export reason, file location, and deletion deadline.

## 5. Legal Hold Rules

- Do not delete or archive around a legal-hold tenant to work around blocked operations.
- Treat `workspace.conversation.delete_blocked` as expected evidence, not noise.
- Backup and restore drills must preserve governance state for held tenants.
- If a hold must be removed, capture the approving actor and exact timestamp in the audit trail.

## 6. Incident / Compliance Escalation

Escalate immediately when:

- repeated critical detector matches appear across multiple runs
- exports are blocked for a tenant that is claiming an outage or release regression
- a shared link or screenshot leaks material that should have been masked
- a legal-hold tenant shows unexpected cleanup or delete attempts

## 7. Required Records

For each exception review or compliance action, capture:

- tenant id
- operator id
- reason for the action
- affected scope and scope id
- detector type
- expiry or follow-up date
- trace id / run id when applicable

## 8. Current Product Entry Points

- `/admin/policy`: simulation, exception create/review, recent evaluation summaries
- `/admin/audit`: severity, detector, actor, entity, and trace filtering
- `/admin/audit/evidence-bundle`: trace-oriented evidence export
- `/admin/identity`: governance policy-pack controls and legal-hold state

