import { useMemo, useState } from "react"
import {
  ActivityIcon,
  BoxesIcon,
  ChevronDownIcon,
  CircleOffIcon,
  HeartPulseIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { HostDot, StatusDot } from "@/components/status-dot"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { Switch } from "@/components/ui/switch"
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
import type { HostBlock } from "@/App"

const COLLAPSE_STORAGE_KEY = "dockwatch-collapsed-hosts"

interface DashboardViewProps {
  blocks: HostBlock[]
  selectedHost: string
  error: string | null
  onAddHost: () => void
  onEditHost: (alias: string) => void
  onToggleHost: (alias: string, disabled: boolean) => void
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  alert,
}: {
  label: string
  value: number
  hint: string
  icon: React.ComponentType<{ className?: string }>
  alert?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn(
            "text-2xl font-semibold tabular-nums",
            alert && value > 0 && "text-alert",
          )}
        >
          {value}
        </CardTitle>
        <CardAction>
          <Icon className="size-4 text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

// Whisper-light row tints so status is scannable at a glance; healthy rows
// stay the faintest since they are the common case.
const rowBg: Record<StatusKind, string> = {
  ok: "bg-ok/5 hover:bg-ok/10",
  warn: "bg-warn/10 hover:bg-warn/15",
  alert: "bg-alert/10 hover:bg-alert/15",
  idle: "bg-idle/10 hover:bg-idle/15",
}

function StatusBadge({ kind, label }: { kind: StatusKind; label: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5", kind === "alert" && "border-alert/30 text-alert")}
    >
      <StatusDot kind={kind} pulse={kind === "alert"} className="!size-1.5" />
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </Badge>
  )
}

function ContainerTable({ containers }: { containers: Container[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-4">Name</TableHead>
          <TableHead className="hidden md:table-cell">Image</TableHead>
          <TableHead className="w-32">Status</TableHead>
          <TableHead className="hidden pr-4 text-right sm:table-cell">Uptime</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {containers.map((c) => {
          const s = uiStatus(c)
          return (
            <TableRow
              key={c.id}
              className={cn(rowBg[s.kind], c.ignored && "opacity-50")}
            >
              <TableCell className="max-w-40 pl-4 sm:max-w-none">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{c.name}</span>
                  {c.ignored && (
                    <Badge variant="secondary" className="text-muted-foreground">
                      Ignored
                    </Badge>
                  )}
                </span>
              </TableCell>
              <TableCell className="hidden max-w-64 truncate font-mono text-xs text-muted-foreground md:table-cell">
                {shortImage(c.image)}
              </TableCell>
              <TableCell>
                <StatusBadge kind={s.kind} label={s.label} />
              </TableCell>
              <TableCell className="hidden pr-4 text-right text-xs text-muted-foreground sm:table-cell">
                {c.status}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function HostCard({
  host,
  containers,
  query,
  collapsed,
  onToggleCollapse,
  onEditHost,
  onToggleHost,
}: {
  host: HostStatus
  containers: Container[] | null
  query: string
  collapsed: boolean
  onToggleCollapse: () => void
  onEditHost: (alias: string) => void
  onToggleHost: (alias: string, disabled: boolean) => void
}) {
  const loading = containers === null
  const all = containers ?? []
  const list = query
    ? all.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.image.toLowerCase().includes(query),
      )
    : all
  const running = all.filter((c) => c.state === "running").length

  const description = loading
    ? "Loading…"
    : host.disabled
      ? "Monitoring paused"
      : !host.ok
        ? "Host unreachable"
        : `${all.length} container${all.length === 1 ? "" : "s"} · ${running} running`

  const emptyText = host.disabled
    ? "Enable monitoring to see this host's containers."
    : !host.ok
      ? (host.error ?? "Could not connect to this host.")
      : query
        ? "No containers match the filter."
        : "No containers on this host."

  return (
    <Card className="gap-0 py-0">
      <CardHeader
        className={cn("py-4", !collapsed && "border-b")}
        onClick={onToggleCollapse}
        role="button"
        aria-expanded={!collapsed}
      >
        <CardTitle className="flex cursor-pointer items-center gap-2">
          <ChevronDownIcon
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              collapsed && "-rotate-90",
            )}
          />
          <HostDot status={host} loading={loading} />
          {host.alias}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
        {host.alias !== "local" && (
          <CardAction
            className="flex items-center gap-2 self-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              onClick={() => onEditHost(host.alias)}
              aria-label={`Edit host ${host.alias}`}
            >
              <PencilIcon />
            </Button>
            <Switch
              checked={!host.disabled}
              onCheckedChange={(enabled) => onToggleHost(host.alias, !enabled)}
              aria-label={`Toggle monitoring for ${host.alias}`}
            />
          </CardAction>
        )}
      </CardHeader>
      {!collapsed && (
        <CardContent className="px-0">
          {loading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-2/3" />
            </div>
          ) : list.length === 0 ? (
            <p
              className={cn(
                "px-4 py-4 text-sm text-muted-foreground",
                !host.disabled && !host.ok && "break-all text-destructive",
              )}
            >
              {emptyText}
            </p>
          ) : (
            <ContainerTable containers={list} />
          )}
        </CardContent>
      )}
    </Card>
  )
}

export function DashboardView({
  blocks,
  selectedHost,
  error,
  onAddHost,
  onEditHost,
  onToggleHost,
}: DashboardViewProps) {
  const [filter, setFilter] = useState("")
  const query = filter.trim().toLowerCase()

  // Per-host collapse state, remembered across reloads.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(COLLAPSE_STORAGE_KEY) ?? "[]"))
    } catch {
      return new Set()
    }
  })
  const toggleCollapse = (alias: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(alias)) next.delete(alias)
      else next.add(alias)
      localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
  }
  const aggregate = selectedHost === "all"
  const hostCount = blocks.length

  // Counts reflect whatever has loaded so far, so they climb as hosts respond.
  const counts = useMemo(() => {
    const list = blocks.flatMap((b) => b.containers ?? [])
    return {
      total: list.length,
      running: list.filter((c) => c.state === "running").length,
      stopped: list.filter((c) => c.state !== "running").length,
      unhealthy: list.filter((c) => c.health === "unhealthy").length,
    }
  }, [blocks])

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">
            {aggregate ? "Dashboard" : selectedHost}
          </h2>
          <p className="text-sm text-muted-foreground">
            {aggregate
              ? `${counts.total} container${counts.total === 1 ? "" : "s"} across ${hostCount} host${hostCount === 1 ? "" : "s"}.`
              : `${counts.total} container${counts.total === 1 ? "" : "s"} on this host.`}
          </p>
        </div>
        {aggregate ? (
          <Button onClick={onAddHost}>
            <PlusIcon />
            Add host
          </Button>
        ) : selectedHost !== "local" ? (
          <Button variant="outline" onClick={() => onEditHost(selectedHost)}>
            <PencilIcon />
            Edit host
          </Button>
        ) : null}
      </div>

      {error && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Docker daemon unreachable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <StatCard
          label="Total"
          value={counts.total}
          hint={`across ${hostCount} host${hostCount === 1 ? "" : "s"}`}
          icon={BoxesIcon}
        />
        <StatCard
          label="Running"
          value={counts.running}
          hint={`of ${counts.total} container${counts.total === 1 ? "" : "s"}`}
          icon={ActivityIcon}
        />
        <StatCard
          label="Stopped"
          value={counts.stopped}
          hint="exited or paused"
          icon={CircleOffIcon}
        />
        <StatCard
          label="Unhealthy"
          value={counts.unhealthy}
          hint={counts.unhealthy > 0 ? "failing healthchecks" : "all checks passing"}
          icon={HeartPulseIcon}
          alert
        />
      </div>

      <div className="relative w-full max-w-sm">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter containers…"
          className="pl-8"
        />
      </div>

      {blocks.map((b) => (
        <HostCard
          key={b.status.alias}
          host={b.status}
          containers={b.containers}
          query={query}
          collapsed={collapsed.has(b.status.alias)}
          onToggleCollapse={() => toggleCollapse(b.status.alias)}
          onEditHost={onEditHost}
          onToggleHost={onToggleHost}
        />
      ))}
    </>
  )
}
