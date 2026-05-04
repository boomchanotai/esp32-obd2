"use server";

import type { components } from "@/api/schema";
import { client } from "@/lib/client";
import { unwrapApi } from "@/lib/unwrap-api";

export type TelemetryRow = components["schemas"]["models.TelemetryRow"];

export async function getLatestTelemetry(
  deviceId: string,
): Promise<TelemetryRow> {
  return unwrapApi(
    client.GET("/devices/{id}/latest", {
      params: { path: { id: deviceId } },
    }),
  );
}

export async function listTelemetry(
  deviceId: string,
  limit?: number,
): Promise<TelemetryRow[]> {
  return unwrapApi(
    client.GET("/devices/{id}/telemetry", {
      params: {
        path: { id: deviceId },
        query: limit != null ? { limit } : undefined,
      },
    }),
  );
}
