"use server";

import type { components } from "@/api/schema";
import { client } from "@/lib/client";
import { unwrapApi } from "@/lib/unwrap-api";

export type Trip = components["schemas"]["models.Trip"];

export async function listDeviceTrips(
  deviceId: string,
  limit?: number,
): Promise<Trip[]> {
  return unwrapApi(
    client.GET("/devices/{id}/trips", {
      params: {
        path: { id: deviceId },
        query: limit != null ? { limit } : undefined,
      },
      cache: "no-store",
    }),
  );
}
