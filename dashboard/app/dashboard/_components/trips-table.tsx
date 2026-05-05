import type { Trip } from "@/actions/trips";
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

function formatDuration(sec: number | undefined) {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

type Props = { trips: Trip[] };

export function TripsTable({ trips }: Props) {
  const list = Array.isArray(trips) ? trips : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trips</CardTitle>
        <CardDescription>Recent trips for this device.</CardDescription>
      </CardHeader>
      <CardContent className="max-h-[280px] overflow-auto px-0 sm:px-4">
        {list.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground sm:px-0">
            No trips recorded.
          </p>
        ) : (
          <div className="w-full overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Avg</TableHead>
                <TableHead className="text-right">Max</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                    {t.started_at
                      ? new Date(t.started_at).toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatDuration(t.duration_seconds)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {t.avg_speed != null ? `${t.avg_speed.toFixed(0)} km/h` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {t.max_speed != null ? `${t.max_speed.toFixed(0)} km/h` : "—"}
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
