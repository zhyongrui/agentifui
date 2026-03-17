'use client';

import type { ReactNode } from 'react';

import { LanguageSwitcher } from '../../components/language-switcher';

type MainLayoutProps = {
  children: ReactNode;
};

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <main
      className="shell shell-main"
      data-i18n-scope="workspace-shell"
      id="main-content"
      tabIndex={-1}
    >
      <section className="panel panel-main stack">
        <div className="layout-toolbar">
          <LanguageSwitcher />
        </div>
        {children}
      </section>
    </main>
  );
}
