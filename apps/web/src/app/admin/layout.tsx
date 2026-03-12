import type { ReactNode } from 'react';

import { AdminSectionNav } from '../../components/admin-section-nav';
import { MainSectionNav } from '../../components/main-section-nav';

type AdminLayoutProps = {
  children: ReactNode;
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <main className="shell shell-main">
      <section className="panel panel-main stack">
        <MainSectionNav showAdminPreview showSecurity />
        <AdminSectionNav />
        <span className="eyebrow">Admin</span>
        {children}
      </section>
    </main>
  );
}
