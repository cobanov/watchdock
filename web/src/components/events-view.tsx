import { useEffect, useMemo, useState } from "react"
import { SearchIcon } from "lucide-react"
import { StatusDot } from "@/components/status-dot"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  fetchEvents,
  type ContainerEvent,
  type EventKind,
  type StatusKind,
} from "@/lib/api"

const POLL_INTERVAL_MS = 5000

const kindMeta: Record<EventKind, { label: string; status: StatusKind }> = {
  crashed: { label: "Crashed", status: "alert" },
  stopped: { label: "Stopped", status: "idle" },
  started: { label: "Started", status: "ok" },
  unhealthy: { label: "Unhealthy", status: "alert" },
  healthy: { label: "Healthy", status: "ok" },
}

function EventBadge({ kind }: { kind: EventKind }) {
  const meta = kindMeta[kind] ?? { label: kind, status: "idle" as StatusKind }
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5", meta.status === "alert" && "border-alert/30 text-alert")}
    >
      <StatusDot kind={meta.status} className="!size-1.5" />
      {meta.label}
    </Badge>
  )
}

function formatTime(t: number): string {
  const d = new Date(t * 1000)
  const time = d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  if (d.toDateString() === new Date().toDateString()) return time
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`
}

export function EventsView() {
  const [events, setEvents] = useState<ContainerEvent[] | null>(null)
  const [filter, setFilter] = useState("")

  useEffect(() => {
    const load = () => fetchEvents().then(setEvents).catch(() => {})
    load()
    const timer = setInterval(load, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  const query = filter.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!events) return []
    if (!query) return events
    return events.filter(
      (e) =>
        e.container.toLowerCase().includes(query) ||
        e.host.toLowerCase().includes(query) ||
        e.kind.includes(query),
    )
  }, [events, query])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Event log</h2>
          <p className="text-sm text-muted-foreground">
            Container starts, stops, crashes and health changes across all
            hosts, newest first.
          </p>
        </div>
        <div className="relative w-full max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by container, host or event…"
            className="pl-8"
          />
        </div>
      </div>

      {events === null ? (
        <Card>
          <CardContent className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {query
              ? "No events match the filter."
              : "No events yet — container starts, stops and crashes will appear here."}
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-32 pl-4">Time</TableHead>
                  <TableHead className="w-32">Event</TableHead>
                  <TableHead>Container</TableHead>
                  <TableHead className="hidden w-28 sm:table-cell">Host</TableHead>
                  <TableHead className="hidden pr-4 md:table-cell">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e, i) => (
                  <TableRow key={`${e.t}-${e.host}-${e.container}-${i}`}>
                    <TableCell className="pl-4 text-xs tabular-nums text-muted-foreground">
                      {formatTime(e.t)}
                    </TableCell>
                    <TableCell>
                      <EventBadge kind={e.kind} />
                    </TableCell>
                    <TableCell className="max-w-36 truncate font-medium sm:max-w-none">
                      {e.container}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                      {e.host}
                    </TableCell>
                    <TableCell className="hidden pr-4 text-xs text-muted-foreground md:table-cell">
                      {e.detail ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
