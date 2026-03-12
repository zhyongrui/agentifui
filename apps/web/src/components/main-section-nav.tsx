'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
  const items: NavItem[] = [
    {
      href: '/apps',
      label: 'Apps workspace',
      matchPrefix: '/apps',
    },
    {
      href: '/settings/profile',
      label: 'Profile',
      matchPrefix: '/settings/profile',
    },
  ];

  if (showSecurity) {
    items.push({
      href: '/settings/security',
      label: 'Security / MFA',
      matchPrefix: '/settings/security',
    });
  }

  if (showAdminPreview) {
    items.push({
      href: '/admin/users',
      label: 'Admin preview',
      matchPrefix: '/admin',
    });
  }

  return (
    <nav aria-label="Main sections" className="page-nav">
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
