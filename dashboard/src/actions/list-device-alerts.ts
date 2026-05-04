"use server";

import type { Alert } from "@/types";
import { fetchApiJson } from "./api-origin";

export type ListDeviceAlertsInput = {
  deviceId: string;
  limit?: number;
};

export type ListDeviceAlertsResult = Alert[];

export async function listDeviceAlerts(
  input: ListDeviceAlertsInput,
): Promise<ListDeviceAlertsResult> {
  const limit = input.limit ?? 20;
  const q = new URLSearchParams({ limit: String(limit) });
  const path = `/api/devices/${encodeURIComponent(input.deviceId)}/alerts?${q.toString()}`;
  return fetchApiJson<ListDeviceAlertsResult>(path);
}
