import { useCallback, useEffect, useMemo, useState } from "react"
import { AddHostDialog } from "@/components/add-host-dialog"
import { AppSidebar, type FleetCounts } from "@/components/app-sidebar"
import { ContainersView } from "@/components/containers-view"
import { NotificationsView } from "@/components/notifications-view"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import {
  fetchContainers,
  fetchHistory,
  type Container,
  type HistoryPoint,
  type HostStatus,
} from "@/lib/api"

export type View = "containers" | "notifications"

const POLL_INTERVAL_MS = 5000

function viewTitle(view: View, selectedHost: string): string {
  if (view === "notifications") return "Notifications"
  return selectedHost === "all" ? "All hosts" : selectedHost
}

function viewFromHash(): View {
  return window.location.hash === "#notifications" ? "notifications" : "containers"
}

const LOCAL_ONLY: HostStatus[] = [{ alias: "local", ok: true }]

export default function App() {
  const [view, setView] = useState<View>(viewFromHash)
  const [containers, setContainers] = useState<Container[] | null>(null)
  const [hosts, setHosts] = useState<HostStatus[]>(LOCAL_ONLY)
  const [apiError, setApiError] = useState<string | null>(null)
  const [selectedHost, setSelectedHost] = useState("all")
  const [addHostOpen, setAddHostOpen] = useState(false)
  const [history, setHistory] = useState<HistoryPoint[]>([])

  const refresh = useCallback(async () => {
    try {
      const res = await fetchContainers()
      setContainers(res.containers)
      setHosts(res.hosts.length ? res.hosts : LOCAL_ONLY)
      setApiError(null)
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    const load = () => fetchHistory().then(setHistory).catch(() => {})
    load()
    const timer = setInterval(load, 60_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const onHash = () => setView(viewFromHash())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const navigate = useCallback((v: View) => {
    window.location.hash = v === "containers" ? "" : v
    setView(v)
  }, [])

  // Keep the filter valid when a host is removed.
  useEffect(() => {
    if (selectedHost !== "all" && !hosts.some((h) => h.alias === selectedHost)) {
      setSelectedHost("all")
    }
  }, [hosts, selectedHost])

  const allCounts: FleetCounts = useMemo(() => {
    const list = containers ?? []
    return {
      running: list.filter((c) => c.state === "running").length,
      unhealthy: list.filter((c) => c.health === "unhealthy").length,
      stopped: list.filter((c) => c.state !== "running").length,
      total: list.length,
    }
  }, [containers])

  const visibleContainers = useMemo(() => {
    if (containers === null) return null
    if (selectedHost === "all") return containers
    return containers.filter((c) => c.host === selectedHost)
  }, [containers, selectedHost])

  const visibleCounts: FleetCounts = useMemo(() => {
    const list = visibleContainers ?? []
    return {
      running: list.filter((c) => c.state === "running").length,
      unhealthy: list.filter((c) => c.health === "unhealthy").length,
      stopped: list.filter((c) => c.state !== "running").length,
      total: list.length,
    }
  }, [visibleContainers])

  const apiOnline = apiError === null
  const visibleHosts =
    selectedHost === "all" ? hosts : hosts.filter((h) => h.alias === selectedHost)

  return (
    <SidebarProvider>
      <AppSidebar
        view={view}
        onNavigate={navigate}
        counts={allCounts}
        apiOnline={apiOnline}
        hosts={hosts}
        selectedHost={selectedHost}
        onSelectHost={setSelectedHost}
        onAddHost={() => setAddHostOpen(true)}
        onHostsChanged={refresh}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:!h-4" />
          <h1 className="text-base font-medium">{viewTitle(view, selectedHost)}</h1>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn("led !size-1.5", apiOnline ? "text-ok" : "text-alert led-pulse")} />
            {apiOnline ? "Live · 5s" : "Offline"}
          </div>
        </header>
        <main className="@container/main flex flex-1 flex-col gap-4 overflow-y-auto p-4 md:gap-6 md:p-6">
          {view === "containers" ? (
            <ContainersView
              containers={visibleContainers}
              counts={visibleCounts}
              hosts={visibleHosts}
              history={history}
              aggregate={selectedHost === "all"}
              error={apiError}
            />
          ) : (
            <NotificationsView />
          )}
        </main>
      </SidebarInset>
      <AddHostDialog
        open={addHostOpen}
        onOpenChange={setAddHostOpen}
        onAdded={refresh}
      />
    </SidebarProvider>
  )
}
