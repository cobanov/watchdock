import { BellRing, Boxes, PauseIcon, PlayIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { setHostDisabled, type HostStatus } from "@/lib/api"
import type { View } from "@/App"

export interface FleetCounts {
  running: number
  unhealthy: number
  stopped: number
  total: number
}

interface AppSidebarProps {
  view: View
  onNavigate: (view: View) => void
  counts: FleetCounts
  apiOnline: boolean
  hosts: HostStatus[]
  selectedHost: string
  onSelectHost: (alias: string) => void
  onAddHost: () => void
  onHostsChanged: () => void
}

function beacon(apiOnline: boolean, counts: FleetCounts, hosts: HostStatus[]) {
  if (!apiOnline) {
    return { label: "Daemon unreachable", className: "text-alert", pulse: true }
  }
  if (counts.unhealthy > 0) {
    return {
      label: `${counts.unhealthy} container${counts.unhealthy > 1 ? "s" : ""} unhealthy`,
      className: "text-alert",
      pulse: true,
    }
  }
  const offline = hosts.filter((h) => !h.ok && !h.disabled)
  if (offline.length > 0) {
    return {
      label: `${offline.length} host${offline.length > 1 ? "s" : ""} offline`,
      className: "text-warn",
      pulse: true,
    }
  }
  return { label: "All systems nominal", className: "text-ok", pulse: false }
}

export function AppSidebar({
  view,
  onNavigate,
  counts,
  apiOnline,
  hosts,
  selectedHost,
  onSelectHost,
  onAddHost,
  onHostsChanged,
}: AppSidebarProps) {
  const b = beacon(apiOnline, counts, hosts)

  const handleToggle = async (alias: string, disabled: boolean) => {
    try {
      await setHostDisabled(alias, disabled)
      toast.success(
        disabled ? `Monitoring paused for "${alias}"` : `Monitoring resumed for "${alias}"`,
      )
      onHostsChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 pt-2">
          <div className="grid size-7 flex-none place-items-center rounded-md bg-primary">
            <span className="size-2 rounded-full bg-ok" />
          </div>
          <div className="text-[17px] font-semibold tracking-tight">dockwatch</div>
        </div>

        <div className="mx-2 mt-3 flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5">
          <span className={cn("led", b.className, b.pulse && "led-pulse")} />
          <span className="text-xs font-medium">{b.label}</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Console</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view === "containers"}
                  onClick={() => onNavigate("containers")}
                >
                  <Boxes />
                  <span>Containers</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="text-muted-foreground">
                  {counts.total}
                </SidebarMenuBadge>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view === "notifications"}
                  onClick={() => onNavigate("notifications")}
                >
                  <BellRing />
                  <span>Notifications</span>
                </SidebarMenuButton>
                {counts.unhealthy > 0 && (
                  <SidebarMenuBadge className="text-alert">
                    {counts.unhealthy}
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Hosts</SidebarGroupLabel>
          <SidebarGroupAction title="Add SSH host" onClick={onAddHost}>
            <PlusIcon />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {hosts.map((h) => (
                <SidebarMenuItem key={h.alias}>
                  <SidebarMenuButton
                    isActive={selectedHost === h.alias}
                    onClick={() => {
                      onSelectHost(selectedHost === h.alias ? "all" : h.alias)
                      onNavigate("containers")
                    }}
                    title={h.disabled ? "Monitoring paused" : h.error}
                  >
                    <span
                      className={cn(
                        "led",
                        h.disabled
                          ? "text-idle"
                          : h.ok
                            ? "text-ok"
                            : "text-alert led-pulse",
                      )}
                    />
                    <span className={cn(h.disabled && "text-muted-foreground")}>
                      {h.alias}
                    </span>
                  </SidebarMenuButton>
                  {h.alias !== "local" && (
                    <SidebarMenuAction
                      showOnHover={!h.disabled}
                      title={
                        h.disabled
                          ? `Resume monitoring ${h.alias}`
                          : `Pause monitoring ${h.alias}`
                      }
                      onClick={() => handleToggle(h.alias, !h.disabled)}
                    >
                      {h.disabled ? <PlayIcon /> : <PauseIcon />}
                    </SidebarMenuAction>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between px-2 pb-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className={cn("led", apiOnline ? "text-ok" : "text-alert led-pulse")} />
            {apiOnline ? "Connected" : "Offline"}
          </span>
          <span>v0.3</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
