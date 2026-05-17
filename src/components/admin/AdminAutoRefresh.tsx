'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const REFRESH_INTERVAL_MS = 10_000;

export function AdminAutoRefresh() {
  const router = useRouter();
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    const refreshTimer = setInterval(() => {
      router.refresh();
      setSecondsAgo(0);
    }, REFRESH_INTERVAL_MS);

    const tickTimer = setInterval(() => {
      setSecondsAgo((s) => s + 1);
    }, 1_000);

    return () => {
      clearInterval(refreshTimer);
      clearInterval(tickTimer);
    };
  }, [router]);

  return (
    <span className="text-xs text-[#94a3b8]">
      {secondsAgo === 0 ? 'Updated just now' : `Updated ${secondsAgo}s ago`}
    </span>
  );
}
