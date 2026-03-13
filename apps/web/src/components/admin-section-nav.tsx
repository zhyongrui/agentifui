'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ADMIN_ITEMS = [
  {
    href: '/admin/tenants',
    label: 'Tenants',
  },
  {
    href: '/admin/users',
    label: 'Users',
  },
  {
    href: '/admin/groups',
    label: 'Groups',
  },
  {
    href: '/admin/apps',
    label: 'Apps',
  },
  {
    href: '/admin/audit',
    label: 'Audit',
  },
];

export function AdminSectionNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="page-nav">
      {ADMIN_ITEMS.map(item => (
        <Link
          aria-current={pathname === item.href ? 'page' : undefined}
          className={`page-nav-link${pathname === item.href ? ' is-active' : ''}`}
          href={item.href}
          key={item.href}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
