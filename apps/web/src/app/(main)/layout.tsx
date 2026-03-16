'use client';

import type { ReactNode } from 'react';

import { LanguageSwitcher } from '../../components/language-switcher';

type MainLayoutProps = {
  children: ReactNode;
};

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <main className="shell shell-main">
      <section className="panel panel-main stack">
        <div className="layout-toolbar">
          <LanguageSwitcher />
        </div>
        {children}
      </section>
    </main>
  );
}
