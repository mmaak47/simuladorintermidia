'use client';

import { useCallback, useEffect } from 'react';

const CURRENT_VERSION = process.env.NEXT_PUBLIC_DEPLOYMENT_VERSION ?? 'dev';
const VERSION_ENDPOINT = '/api/version';
const VERSION_POLL_MS = 60_000;
const VERSION_RELOAD_KEY = 'dooh:deployment-version-reload';
const ERROR_RECOVERY_KEY = 'dooh:deployment-error-recovery';

type VersionResponse = {
  version?: string;
};

function shouldForceRecovery(message: string) {
  const text = message.toLowerCase();
  return (
    text.includes('failed to find server action') ||
    text.includes('loading chunk') ||
    text.includes('chunkloaderror') ||
    text.includes('failed to fetch dynamically imported module') ||
    text.includes('importing a module script failed')
  );
}

function reloadOnce(storageKey: string, targetVersion: string) {
  if (typeof window === 'undefined') return;
  const alreadyReloaded = window.sessionStorage.getItem(storageKey);
  if (alreadyReloaded === targetVersion) return;
  window.sessionStorage.setItem(storageKey, targetVersion);
  window.location.reload();
}

export function DeploymentVersionGuard() {
  const checkVersion = useCallback(async () => {
    try {
      const response = await fetch(VERSION_ENDPOINT, {
        cache: 'no-store',
        headers: {
          'cache-control': 'no-cache',
        },
      });

      if (!response.ok) return;

      const data = (await response.json()) as VersionResponse;
      const nextVersion = data.version?.trim();
      if (!nextVersion || nextVersion === CURRENT_VERSION) return;

      reloadOnce(VERSION_RELOAD_KEY, nextVersion);
    } catch {
      // Ignore transient network failures. The next visibility/focus check will retry.
    }
  }, []);

  useEffect(() => {
    void checkVersion();

    const intervalId = window.setInterval(() => {
      void checkVersion();
    }, VERSION_POLL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkVersion();
      }
    };

    const handleFocus = () => {
      void checkVersion();
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : '';

      if (!message || !shouldForceRecovery(message)) return;

      void checkVersion().then(() => {
        if (typeof window === 'undefined') return;
        if (window.sessionStorage.getItem(ERROR_RECOVERY_KEY) === CURRENT_VERSION) return;
        reloadOnce(ERROR_RECOVERY_KEY, CURRENT_VERSION);
      });
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [checkVersion]);

  return null;
}