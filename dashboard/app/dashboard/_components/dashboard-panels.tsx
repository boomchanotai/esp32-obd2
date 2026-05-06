import { listDeviceAlerts } from "@/actions/alerts";
import {
  getLatestTelemetry,
  listTelemetry,
  type TelemetryRow,
} from "@/actions/telemetry";
import { listDeviceTrips } from "@/actions/trips";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { AlertsPanel } from "./alerts-panel";
import type { TelemetryChartPoint } from "./telemetry-chart";
import { TelemetryChart } from "./telemetry-chart";
import { MetricTiles } from "./metric-tiles";
import { TelemetryTable } from "./telemetry-table";
import { TripsTable } from "./trips-table";

function rowsToChartPoints(rows: TelemetryRow[] | null | undefined): TelemetryChartPoint[] {
  return [...(rows ?? [])]
    .filter((r) => r.recorded_at)
    .sort(
      (a, b) =>
        new Date(a.recorded_at!).getTime() -
        new Date(b.recorded_at!).getTime(),
    )
    .map((r) => ({
      ts: new Date(r.recorded_at!).getTime(),
      rpm: Number(r.rpm ?? 0),
      speed: Number(r.speed ?? 0),
    }));
}

type Props = { deviceId: string };

export async function DashboardPanels({ deviceId }: Props) {
  const [latest, telemetry, trips, alerts] = await Promise.all([
    getLatestTelemetry(deviceId).catch(() => null),
    listTelemetry(deviceId, 360).catch(() => []),
    listDeviceTrips(deviceId, 12).catch(() => []),
    listDeviceAlerts(deviceId, 15).catch(() => []),
  ]);

  const telemetryRows = Array.isArray(telemetry) ? telemetry : [];
  const tripRows = Array.isArray(trips) ? trips : [];
  const alertRows = Array.isArray(alerts) ? alerts : [];

  const chartPoints = rowsToChartPoints(telemetryRows);

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      <MetricTiles latest={latest} />
      <Card>
        <CardHeader>
          <CardTitle>RPM & speed</CardTitle>
          <CardDescription>
            Trend from the last {telemetryRows.length} telemetry samples
            (roughly 30 minutes at 5-second publish interval).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TelemetryChart points={chartPoints} />
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:gap-6 xl:grid-cols-2">
        <TelemetryTable rows={telemetryRows} />
        <div className="flex flex-col gap-6">
          <TripsTable trips={tripRows} />
          <AlertsPanel alerts={alertRows} />
        </div>
      </div>
    </div>
  );
}
