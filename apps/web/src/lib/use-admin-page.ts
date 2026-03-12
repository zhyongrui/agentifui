'use client';

import type { AdminErrorResponse } from '@agentifui/shared/admin';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { clearAuthSession } from './auth-session';
import { useProtectedSession } from './use-protected-session';

type AdminSuccessResponse<TData> = {
  ok: true;
  data: TData;
};

export function useAdminPageData<TData>(
  loadData: (sessionToken: string) => Promise<AdminSuccessResponse<TData> | AdminErrorResponse>
) {
  const router = useRouter();
  const { session, isLoading: isSessionLoading } = useProtectedSession('/admin');
  const [data, setData] = useState<TData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    if (!session) {
      setData(null);
      setError(null);
      setIsDataLoading(false);
      return;
    }

    let isCancelled = false;

    setIsDataLoading(true);
    setError(null);

    loadData(session.sessionToken)
      .then(result => {
        if (isCancelled) {
          return;
        }

        if (!result.ok) {
          setData(null);

          if (result.error.code === 'ADMIN_UNAUTHORIZED') {
            clearAuthSession(window.sessionStorage);
            router.replace('/login');
            return;
          }

          setError(result.error.message);
          return;
        }

        setData(result.data);
      })
      .catch(() => {
        if (!isCancelled) {
          setData(null);
          setError('Admin workspace 加载失败，请稍后重试。');
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsDataLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [loadData, reloadVersion, router, session]);

  return {
    session,
    data,
    error,
    isLoading: isSessionLoading || isDataLoading,
    reload() {
      setReloadVersion(currentValue => currentValue + 1);
    },
  };
}
