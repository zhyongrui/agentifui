# System Overview

## Request Flow
1. Web routes through same-origin `/api/gateway/*`.
2. Gateway authenticates the session and resolves tenant/group/app context.
3. Workspace services persist conversations, runs, artifacts, shares, comments, and governance state.
4. Runtime services handle provider routing, retrieval, tool execution, and degraded fallbacks.
5. Audit, billing, and observability services capture side effects for admin review.

## Main Boundaries
- Auth: session, SSO, MFA, pending review, break-glass
- Workspace: apps, preferences, launches, conversations, runs, HITL, artifacts, comments
- Admin: users, groups, apps, identity, billing, audit, connectors, workflows
- Ops: evals, backup/restore, deployment smoke, public QA, docs continuity

## Persistence Shapes
- Relational tables hold tenant/user/group/app metadata and run-linked state
- JSON columns are still present on some older surfaces and should be normalized carefully
- Cross-table integrity matters most for `conversations`, `runs`, `artifacts`, `shares`, `audit_events`

## Diagram
```text
Web UI -> /api/gateway -> Gateway Routes
Gateway Routes -> Auth / Admin / Workspace Services
Workspace Services -> DB + File Storage + Runtime + Knowledge + Tool Registry
Admin / Ops Services -> Audit + Billing + Observability + Connectors + Workflows
```
