'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import {
  getProtectedRedirect,
  readAuthSession,
  type AuthSession,
  type ProtectedPath,
} from '../lib/auth-session';

type ProtectedPageProps = {
  path: ProtectedPath;
  children: (session: AuthSession) => ReactNode;
  loadingMessage?: string;
};

export function ProtectedPage({
  path,
  children,
  loadingMessage = 'Checking your session...',
}: ProtectedPageProps) {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);

  useEffect(() => {
    const nextSession = readAuthSession(window.sessionStorage);
    const redirectTarget = getProtectedRedirect(path, nextSession);

    if (redirectTarget) {
      router.replace(redirectTarget);
      setSession(null);
      return;
    }

    setSession(nextSession);
  }, [path, router]);

  if (session === undefined) {
    return <p className="lead">{loadingMessage}</p>;
  }

  if (!session) {
    return null;
  }

  return <>{children(session)}</>;
}
