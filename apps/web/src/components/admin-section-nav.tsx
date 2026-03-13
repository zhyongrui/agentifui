'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { fetchAdminContext } from '../lib/admin-client';
import { readAuthSession } from '../lib/auth-session';

const SHARED_ADMIN_ITEMS = [
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
  const [canReadPlatformAdmin, setCanReadPlatformAdmin] = useState(false);

  useEffect(() => {
    const session = readAuthSession(window.sessionStorage);

    if (!session) {
      setCanReadPlatformAdmin(false);
      return;
    }

    let isCancelled = false;

    fetchAdminContext(session.sessionToken)
      .then(result => {
        if (isCancelled || !('ok' in result) || !result.ok) {
          return;
        }

        setCanReadPlatformAdmin(result.data.capabilities.canReadPlatformAdmin);
      })
      .catch(() => {
        if (!isCancelled) {
          setCanReadPlatformAdmin(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  const items = canReadPlatformAdmin
    ? [
        {
          href: '/admin/tenants',
          label: 'Tenants',
        },
        ...SHARED_ADMIN_ITEMS,
      ]
    : SHARED_ADMIN_ITEMS;

  return (
    <nav aria-label="Admin sections" className="page-nav">
      {items.map(item => (
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
