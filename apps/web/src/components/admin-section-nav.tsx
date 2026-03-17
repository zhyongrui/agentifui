'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useI18n } from './i18n-provider';
import { fetchAdminContext } from '../lib/admin-client';
import { readAuthSession } from '../lib/auth-session';

export function AdminSectionNav() {
  const pathname = usePathname();
  const { messages } = useI18n();
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

  const sharedItems = [
    {
      href: '/admin/identity',
      label: messages.adminNav.identity,
    },
    {
      href: '/admin/users',
      label: messages.adminNav.users,
    },
    {
      href: '/admin/groups',
      label: messages.adminNav.groups,
    },
    {
      href: '/admin/apps',
      label: messages.adminNav.apps,
    },
    {
      href: '/admin/billing',
      label: messages.adminNav.billing,
    },
    {
      href: '/admin/connectors',
      label: messages.adminNav.connectors,
    },
    {
      href: '/admin/sources',
      label: messages.adminNav.sources,
    },
    {
      href: '/admin/workflows',
      label: messages.adminNav.workflows,
    },
    {
      href: '/admin/audit',
      label: messages.adminNav.audit,
    },
  ];

  const items = canReadPlatformAdmin
    ? [
        {
          href: '/admin/tenants',
          label: messages.adminNav.tenants,
        },
        ...sharedItems,
      ]
    : sharedItems;

  return (
    <nav aria-label={messages.adminNav.ariaLabel} className="page-nav">
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
