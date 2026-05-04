"use server";

import type { Device } from "@/types";
import { fetchApiJson } from "./api-origin";

export type ListDevicesResult = Device[];

export async function listDevices(): Promise<ListDevicesResult> {
  return fetchApiJson<ListDevicesResult>("/api/devices");
}
