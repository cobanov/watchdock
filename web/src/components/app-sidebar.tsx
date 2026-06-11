import { BellRing, Boxes, PlusIcon, RadarIcon } from "lucide-react"
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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Switch } from "@/components/ui/switch"
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

function status(apiOnline: boolean, counts: FleetCounts, hosts: HostStatus[]) {
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
  const s = status(apiOnline, counts, hosts)

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

  const showContainers = (alias: string) => {
    onSelectHost(alias)
    onNavigate("containers")
  }

  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" onClick={() => showContainers("all")}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <RadarIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">dockwatch</span>
                <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <span className={cn("led !size-1.5", s.className, s.pulse && "led-pulse")} />
                  {s.label}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Hosts</SidebarGroupLabel>
          <SidebarGroupAction title="Add SSH host" onClick={onAddHost}>
            <PlusIcon />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view === "containers" && selectedHost === "all"}
                  onClick={() => showContainers("all")}
                >
                  <Boxes />
                  <span>All hosts</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="text-muted-foreground">
                  {counts.total}
                </SidebarMenuBadge>
              </SidebarMenuItem>

              {hosts.map((h) => (
                <SidebarMenuItem key={h.alias}>
                  <SidebarMenuButton
                    className={cn(h.alias !== "local" && "pr-12")}
                    isActive={view === "containers" && selectedHost === h.alias}
                    onClick={() => showContainers(h.alias)}
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
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <Switch
                        size="sm"
                        checked={!h.disabled}
                        onCheckedChange={(enabled) => handleToggle(h.alias, !enabled)}
                        aria-label={`Toggle monitoring for ${h.alias}`}
                      />
                    </div>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
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
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between px-2 py-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className={cn("led !size-1.5", apiOnline ? "text-ok" : "text-alert led-pulse")} />
            {apiOnline ? "Connected" : "Offline"}
          </span>
          <span>v0.3</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
