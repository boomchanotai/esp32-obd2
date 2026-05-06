import { listDevices } from "@/actions/devices";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { DashboardLiveRefresh } from "./_components/dashboard-live-refresh";
import { DashboardPanels } from "./_components/dashboard-panels";
import { DeviceSidebar } from "./_components/device-sidebar";

type Search = Promise<{ device?: string }>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const { device: deviceParam } = await searchParams;
  const devicesRaw = await listDevices();
  const devices = Array.isArray(devicesRaw) ? devicesRaw : [];

  const selectedId =
    deviceParam && devices.some((d) => d.id === deviceParam)
      ? deviceParam
      : devices[0]?.id;

  const current = devices.find((d) => d.id === selectedId);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-3 pb-10 sm:space-y-8 sm:p-6 sm:pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Choose a device to view live telemetry, RPM/speed trend, trip history,
          and alerts. Panels refresh every few seconds while you stay on this page.
        </p>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(240px,280px)_1fr] lg:items-start">
        <DeviceSidebar devices={devices} selectedId={selectedId} />
        <div className="min-w-0 space-y-4">
          {selectedId ? (
            <>
              {current ? (
                <p className="min-w-0 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {current.name || current.device_code}
                  </span>
                  {current.id ? (
                    <span className="ml-2 block break-all font-mono text-xs sm:inline">
                      {current.id}
                    </span>
                  ) : null}
                </p>
              ) : null}
              <DashboardLiveRefresh />
              <DashboardPanels deviceId={selectedId} />
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>No devices</CardTitle>
                <CardDescription>
                  Register at least one device via the API to use the dashboard.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
