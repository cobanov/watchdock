import { useMemo, useState } from "react"
import { SearchIcon, TriangleAlertIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
  shortImage,
  uiStatus,
  type Container,
  type HostStatus,
  type StatusKind,
} from "@/lib/api"
import type { FleetCounts } from "@/components/app-sidebar"

interface ContainersViewProps {
  containers: Container[] | null
  counts: FleetCounts
  hosts: HostStatus[]
  showHostColumn: boolean
  error: string | null
}

function StatCard({
  label,
  value,
  alert,
}: {
  label: string
  value: number
  alert?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn(
            "text-2xl font-semibold tabular-nums lg:text-3xl",
            alert && value > 0 && "text-alert",
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  )
}

const dotClass: Record<StatusKind, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  alert: "bg-alert",
  idle: "bg-idle",
}

function StatusBadge({ kind, label }: { kind: StatusKind; label: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5", kind === "alert" && "border-alert/40 text-alert")}>
      <span className={cn("size-1.5 rounded-full", dotClass[kind], kind === "alert" && "animate-pulse")} />
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </Badge>
  )
}

export function ContainersView({
  containers,
  counts,
  hosts,
  showHostColumn,
  error,
}: ContainersViewProps) {
  const [filter, setFilter] = useState("")
  const offlineHosts = hosts.filter((h) => !h.ok && !h.disabled)

  const filtered = useMemo(() => {
    if (!containers) return []
    const q = filter.trim().toLowerCase()
    if (!q) return containers
    return containers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q),
    )
  }, [containers, filter])

  return (
    <>
      {offlineHosts.map((h) => (
        <Alert key={h.alias} variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Host “{h.alias}” is unreachable</AlertTitle>
          <AlertDescription className="break-all">{h.error}</AlertDescription>
        </Alert>
      ))}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Running" value={counts.running} />
        <StatCard label="Unhealthy" value={counts.unhealthy} alert />
        <StatCard label="Stopped" value={counts.stopped} />
        <StatCard label="Total" value={counts.total} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fleet</CardTitle>
          <CardDescription>
            Every container dockwatch is currently watching.
          </CardDescription>
          <CardAction>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter containers…"
                className="h-9 w-56 pl-8"
              />
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="px-0">
          {error ? (
            <div className="px-6 py-8 text-sm text-alert">
              Docker daemon unreachable — {error}
            </div>
          ) : containers === null ? (
            <div className="flex flex-col gap-3 px-6 py-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-2/3" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              {containers.length === 0
                ? "No containers on this daemon."
                : "Nothing matches the filter."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-36 pl-6">Status</TableHead>
                  <TableHead>Name</TableHead>
                  {showHostColumn && <TableHead>Host</TableHead>}
                  <TableHead>Image</TableHead>
                  <TableHead className="pr-6 text-right">Uptime</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const s = uiStatus(c)
                  return (
                    <TableRow key={`${c.host}/${c.id}`} className={cn(c.ignored && "opacity-45")}>
                      <TableCell className="pl-6">
                        <StatusBadge kind={s.kind} label={s.label} />
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-[13px] font-medium">
                            {c.name}
                          </span>
                          {c.ignored && (
                            <Badge variant="secondary" className="text-muted-foreground">
                              Ignored
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      {showHostColumn && (
                        <TableCell>
                          <Badge variant="secondary">{c.host}</Badge>
                        </TableCell>
                      )}
                      <TableCell className="max-w-64 truncate font-mono text-xs text-muted-foreground">
                        {shortImage(c.image)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap pr-6 text-right text-xs text-muted-foreground">
                        {c.status}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
