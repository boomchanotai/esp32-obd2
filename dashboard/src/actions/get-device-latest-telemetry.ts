"use server";

import type { TelemetryRow } from "@/types";
import { getApiBaseUrl } from "./api-origin";

export type GetDeviceLatestTelemetryInput = {
  deviceId: string;
};

export type GetDeviceLatestTelemetryResult = TelemetryRow | null;

export async function getDeviceLatestTelemetry(
  input: GetDeviceLatestTelemetryInput,
): Promise<GetDeviceLatestTelemetryResult> {
  const path = `/api/devices/${encodeURIComponent(input.deviceId)}/latest`;
  const r = await fetch(`${getApiBaseUrl()}${path}`, { cache: "no-store" });
  if (r.status === 404) {
    return null;
  }
  if (!r.ok) {
    throw new Error(r.statusText || String(r.status));
  }
  return r.json() as Promise<TelemetryRow>;
}
