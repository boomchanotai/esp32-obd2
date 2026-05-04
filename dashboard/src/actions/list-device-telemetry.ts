"use server";

import type { TelemetryRow } from "@/types";
import { fetchApiJson } from "./api-origin";

export type ListDeviceTelemetryInput = {
  deviceId: string;
  /** Passed as query; backend clamps to 1–500. */
  limit?: number;
};

export type ListDeviceTelemetryResult = TelemetryRow[];

export async function listDeviceTelemetry(
  input: ListDeviceTelemetryInput,
): Promise<ListDeviceTelemetryResult> {
  const limit = input.limit ?? 60;
  const q = new URLSearchParams({ limit: String(limit) });
  const path = `/api/devices/${encodeURIComponent(input.deviceId)}/telemetry?${q.toString()}`;
  return fetchApiJson<ListDeviceTelemetryResult>(path);
}
