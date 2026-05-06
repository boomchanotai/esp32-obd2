import type { TelemetryRow } from "@/actions/telemetry";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function fmt(n: number | undefined, digits = 0) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

type Props = { latest: TelemetryRow | null };

export function MetricTiles({ latest }: Props) {
  if (!latest) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Latest telemetry</CardTitle>
          <CardDescription>
            No sample yet for this device. Publish MQTT telemetry to populate
            metrics.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <h3 className="text-sm font-medium text-foreground">Latest snapshot</h3>
        <p className="text-xs text-muted-foreground">
          {latest.recorded_at
            ? new Date(latest.recorded_at).toLocaleString()
            : "—"}{" "}
          · DTC {fmt(latest.dtc_count, 0)} · MIL {latest.mil_status ? "on" : "off"}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="RPM" value={fmt(latest.rpm, 0)} />
        <StatCard label="Speed" value={`${fmt(latest.speed, 1)} km/h`} />
        <StatCard label="Coolant" value={`${fmt(latest.coolant_temp, 0)} °C`} />
        <StatCard label="Battery" value={`${fmt(latest.battery_voltage, 1)} V`} />
        <StatCard label="Throttle" value={`${fmt(latest.throttle, 0)} %`} />
        <StatCard label="Load" value={`${fmt(latest.engine_load, 0)} %`} />
        <StatCard label="Oil temp" value={`${fmt(latest.engine_oil_temp, 0)} °C`} />
        <StatCard label="Ambient" value={`${fmt(latest.ambient_air_temp, 0)} °C`} />
        <StatCard label="MAP" value={`${fmt(latest.intake_map_kpa, 0)} kPa`} />
        <StatCard label="MAF" value={`${fmt(latest.maf_air_flow_rate, 1)} g/s`} />
        <StatCard label="Timing" value={`${fmt(latest.timing_advance, 1)} deg`} />
        <StatCard label="Run time" value={`${fmt(latest.engine_runtime_sec, 0)} s`} />
        <StatCard label="Fuel level" value={`${fmt(latest.fuel_tank_level, 0)} %`} />
        <StatCard label="Fuel rate" value={`${fmt(latest.engine_fuel_rate, 1)} L/h`} />
        <StatCard label="Fuel type" value={fmt(latest.fuel_type, 0)} />
        <StatCard
          label="Hybrid battery"
          value={`${fmt(latest.hybrid_battery_remaining_life, 0)} %`}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm">
      <CardHeader className="pb-3">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-mono text-lg tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
