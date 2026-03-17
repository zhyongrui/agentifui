import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { I18nProvider } from '../components/i18n-provider';
import { SkipLink } from '../components/skip-link';

export const metadata: Metadata = {
  title: 'AgentifUI',
  description: 'AgentifUI greenfield workspace',
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN">
      <body>
        <I18nProvider>
          <SkipLink />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
