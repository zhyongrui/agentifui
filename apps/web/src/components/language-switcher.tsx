'use client';

import { useI18n } from './i18n-provider';
import type { AppLocale } from '../lib/i18n';

export function LanguageSwitcher() {
  const { locale, setLocale, messages } = useI18n();

  return (
    <label className="language-switcher">
      <span>{messages.language.label}</span>
      <select
        aria-label={messages.language.label}
        onChange={event => setLocale(event.target.value as AppLocale)}
        value={locale}
      >
        <option value="zh-CN">{messages.language.options['zh-CN']}</option>
        <option value="en-US">{messages.language.options['en-US']}</option>
      </select>
    </label>
  );
}
