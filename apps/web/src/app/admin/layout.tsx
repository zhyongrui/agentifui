import type { ReactNode } from 'react';

type AdminLayoutProps = {
  children: ReactNode;
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <main className="shell">
      <section className="panel stack">
        <span className="eyebrow">Admin</span>
        {children}
      </section>
    </main>
  );
}
