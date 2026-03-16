'use client';

import type { ReactNode } from 'react';

import { AdminSectionNav } from '../../components/admin-section-nav';
import { LanguageSwitcher } from '../../components/language-switcher';
import { MainSectionNav } from '../../components/main-section-nav';
import { useI18n } from '../../components/i18n-provider';

type AdminLayoutProps = {
  children: ReactNode;
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { messages } = useI18n();

  return (
    <main className="shell shell-main">
      <section className="panel panel-main stack">
        <div className="layout-toolbar">
          <LanguageSwitcher />
        </div>
        <MainSectionNav showAdminPreview showSecurity />
        <AdminSectionNav />
        <span className="eyebrow">{messages.adminNav.eyebrow}</span>
        {children}
      </section>
    </main>
  );
}
