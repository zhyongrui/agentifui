'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useI18n } from './i18n-provider';

type MainSectionNavProps = {
  showAdminPreview?: boolean;
  showSecurity?: boolean;
};

type NavItem = {
  href: string;
  label: string;
  matchPrefix: string;
};

function isActivePath(pathname: string, item: NavItem) {
  return pathname === item.href || pathname.startsWith(`${item.matchPrefix}/`);
}

export function MainSectionNav({
  showAdminPreview = false,
  showSecurity = false,
}: MainSectionNavProps) {
  const pathname = usePathname();
  const { messages } = useI18n();
  const items: NavItem[] = [
    {
      href: '/apps',
      label: messages.mainNav.appsWorkspace,
      matchPrefix: '/apps',
    },
    {
      href: '/chat',
      label: messages.mainNav.chatHistory,
      matchPrefix: '/chat',
    },
    {
      href: '/settings/profile',
      label: messages.mainNav.profile,
      matchPrefix: '/settings/profile',
    },
  ];

  if (showSecurity) {
    items.push({
      href: '/settings/security',
      label: messages.mainNav.securityMfa,
      matchPrefix: '/settings/security',
    });
  }

  if (showAdminPreview) {
    items.push({
      href: '/admin/users',
      label: messages.mainNav.adminPreview,
      matchPrefix: '/admin',
    });
  }

  return (
    <nav aria-label={messages.mainNav.ariaLabel} className="page-nav">
      {items.map(item => {
        const isActive = isActivePath(pathname, item);

        return (
          <Link
            aria-current={isActive ? 'page' : undefined}
            className={`page-nav-link${isActive ? ' is-active' : ''}`}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
