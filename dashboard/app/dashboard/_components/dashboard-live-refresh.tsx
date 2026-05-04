"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const DEFAULT_INTERVAL_MS = 3000;

type Props = { intervalMs?: number };

/**
 * Periodically re-fetches server components on this route so telemetry, chart,
 * and tables stay in sync with the backend without a full navigation.
 */
export function DashboardLiveRefresh({ intervalMs = DEFAULT_INTERVAL_MS }: Props) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
