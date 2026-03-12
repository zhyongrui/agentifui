import type { ReactNode } from 'react';

import { MainSectionNav } from '../../components/main-section-nav';

type AdminLayoutProps = {
  children: ReactNode;
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <main className="shell">
      <section className="panel stack">
        <MainSectionNav showAdminPreview showSecurity />
        <span className="eyebrow">Admin</span>
        {children}
      </section>
    </main>
  );
}
