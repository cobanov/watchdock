import { useMemo, useState } from "react"
import { SearchIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
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
import { shortImage, statusTextClass, uiStatus, type Container } from "@/lib/api"
import type { FleetCounts } from "@/components/app-sidebar"

interface ContainersViewProps {
  containers: Container[] | null
  counts: FleetCounts
  error: string | null
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: "alert" | "ok"
}) {
  const lit = tone === "alert" && value > 0
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 transition-colors",
        lit && "border-alert/50 shadow-[0_0_18px_-6px_var(--alert)]",
      )}
    >
      <div className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1.5 font-mono text-3xl font-semibold tabular-nums",
          lit && "text-alert",
          tone === "ok" && value > 0 && "text-ok",
        )}
      >
        {value}
      </div>
    </div>
  )
}

export function ContainersView({ containers, counts, error }: ContainersViewProps) {
  const [filter, setFilter] = useState("")

  const filtered = useMemo(() => {
    if (!containers) return []
    const q = filter.trim().toLowerCase()
    if (!q) return containers
    return containers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q),
    )
  }, [containers, filter])

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="running" value={counts.running} tone="ok" />
        <StatTile label="unhealthy" value={counts.unhealthy} tone="alert" />
        <StatTile label="stopped" value={counts.stopped} />
        <StatTile label="total" value={counts.total} />
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {"// fleet"}
          </h2>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filter by name or image"
              className="h-8 w-60 pl-8 font-mono text-xs"
            />
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-3 px-4 py-8 font-mono text-sm text-alert">
            <span className="led led-pulse text-alert" />
            docker daemon unreachable — {error}
          </div>
        ) : containers === null ? (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-10 text-center font-mono text-sm text-muted-foreground">
            {containers.length === 0
              ? "no containers on this daemon"
              : "nothing matches the filter"}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-36 font-mono text-[10px] uppercase tracking-[0.18em]">
                  status
                </TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.18em]">
                  name
                </TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.18em]">
                  image
                </TableHead>
                <TableHead className="text-right font-mono text-[10px] uppercase tracking-[0.18em]">
                  uptime
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const s = uiStatus(c)
                return (
                  <TableRow key={c.id} className={cn(c.ignored && "opacity-45")}>
                    <TableCell>
                      <span
                        className={cn(
                          "flex items-center gap-2 font-mono text-xs",
                          statusTextClass[s.kind],
                        )}
                      >
                        <span className={cn("led", s.kind === "alert" && "led-pulse")} />
                        {s.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-sm">{c.name}</span>
                        {c.ignored && (
                          <Badge
                            variant="outline"
                            className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
                          >
                            ignored
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-64 truncate font-mono text-xs text-muted-foreground">
                      {shortImage(c.image)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
                      {c.status}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
