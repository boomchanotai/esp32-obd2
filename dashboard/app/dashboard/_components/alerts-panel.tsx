import type { Alert } from "@/actions/alerts";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = { alerts: Alert[] };

function severityVariant(
  severity: string | undefined,
): "default" | "secondary" | "destructive" | "outline" {
  const s = (severity ?? "info").toLowerCase();
  if (s === "critical" || s === "error") return "destructive";
  if (s === "warning") return "secondary";
  return "outline";
}

export function AlertsPanel({ alerts }: Props) {
  const list = Array.isArray(alerts) ? alerts : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Alerts</CardTitle>
        <CardDescription>Recent alerts for this device.</CardDescription>
      </CardHeader>
      <CardContent className="max-h-[260px] space-y-3 overflow-auto">
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No alerts.</p>
        ) : (
          list.map((a) => (
            <div
              key={a.id ?? `${a.occurred_at}-${a.message}`}
              className="rounded-lg border bg-card p-3 text-sm shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{a.alert_type ?? "Alert"}</span>
                <Badge variant={severityVariant(a.severity)}>
                  {a.severity ?? "info"}
                </Badge>
              </div>
              <time className="mt-1 block font-mono text-xs text-muted-foreground">
                {a.occurred_at
                  ? new Date(a.occurred_at).toLocaleString()
                  : ""}
              </time>
              {a.message ? (
                <p className="mt-2 text-sm leading-snug text-foreground">{a.message}</p>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
