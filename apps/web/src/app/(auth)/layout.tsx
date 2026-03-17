'use client';

import type { ReactNode } from 'react';

import { LanguageSwitcher } from '../../components/language-switcher';

type AuthLayoutProps = {
  children: ReactNode;
};

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main
      className="shell shell-auth"
      data-i18n-scope="auth-shell"
      id="main-content"
      tabIndex={-1}
    >
      <div className="auth-layout stack">
        <div className="layout-toolbar">
          <LanguageSwitcher />
        </div>
        {children}
      </div>
    </main>
  );
}
