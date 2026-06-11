import { CheckCircle2Icon, TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { HistoryPoint } from "@/lib/api"
import type { FleetCounts } from "@/components/app-sidebar"

// Latest sample from roughly one hour ago (or the oldest one we have).
function reference(history: HistoryPoint[]): HistoryPoint | null {
  if (history.length < 2) return null
  const cutoff = Date.now() / 1000 - 3600
  const older = history.filter((p) => p.t <= cutoff)
  return older.length > 0 ? older[older.length - 1] : history[0]
}

function TrendBadge({ delta, badDirection }: { delta: number; badDirection: 1 | -1 }) {
  if (delta === 0) return null
  const Icon = delta > 0 ? TrendingUpIcon : TrendingDownIcon
  const bad = Math.sign(delta) === badDirection
  return (
    <Badge variant="outline" className={cn(bad && "border-alert/40 text-alert")}>
      <Icon />
      {delta > 0 ? `+${delta}` : delta}
    </Badge>
  )
}

interface SectionCardsProps {
  counts: FleetCounts
  history: HistoryPoint[]
  hostCount: number
}

export function SectionCards({ counts, history, hostCount }: SectionCardsProps) {
  const ref = reference(history)

  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Running</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {counts.running}
          </CardTitle>
          {ref && (
            <CardAction>
              <TrendBadge delta={counts.running - ref.running} badDirection={-1} />
            </CardAction>
          )}
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="text-muted-foreground">
            {ref ? "Compared to one hour ago" : "Collecting history…"}
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Unhealthy</CardDescription>
          <CardTitle
            className={cn(
              "text-2xl font-semibold tabular-nums @[250px]/card:text-3xl",
              counts.unhealthy > 0 && "text-alert",
            )}
          >
            {counts.unhealthy}
          </CardTitle>
          {ref && (
            <CardAction>
              <TrendBadge delta={counts.unhealthy - ref.unhealthy} badDirection={1} />
            </CardAction>
          )}
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          {counts.unhealthy === 0 ? (
            <div className="line-clamp-1 flex items-center gap-2 font-medium">
              All healthchecks passing
              <CheckCircle2Icon className="size-4 text-ok" />
            </div>
          ) : (
            <div className="line-clamp-1 flex items-center gap-2 font-medium text-alert">
              Needs attention
            </div>
          )}
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Stopped</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {counts.stopped}
          </CardTitle>
          {ref && (
            <CardAction>
              <TrendBadge delta={counts.stopped - ref.stopped} badDirection={1} />
            </CardAction>
          )}
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="text-muted-foreground">Exited, created or dead</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {counts.total}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="text-muted-foreground">
            Across {hostCount} host{hostCount === 1 ? "" : "s"}
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
