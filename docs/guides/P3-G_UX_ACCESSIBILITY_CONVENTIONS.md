# `P3-G` UX, Accessibility, And Device Coverage Notes

## Keyboard Audit

Audited surfaces:

- auth: `/login`, `/register`
- workspace: `/apps`, `/chat`, `/chat/[conversationId]`
- shared: `/chat/shared/[shareId]`, `/chat/artifacts/[artifactId]`
- admin: `/admin/audit`, `/admin/identity`, `/admin/tenants`, `/admin/sources`

Resolved gaps:

- added skip-link navigation to `#main-content`
- added visible `:focus-visible` treatment for links, buttons, inputs, selects, and textareas
- preserved native button/input semantics for message actions, feedback, comments, and admin forms
- made page-nav horizontally scrollable instead of clipping on narrow layouts

## Screen Reader Semantics

- transcript surface now exposes a log-style region for live assistant updates
- transcript action buttons include explicit labels
- artifact cards and artifact preview tables expose named regions
- HITL cards expose labeled action containers and explicit approve/reject/cancel controls
- comment threads expose labeled sections and list semantics

## Mobile And Tablet Rules

- `960px` breakpoint:
  - admin grids collapse to one column
  - run replay list/detail stack vertically
  - nav pills become horizontally scrollable
- `720px` breakpoint:
  - shell padding and panel chrome shrink
  - composer height reduces
  - metadata rows, comment headers, tool cards, and artifact headers stack vertically
- transcript bubbles should never rely on fixed width on narrow viewports

## Loading And Empty States

- use `SectionSkeleton` for:
  - conversation loading
  - shared transcript loading
  - artifact preview loading
  - admin analytics loading
- use `EmptyState` for:
  - first-run transcript
  - no run replay selected
  - no matching audit events
  - no matching knowledge sources

## Long Content Rules

- transcript paragraphs must allow `overflow-wrap: anywhere`
- markdown tables must scroll horizontally instead of forcing viewport overflow
- code blocks and artifact payloads must preserve content while remaining scrollable
- user bubbles must expand to full width on narrow screens

## Upload UX

- attachment upload is sequential and cancellable
- progress is file-count based, not byte-accurate
- partial success is preserved if cancellation happens after some files have already been stored

## Localization Hooks

- keep `zh-CN` as the default locale
- maintain scope tags through `data-i18n-scope` on auth, workspace, and admin shells
- update `translationScopes` in `apps/web/src/lib/i18n.ts` whenever a new surface becomes user-visible
- when a new feature ships with English-only strings, record the fallback in the dev log and add the missing Chinese copy in the next UI pass

## Browser Coverage

- maintain at least one narrow-viewport browser smoke for chat
- maintain one tablet-landscape browser smoke for admin or history layouts
- keep selectors locale-aware; do not hardcode English-only text

## Consistency Rules For Future Sessions

- default to Chinese user-visible copy unless a surface is intentionally bilingual
- prefer existing shell, panel, notice, and empty-state styles before inventing a new treatment
- route all persisted read states through the same workspace/admin boundaries used by replay and audit
- if a new temporary public QA URL is created, record it with the backing ports and accounts in the dev log
