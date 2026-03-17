import type { ReactNode } from 'react';

export function SectionSkeleton({
  blocks = 4,
  lead,
  title,
}: {
  blocks?: number;
  lead?: string;
  title?: string;
}) {
  return (
    <section aria-busy="true" className="surface-skeleton" aria-live="polite">
      {title ? <span className="sr-only">{title}</span> : null}
      {lead ? <span className="sr-only">{lead}</span> : null}
      {title ? <div className="surface-skeleton-title" /> : null}
      {lead ? <div className="surface-skeleton-lead" /> : null}
      {Array.from({ length: blocks }, (_, index) => (
        <div key={index} className="surface-skeleton-block" />
      ))}
    </section>
  );
}

export function EmptyState({
  actions,
  lead,
  title,
}: {
  actions?: ReactNode;
  lead: string;
  title: string;
}) {
  return (
    <div className="chat-empty-state">
      <strong>{title}</strong>
      <p>{lead}</p>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}
