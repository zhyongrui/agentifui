import type { PropsWithChildren } from 'react';

type SectionCardProps = PropsWithChildren<{
  title: string;
  description?: string;
}>;

export function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <section
      style={{
        display: 'grid',
        gap: '0.75rem',
        padding: '1.5rem',
        borderRadius: '1rem',
        border: '1px solid rgba(30, 27, 22, 0.14)',
        background: 'rgba(255, 252, 246, 0.92)',
      }}
    >
      <header style={{ display: 'grid', gap: '0.25rem' }}>
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </header>
      {children}
    </section>
  );
}
