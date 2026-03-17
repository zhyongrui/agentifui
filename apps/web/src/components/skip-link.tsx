'use client';

import { useI18n } from './i18n-provider';

export function SkipLink() {
  const { locale } = useI18n();

  return (
    <a className="skip-link" href="#main-content">
      {locale === 'zh-CN' ? '跳到主要内容' : 'Skip to main content'}
    </a>
  );
}
