"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  rpm: {
    label: "RPM",
    color: "var(--chart-1)",
  },
  speed: {
    label: "Speed (km/h)",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export type TelemetryChartPoint = {
  ts: number;
  rpm: number;
  speed: number;
};

type Props = {
  points: TelemetryChartPoint[] | null | undefined;
};

export function TelemetryChart({ points }: Props) {
  const series = points ?? [];
  if (series.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        At least two telemetry samples are required to plot a trend.
      </p>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full sm:h-[300px]">
      <LineChart
        accessibilityLayer
        data={series}
        margin={{ left: 12, right: 12, top: 12, bottom: 8 }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="ts"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(v) =>
            new Date(v).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })
          }
        />
        <YAxis
          yAxisId="rpm"
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v) => `${v}`}
        />
        <YAxis
          yAxisId="speed"
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={36}
          tickFormatter={(v) => `${v}`}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Line
          yAxisId="rpm"
          dataKey="rpm"
          type="monotone"
          stroke="var(--color-rpm)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="speed"
          dataKey="speed"
          type="monotone"
          stroke="var(--color-speed)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
