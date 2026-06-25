import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { toast } from "sonner"
import { AppSidebar } from "@/components/app-sidebar"
import { HostDialog } from "@/components/host-dialog"
import { DashboardView } from "@/components/dashboard-view"
import { EventsView } from "@/components/events-view"
import { NotificationsView } from "@/components/notifications-view"
import { SetupView } from "@/components/setup-view"
import { StatusDot } from "@/components/status-dot"
import { ThemeToggle } from "@/components/theme-toggle"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  exportHosts,
  fetchConfig,
  fetchHostContainers,
  importHostsFromFile,
  setHostDisabled,
  type Container,
  type HostConfig,
  type HostStatus,
} from "@/lib/api"

export type View = "dashboard" | "events" | "notifications" | "setup"

// A host's live status plus its containers; containers === null means the
// host's data is still being fetched (renders a per-host loading state).
export interface HostBlock {
  status: HostStatus
  containers: Container[] | null
}

// What the sidebar/cards need to decide between spinner, green, red and grey.
export interface HostView {
  status: HostStatus
  loading: boolean
}

function isLoading(block: HostBlock): boolean {
  return block.containers === null && !block.status.disabled
}

const POLL_INTERVAL_MS = 5000
const LOCAL_ALIAS = "local"

function viewFromHash(): View {
  if (window.location.hash === "#events") return "events"
  if (window.location.hash === "#notifications") return "notifications"
  if (window.location.hash === "#setup") return "setup"
  return "dashboard"
}

function headerTitle(view: View, selectedHost: string): string {
  if (view === "events") return "Event log"
  if (view === "notifications") return "Notifications"
  if (view === "setup") return "Setup guide"
  return selectedHost === "all" ? "Dashboard" : selectedHost
}

export default function App() {
  const [view, setView] = useState<View>(viewFromHash)
  const [order, setOrder] = useState<string[]>([LOCAL_ALIAS])
  const [hostStates, setHostStates] = useState<Record<string, HostBlock>>({
    [LOCAL_ALIAS]: { status: { alias: LOCAL_ALIAS, ok: true }, containers: null },
  })
  const [configError, setConfigError] = useState<string | null>(null)
  const [selectedHost, setSelectedHost] = useState("all")
  const [hostDialogOpen, setHostDialogOpen] = useState(false)
  const [editingHost, setEditingHost] = useState<HostConfig | null>(null)

  // Guards against overlapping fetches for the same host: an unreachable host
  // can take seconds to time out, and the 5s poll would otherwise pile up.
  const inFlight = useRef<Set<string>>(new Set())

  // Fetch one host and patch its block in place, so fast hosts render without
  // waiting for slow ones.
  const refreshHost = useCallback(async (alias: string) => {
    if (inFlight.current.has(alias)) return
    inFlight.current.add(alias)
    try {
      const res = await fetchHostContainers(alias)
      setHostStates((prev) => ({
        ...prev,
        [alias]: { status: res.host, containers: res.containers ?? [] },
      }))
    } catch (e) {
      setHostStates((prev) => ({
        ...prev,
        [alias]: {
          status: { alias, ok: false, error: e instanceof Error ? e.message : String(e) },
          containers: prev[alias]?.containers ?? [],
        },
      }))
    } finally {
      inFlight.current.delete(alias)
    }
  }, [])

  const refresh = useCallback(async () => {
    let cfg
    try {
      cfg = await fetchConfig()
      setConfigError(null)
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : String(e))
      return
    }

    const roster = [LOCAL_ALIAS, ...cfg.hosts.map((h) => h.alias)]
    setOrder(roster)

    setHostStates((prev) => {
      const next: Record<string, HostBlock> = {
        [LOCAL_ALIAS]: prev[LOCAL_ALIAS] ?? {
          status: { alias: LOCAL_ALIAS, ok: true },
          containers: null,
        },
      }
      for (const h of cfg.hosts) {
        if (h.disabled) {
          next[h.alias] = {
            status: { alias: h.alias, ok: true, disabled: true },
            containers: [],
          }
        } else {
          next[h.alias] = prev[h.alias]?.status.disabled
            ? { status: { alias: h.alias, ok: true }, containers: null }
            : (prev[h.alias] ?? { status: { alias: h.alias, ok: true }, containers: null })
        }
      }
      return next
    })

    // Keep the filter valid when the selected host disappears.
    setSelectedHost((prev) =>
      prev !== "all" && !roster.includes(prev) ? "all" : prev,
    )

    const live = [LOCAL_ALIAS, ...cfg.hosts.filter((h) => !h.disabled).map((h) => h.alias)]
    live.forEach((alias) => refreshHost(alias))
  }, [refreshHost])

  // Avoid a stale closure in the polling interval.
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect(() => {
    const tick = () => refreshRef.current()
    const initial = setTimeout(tick, 0)
    const timer = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      clearTimeout(initial)
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const onHash = () => setView(viewFromHash())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const navigate = useCallback((v: View) => {
    window.location.hash = v === "dashboard" ? "" : v
    setView(v)
  }, [])

  const toggleHost = useCallback(
    async (alias: string, disabled: boolean) => {
      try {
        await setHostDisabled(alias, disabled)
        toast.success(
          disabled
            ? `Monitoring paused for "${alias}"`
            : `Monitoring resumed for "${alias}"`,
        )
        refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e))
      }
    },
    [refresh],
  )

  const openAddHost = useCallback(() => {
    setEditingHost(null)
    setHostDialogOpen(true)
  }, [])

  const importInputRef = useRef<HTMLInputElement>(null)

  const handleExportHosts = useCallback(async () => {
    try {
      const n = await exportHosts()
      toast.success(n ? `Exported ${n} host${n === 1 ? "" : "s"}` : "No hosts to export")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const handleImportFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = "" // let the same file be re-selected later
      if (!file) return
      try {
        const { added, updated } = await importHostsFromFile(file)
        toast.success(`Imported hosts — ${added} added, ${updated} updated`)
        refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      }
    },
    [refresh],
  )

  const openEditHost = useCallback(async (alias: string) => {
    try {
      const cfg = await fetchConfig()
      const host = cfg.hosts.find((h) => h.alias === alias)
      if (!host) {
        toast.error(`Host "${alias}" not found in config`)
        return
      }
      setEditingHost(host)
      setHostDialogOpen(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const handleHostSaved = useCallback(
    (alias: string | null) => {
      // Follow an alias rename when the edited host was the selected one.
      if (alias && editingHost && selectedHost === editingHost.alias) {
        setSelectedHost(alias)
      }
      refresh()
    },
    [editingHost, selectedHost, refresh],
  )

  const blocks = useMemo(
    () => order.map((alias) => hostStates[alias]).filter(Boolean),
    [order, hostStates],
  )

  const visibleBlocks = useMemo(
    () =>
      selectedHost === "all"
        ? blocks
        : blocks.filter((b) => b.status.alias === selectedHost),
    [blocks, selectedHost],
  )

  const hostViews = useMemo<HostView[]>(
    () => blocks.map((b) => ({ status: b.status, loading: isLoading(b) })),
    [blocks],
  )
  const allContainers = useMemo(
    () => blocks.flatMap((b) => b.containers ?? []),
    [blocks],
  )
  const unhealthy = allContainers.filter((c) => c.health === "unhealthy").length
  const apiOnline = configError === null

  return (
    <SidebarProvider>
      <AppSidebar
        view={view}
        onNavigate={navigate}
        hosts={hostViews}
        containerCount={allContainers.length}
        unhealthyCount={unhealthy}
        apiOnline={apiOnline}
        selectedHost={selectedHost}
        onSelectHost={setSelectedHost}
        onAddHost={openAddHost}
        onImportHosts={() => importInputRef.current?.click()}
        onExportHosts={handleExportHosts}
        onToggleHost={toggleHost}
      />
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportFile}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:!h-4"
          />
          <h1 className="truncate text-sm font-medium">
            {headerTitle(view, selectedHost)}
          </h1>
          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <StatusDot
                kind={apiOnline ? "ok" : "alert"}
                pulse={!apiOnline}
                className="!size-1.5"
              />
              {apiOnline ? "Live" : "Offline"}
            </span>
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
            {view === "dashboard" ? (
              <DashboardView
                blocks={visibleBlocks}
                selectedHost={selectedHost}
                error={configError}
                onAddHost={openAddHost}
                onEditHost={openEditHost}
                onToggleHost={toggleHost}
              />
            ) : view === "events" ? (
              <EventsView />
            ) : view === "notifications" ? (
              <NotificationsView />
            ) : (
              <SetupView onNavigate={navigate} />
            )}
          </div>
        </main>
      </SidebarInset>
      <HostDialog
        open={hostDialogOpen}
        onOpenChange={setHostDialogOpen}
        editing={editingHost}
        onSaved={handleHostSaved}
      />
    </SidebarProvider>
  )
}
