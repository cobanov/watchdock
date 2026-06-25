import {
  BellIcon,
  BookOpenIcon,
  ContainerIcon,
  DownloadIcon,
  LayoutDashboardIcon,
  PlusIcon,
  ScrollTextIcon,
  UploadIcon,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { HostDot } from "@/components/status-dot"
import { StatusDot } from "@/components/status-dot"
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
  SidebarRail,
} from "@/components/ui/sidebar"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { HostView, View } from "@/App"

interface AppSidebarProps {
  view: View
  onNavigate: (view: View) => void
  hosts: HostView[]
  containerCount: number
  unhealthyCount: number
  apiOnline: boolean
  selectedHost: string
  onSelectHost: (alias: string) => void
  onAddHost: () => void
  onImportHosts: () => void
  onExportHosts: () => void
  onToggleHost: (alias: string, disabled: boolean) => void
}

function fleetStatus(
  apiOnline: boolean,
  unhealthyCount: number,
  hosts: HostView[],
): { kind: "ok" | "warn" | "alert"; label: string } {
  if (!apiOnline) return { kind: "alert", label: "Daemon unreachable" }
  if (unhealthyCount > 0) {
    return {
      kind: "alert",
      label: `${unhealthyCount} unhealthy container${unhealthyCount > 1 ? "s" : ""}`,
    }
  }
  const offline = hosts.filter(
    (h) => !h.loading && !h.status.ok && !h.status.disabled,
  ).length
  if (offline > 0) {
    return { kind: "warn", label: `${offline} host${offline > 1 ? "s" : ""} offline` }
  }
  if (hosts.some((h) => h.loading)) {
    return { kind: "warn", label: "Connecting…" }
  }
  return { kind: "ok", label: "All systems normal" }
}

export function AppSidebar({
  view,
  onNavigate,
  hosts,
  containerCount,
  unhealthyCount,
  apiOnline,
  selectedHost,
  onSelectHost,
  onAddHost,
  onImportHosts,
  onExportHosts,
  onToggleHost,
}: AppSidebarProps) {
  const status = fleetStatus(apiOnline, unhealthyCount, hosts)

  const showDashboard = (alias: string) => {
    onSelectHost(alias)
    onNavigate("dashboard")
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" onClick={() => showDashboard("all")}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <ContainerIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">dockwatch</span>
                <span className="truncate text-xs text-muted-foreground">
                  Container monitoring
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Overview</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Dashboard"
                  isActive={view === "dashboard" && selectedHost === "all"}
                  onClick={() => showDashboard("all")}
                >
                  <LayoutDashboardIcon />
                  <span>Dashboard</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="text-muted-foreground">
                  {containerCount}
                </SidebarMenuBadge>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Event log"
                  isActive={view === "events"}
                  onClick={() => onNavigate("events")}
                >
                  <ScrollTextIcon />
                  <span>Event log</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Notifications"
                  isActive={view === "notifications"}
                  onClick={() => onNavigate("notifications")}
                >
                  <BellIcon />
                  <span>Notifications</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Setup guide"
                  isActive={view === "setup"}
                  onClick={() => onNavigate("setup")}
                >
                  <BookOpenIcon />
                  <span>Setup guide</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Hosts</SidebarGroupLabel>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarGroupAction title="Host actions">
                <PlusIcon />
                <span className="sr-only">Host actions</span>
              </SidebarGroupAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start">
              <DropdownMenuItem onClick={onAddHost}>
                <PlusIcon />
                Add SSH host
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onImportHosts}>
                <UploadIcon />
                Import hosts…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportHosts}>
                <DownloadIcon />
                Export hosts
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <SidebarGroupContent>
            <SidebarMenu>
              {hosts.map(({ status: h, loading }) => (
                <SidebarMenuItem key={h.alias}>
                  <SidebarMenuButton
                    tooltip={h.alias}
                    className={cn(h.alias !== "local" && "pr-10")}
                    isActive={view === "dashboard" && selectedHost === h.alias}
                    onClick={() => showDashboard(h.alias)}
                    title={
                      h.disabled ? "Monitoring paused" : loading ? "Connecting…" : h.error
                    }
                  >
                    <HostDot status={h} loading={loading} />
                    <span className={cn((h.disabled || loading) && "text-muted-foreground")}>
                      {h.alias}
                    </span>
                  </SidebarMenuButton>
                  {h.alias !== "local" && (
                    <Switch
                      size="sm"
                      checked={!h.disabled}
                      onCheckedChange={(enabled) => onToggleHost(h.alias, !enabled)}
                      aria-label={`Toggle monitoring for ${h.alias}`}
                      className="absolute right-2 top-1/2 -translate-y-1/2 group-data-[collapsible=icon]:hidden"
                    />
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <StatusDot
            kind={status.kind}
            pulse={status.kind !== "ok"}
            className="!size-1.5"
          />
          <span className="truncate group-data-[collapsible=icon]:hidden">
            {status.label}
          </span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
