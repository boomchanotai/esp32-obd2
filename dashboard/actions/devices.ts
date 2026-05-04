"use server";

import type { components } from "@/api/schema";
import { client } from "@/lib/client";
import { unwrapApi } from "@/lib/unwrap-api";

export type Device = components["schemas"]["models.Device"];
export type CreateDeviceBody = components["schemas"]["handlers.CreateDeviceBody"];

export async function listDevices(): Promise<Device[]> {
  return unwrapApi(client.GET("/devices", {}));
}

export async function getDevice(id: string): Promise<Device> {
  return unwrapApi(
    client.GET("/devices/{id}", {
      params: { path: { id } },
    }),
  );
}

export async function createDevice(
  body: CreateDeviceBody,
): Promise<Device> {
  return unwrapApi(
    client.POST("/devices", {
      body,
    }),
  );
}
