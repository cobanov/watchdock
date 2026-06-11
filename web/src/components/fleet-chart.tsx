import { useMemo, useState } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { HistoryPoint } from "@/lib/api"

const chartConfig = {
  running: {
    label: "Running",
    color: "var(--primary)",
  },
  unhealthy: {
    label: "Unhealthy",
    color: "var(--alert)",
  },
} satisfies ChartConfig

const RANGES = [
  { value: "1h", label: "Last hour", seconds: 3600 },
  { value: "6h", label: "Last 6 hours", seconds: 6 * 3600 },
  { value: "24h", label: "Last 24 hours", seconds: 24 * 3600 },
] as const

type Range = (typeof RANGES)[number]["value"]

export function FleetChart({ history }: { history: HistoryPoint[] }) {
  const [range, setRange] = useState<Range>("6h")

  const data = useMemo(() => {
    const seconds = RANGES.find((r) => r.value === range)?.seconds ?? 6 * 3600
    const cutoff = Date.now() / 1000 - seconds
    return history
      .filter((p) => p.t >= cutoff)
      .map((p) => ({ ...p, time: p.t * 1000 }))
  }, [history, range])

  const formatTime = (value: number) =>
    new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Container activity</CardTitle>
        <CardDescription>
          Running and unhealthy containers across all hosts
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={range}
            onValueChange={(v) => v && setRange(v as Range)}
            variant="outline"
            className="hidden @[540px]/card:flex"
          >
            {RANGES.map((r) => (
              <ToggleGroupItem key={r.value} value={r.value}>
                {r.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Select value={range} onValueChange={(v) => setRange(v as Range)}>
            <SelectTrigger
              size="sm"
              className="flex w-36 @[540px]/card:hidden"
              aria-label="Select range"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value} className="rounded-lg">
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {data.length < 2 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            Collecting history — the chart fills in as dockwatch keeps watching.
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="fillRunning" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-running)" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="var(--color-running)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="fillUnhealthy" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-unhealthy)" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="var(--color-unhealthy)" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="time"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={48}
                tickFormatter={formatTime}
              />
              <YAxis hide domain={[0, "dataMax + 2"]} allowDecimals={false} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    labelFormatter={(value) => formatTime(value as number)}
                  />
                }
              />
              <Area
                dataKey="running"
                type="monotone"
                fill="url(#fillRunning)"
                stroke="var(--color-running)"
                strokeWidth={2}
              />
              <Area
                dataKey="unhealthy"
                type="monotone"
                fill="url(#fillUnhealthy)"
                stroke="var(--color-unhealthy)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
