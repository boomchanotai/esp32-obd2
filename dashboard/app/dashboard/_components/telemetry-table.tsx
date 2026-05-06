import type { TelemetryRow } from "@/actions/telemetry";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = { rows: TelemetryRow[] };

export function TelemetryTable({ rows }: Props) {
  const list = Array.isArray(rows) ? rows : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent telemetry</CardTitle>
        <CardDescription>Latest ingested rows (newest first in API).</CardDescription>
      </CardHeader>
      <CardContent className="max-h-[360px] overflow-auto px-0 sm:px-4">
        {list.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground sm:px-0">No rows yet.</p>
        ) : (
          <div className="w-full overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead className="text-right">RPM</TableHead>
                <TableHead className="text-right">Speed</TableHead>
                <TableHead className="hidden text-right sm:table-cell">°C</TableHead>
                <TableHead className="hidden text-right md:table-cell">V</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Oil °C</TableHead>
                <TableHead className="hidden text-right lg:table-cell">MAP</TableHead>
                <TableHead className="hidden text-right xl:table-cell">MAF</TableHead>
                <TableHead className="hidden text-right xl:table-cell">Fuel %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((row) => (
                <TableRow key={row.id ?? `${row.recorded_at}-${row.rpm}`}>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                    {row.recorded_at
                      ? new Date(row.recorded_at).toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {row.rpm ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {row.speed ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-right font-mono text-sm sm:table-cell">
                    {row.coolant_temp ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-right font-mono text-sm md:table-cell">
                    {row.battery_voltage ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-right font-mono text-sm lg:table-cell">
                    {row.engine_oil_temp ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-right font-mono text-sm lg:table-cell">
                    {row.intake_map_kpa ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-right font-mono text-sm xl:table-cell">
                    {row.maf_air_flow_rate ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-right font-mono text-sm xl:table-cell">
                    {row.fuel_tank_level ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
