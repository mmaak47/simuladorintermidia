'use client';

import { useEffect } from 'react';
import { DeploymentVersionGuard } from '@/components/DeploymentVersionGuard';
import { usePointStore } from '@/store/point-store';

/** Client-side providers + store initialization */
export function Providers({ children }: { children: React.ReactNode }) {
  const fetchPoints = usePointStore((s) => s.fetchPoints);

  useEffect(() => {
    fetchPoints();
  }, [fetchPoints]);

  return (
    <>
      <DeploymentVersionGuard />
      {children}
    </>
  );
}
