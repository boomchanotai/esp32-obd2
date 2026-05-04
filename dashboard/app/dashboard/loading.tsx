import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-8 p-4 sm:p-6">
      <div className="space-y-2">
        <div className="h-8 w-40 rounded-md bg-muted" />
        <div className="h-4 max-w-md rounded-md bg-muted" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(240px,280px)_1fr]">
        <Card>
          <CardHeader>
            <div className="h-5 w-24 rounded bg-muted" />
            <div className="h-3 w-full rounded bg-muted" />
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="h-10 rounded-md bg-muted" />
            <div className="h-10 rounded-md bg-muted" />
          </CardContent>
        </Card>
        <div className="space-y-4">
          <div className="h-40 rounded-xl bg-muted" />
          <div className="h-72 rounded-xl bg-muted" />
        </div>
      </div>
    </div>
  );
}
