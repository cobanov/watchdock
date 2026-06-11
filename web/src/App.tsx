import { useCallback, useEffect, useMemo, useState } from "react"
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
import { fetchContainers, type Container } from "@/lib/api"

export type View = "containers" | "notifications"

const POLL_INTERVAL_MS = 5000

const VIEW_TITLES: Record<View, string> = {
  containers: "Containers",
  notifications: "Notifications",
}

function viewFromHash(): View {
  return window.location.hash === "#notifications" ? "notifications" : "containers"
}

export default function App() {
  const [view, setView] = useState<View>(viewFromHash)
  const [containers, setContainers] = useState<Container[] | null>(null)
  const [daemonError, setDaemonError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const list = await fetchContainers()
      setContainers(list)
      setDaemonError(null)
    } catch (e) {
      setDaemonError(e instanceof Error ? e.message : String(e))
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

  const counts: FleetCounts = useMemo(() => {
    const list = containers ?? []
    return {
      running: list.filter((c) => c.state === "running").length,
      unhealthy: list.filter((c) => c.health === "unhealthy").length,
      stopped: list.filter((c) => c.state !== "running").length,
      total: list.length,
    }
  }, [containers])

  const online = daemonError === null

  return (
    <SidebarProvider>
      <AppSidebar view={view} onNavigate={navigate} counts={counts} online={online} />
      <SidebarInset>
        <header className="flex h-14 flex-none items-center gap-3 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="!h-5" />
          <h1 className="text-sm font-semibold tracking-tight">{VIEW_TITLES[view]}</h1>
          <div className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <span className={cn("led", online ? "text-ok" : "text-alert led-pulse")} />
            {online ? "live · 5s poll" : "daemon offline"}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {view === "containers" ? (
            <ContainersView containers={containers} counts={counts} error={daemonError} />
          ) : (
            <NotificationsView />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
