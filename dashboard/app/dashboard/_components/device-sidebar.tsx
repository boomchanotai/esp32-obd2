import Link from "next/link";

import type { Device } from "@/actions/devices";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  devices: Device[];
  selectedId: string | undefined;
};

export function DeviceSidebar({ devices, selectedId }: Props) {
  const list = Array.isArray(devices) ? devices : [];
  if (list.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Devices</CardTitle>
          <CardDescription>
            No devices found. Run the API and register a device, or set{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              API_URL
            </code>{" "}
            (default{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              http://127.0.0.1:8080/api
            </code>
            ).
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Devices</CardTitle>
        <CardDescription>Select a unit to view telemetry and history.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {list.map((d) => {
          const id = d.id ?? "";
          const active = selectedId === id;
          const label = d.name?.trim() || d.device_code || id.slice(0, 8);
          return (
            <Link
              key={id}
              href={`/dashboard?device=${encodeURIComponent(id)}`}
              className={cn(
                buttonVariants({
                  variant: active ? "secondary" : "ghost",
                  size: "sm",
                }),
                "h-auto w-full min-w-0 flex-col items-start gap-0.5 py-2.5",
              )}
            >
              <span className="w-full truncate text-left font-medium">{label}</span>
              {d.vehicle_name ? (
                <span className="w-full truncate text-left text-xs font-normal text-muted-foreground">
                  {d.vehicle_name}
                </span>
              ) : null}
              {d.vehicle_plate ? (
                <span className="w-full truncate text-left font-mono text-[11px] font-normal text-muted-foreground">
                  {d.vehicle_plate}
                </span>
              ) : null}
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
