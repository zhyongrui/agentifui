'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  getProtectedRedirect,
  readAuthSession,
  type AuthSession,
  type ProtectedPath,
} from './auth-session';

export function useProtectedSession(path: ProtectedPath) {
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

  return {
    session,
    isLoading: session === undefined,
  };
}
