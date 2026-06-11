import { useCallback, useEffect, useMemo, useState } from "react"
import { AddHostDialog } from "@/components/add-host-dialog"
import { AppSidebar, type FleetCounts } from "@/components/app-sidebar"
import { Badge } from "@/components/ui/badge"
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
  type Container,
  type HostStatus,
} from "@/lib/api"

export type View = "containers" | "notifications"

const POLL_INTERVAL_MS = 5000

const VIEW_TITLES: Record<View, string> = {
  containers: "Containers",
  notifications: "Notifications",
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
        <header className="flex h-14 flex-none items-center gap-3 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="!h-5" />
          <h1 className="text-sm font-semibold tracking-tight">{VIEW_TITLES[view]}</h1>
          {view === "containers" && selectedHost !== "all" && (
            <Badge variant="secondary">{selectedHost}</Badge>
          )}
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn("led", apiOnline ? "text-ok" : "text-alert led-pulse")} />
            {apiOnline ? "Live · 5s" : "Offline"}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {view === "containers" ? (
            <ContainersView
              containers={visibleContainers}
              counts={visibleCounts}
              hosts={visibleHosts}
              showHostColumn={hosts.length > 1 && selectedHost === "all"}
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
