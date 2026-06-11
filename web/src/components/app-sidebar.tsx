import { BellRing, Boxes } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
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
  online: boolean
}

function beacon(online: boolean, counts: FleetCounts) {
  if (!online) {
    return { label: "daemon unreachable", className: "text-alert", pulse: true }
  }
  if (counts.unhealthy > 0) {
    return {
      label: `${counts.unhealthy} container${counts.unhealthy > 1 ? "s" : ""} unhealthy`,
      className: "text-alert",
      pulse: true,
    }
  }
  return { label: "all systems nominal", className: "text-ok", pulse: false }
}

export function AppSidebar({ view, onNavigate, counts, online }: AppSidebarProps) {
  const b = beacon(online, counts)

  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 pt-2">
          <div className="grid size-7 flex-none place-items-center rounded-md bg-primary">
            <span className="size-2 rounded-full bg-ok" />
          </div>
          <div className="text-[17px] font-semibold tracking-tight">dockwatch</div>
        </div>

        <div className="mx-2 mt-3 rounded-lg border bg-background px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className={cn("led", b.className, b.pulse && "led-pulse")} />
            <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.13em]">
              {b.label}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-[10px] uppercase tracking-[0.18em]">
            Console
          </SidebarGroupLabel>
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
                <SidebarMenuBadge className="font-mono text-[10px] text-muted-foreground">
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
                  <SidebarMenuBadge className="font-mono text-[10px] text-alert">
                    {counts.unhealthy}
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between px-2 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className={cn("led", online ? "text-ok" : "text-alert led-pulse")} />
            {online ? "docker.sock" : "socket offline"}
          </span>
          <span>v0.2</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
