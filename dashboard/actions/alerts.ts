"use server";

import type { components } from "@/api/schema";
import { client } from "@/lib/client";
import { unwrapApi } from "@/lib/unwrap-api";

export type Alert = components["schemas"]["models.Alert"];

export async function listDeviceAlerts(
  deviceId: string,
  limit?: number,
): Promise<Alert[]> {
  return unwrapApi(
    client.GET("/devices/{id}/alerts", {
      params: {
        path: { id: deviceId },
        query: limit != null ? { limit } : undefined,
      },
    }),
  );
}
