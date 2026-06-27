import { useEffect, useState } from "react"
import { AppShell as AstryxAppShell } from "@astryxdesign/core/AppShell"
import { Layout, HStack, StackItem } from "@astryxdesign/core/Layout"
import {
  SideNav,
  SideNavHeading,
  SideNavSection,
  SideNavItem,
} from "@astryxdesign/core/SideNav"
import { Text } from "@astryxdesign/core/Text"
import { IconButton } from "@astryxdesign/core/IconButton"
import { Switch } from "@astryxdesign/core/Switch"
import { Icon } from "@astryxdesign/core/Icon"
import { StatusDot } from "@astryxdesign/core/StatusDot"
import { useResizable, ResizeHandle } from "@astryxdesign/core/Resizable"
import { useToast } from "@astryxdesign/core/Toast"
import {
  Squares2X2Icon,
  DocumentTextIcon,
  BellIcon,
  BookOpenIcon,
  ServerIcon,
  Cog6ToothIcon,
  CubeIcon,
  PlusIcon,
  SunIcon,
  MoonIcon,
} from "@heroicons/react/24/outline"
import {
  Squares2X2Icon as Squares2X2Solid,
  DocumentTextIcon as DocumentTextSolid,
  BellIcon as BellSolid,
  BookOpenIcon as BookOpenSolid,
  Cog6ToothIcon as Cog6ToothSolid,
} from "@heroicons/react/24/solid"
import { setHostDisabled, type Container, type HostConfig } from "@/lib/api"
import { useFleet, type HostBlock } from "@/app/lib/use-fleet"
import { hostStatusDot } from "@/app/lib/host-status"
import {
  DashboardContent,
  ContainerDetailPanel,
  type GroupByField,
} from "@/app/dashboard"
import { EventsPage } from "@/app/pages/events"
import { NotificationsPage } from "@/app/pages/notifications"
import { SetupPage } from "@/app/pages/setup"
import { HostsPage } from "@/app/pages/hosts"
import { HostDialog } from "@/app/host-dialog"
import type { ColorMode } from "@/app/lib/color-mode"

type View = "dashboard" | "events" | "notifications" | "setup" | "hosts"

interface NavItem {
  view: View
  label: string
  icon: typeof Squares2X2Icon
  selectedIcon: typeof Squares2X2Solid
}

const OVERVIEW_ITEMS: NavItem[] = [
  { view: "dashboard", label: "Dashboard", icon: Squares2X2Icon, selectedIcon: Squares2X2Solid },
  { view: "events", label: "Event Log", icon: DocumentTextIcon, selectedIcon: DocumentTextSolid },
  { view: "notifications", label: "Notifications", icon: BellIcon, selectedIcon: BellSolid },
  { view: "setup", label: "Setup Guide", icon: BookOpenIcon, selectedIcon: BookOpenSolid },
]

const ALL_VIEWS: View[] = ["dashboard", "events", "notifications", "setup", "hosts"]

function viewFromHash(): View {
  const h = window.location.hash.replace(/^#/, "") as View
  return ALL_VIEWS.includes(h) ? h : "dashboard"
}

function fleetStatus(
  apiOnline: boolean,
  unhealthy: number,
  blocks: HostBlock[],
): { variant: "success" | "warning" | "error"; label: string } {
  if (!apiOnline) return { variant: "error", label: "Daemon unreachable" }
  if (unhealthy > 0)
    return { variant: "error", label: `${unhealthy} unhealthy container${unhealthy > 1 ? "s" : ""}` }
  const offline = blocks.filter(
    (b) => b.containers !== null && !b.status.ok && !b.status.disabled,
  ).length
  if (offline > 0)
    return { variant: "warning", label: `${offline} host${offline > 1 ? "s" : ""} offline` }
  if (blocks.some((b) => b.containers === null && !b.status.disabled))
    return { variant: "warning", label: "Connecting…" }
  return { variant: "success", label: "All systems normal" }
}

export function AppShell({
  mode,
  onToggleMode,
}: {
  mode: ColorMode
  onToggleMode: () => void
}) {
  const { blocks, allContainers, hosts, apiOnline, configError, refresh } = useFleet()
  const toast = useToast()
  const [view, setView] = useState<View>(viewFromHash)
  const [groupBy, setGroupBy] = useState<GroupByField>("host")
  const [selected, setSelected] = useState<Container | null>(null)
  const [hostFilter, setHostFilter] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingHost, setEditingHost] = useState<HostConfig | null>(null)

  useEffect(() => {
    const onHash = () => setView(viewFromHash())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const navigate = (v: View) => {
    // eslint-disable-next-line react-hooks/immutability -- hash routing requires mutating location.hash
    window.location.hash = v === "dashboard" ? "" : v
    setView(v)
  }

  const goDashboard = () => {
    setHostFilter(null)
    navigate("dashboard")
  }

  const selectHost = (alias: string) => {
    setHostFilter((prev) => (prev === alias && view === "dashboard" ? null : alias))
    navigate("dashboard")
  }

  const toggleHost = async (alias: string, disabled: boolean) => {
    try {
      await setHostDisabled(alias, disabled)
      toast({ body: disabled ? `Monitoring paused for "${alias}"` : `Monitoring resumed for "${alias}"` })
      refresh()
    } catch (e) {
      toast({ body: e instanceof Error ? e.message : String(e), type: "error" })
    }
  }

  const openAdd = () => {
    setEditingHost(null)
    setDialogOpen(true)
  }
  const openEdit = (host: HostConfig) => {
    setEditingHost(host)
    setDialogOpen(true)
  }

  const unhealthy = allContainers.filter((c) => c.health === "unhealthy").length
  const status = fleetStatus(apiOnline, unhealthy, blocks)
  const detail = useResizable({ defaultSize: 360, minSizePx: 280, maxSizePx: 520 })

  const localBlock = blocks.find((b) => b.status.alias === "local")

  const hostItem = (alias: string, block: HostBlock | undefined, host?: HostConfig) => {
    const d = hostStatusDot(block, host?.disabled)
    return (
      <SideNavItem
        key={alias}
        label={alias}
        icon={ServerIcon}
        isSelected={view === "dashboard" && hostFilter === alias}
        onClick={() => selectHost(alias)}
        endContent={
          <HStack gap={2} vAlign="center" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <StatusDot variant={d.variant} isPulsing={d.pulse} label={d.label} />
            {host && (
              <Switch
                label={`Monitor ${alias}`}
                isLabelHidden
                value={!host.disabled}
                onChange={(on) => toggleHost(alias, !on)}
              />
            )}
          </HStack>
        }
      />
    )
  }

  const nav = (
    <SideNav
      collapsible
      header={
        <SideNavHeading
          heading="dockwatch"
          subheading="Container monitoring"
          icon={<Icon icon={CubeIcon} />}
        />
      }
      footer={
        <HStack gap={2} vAlign="center">
          <StatusDot variant={status.variant} isPulsing={status.variant !== "success"} label={status.label} />
          <StackItem size="fill">
            <Text type="supporting" color="secondary" maxLines={1}>
              {status.label}
            </Text>
          </StackItem>
        </HStack>
      }
      footerIcons={
        <IconButton
          label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          tooltip={mode === "dark" ? "Light mode" : "Dark mode"}
          variant="ghost"
          size="sm"
          icon={<Icon icon={mode === "dark" ? SunIcon : MoonIcon} size="sm" />}
          onClick={onToggleMode}
        />
      }
    >
      <SideNavSection title="Overview">
        {OVERVIEW_ITEMS.map((item) => (
          <SideNavItem
            key={item.view}
            label={item.label}
            icon={item.icon}
            selectedIcon={item.selectedIcon}
            isSelected={view === item.view && (item.view !== "dashboard" || hostFilter === null)}
            onClick={() => (item.view === "dashboard" ? goDashboard() : navigate(item.view))}
          />
        ))}
      </SideNavSection>

      <SideNavSection
        title="Hosts"
        endContent={
          <IconButton
            label="Add host"
            tooltip="Add SSH host"
            variant="ghost"
            size="sm"
            icon={<Icon icon={PlusIcon} size="sm" />}
            onClick={openAdd}
          />
        }
      >
        {localBlock && hostItem("local", localBlock)}
        {hosts.map((h) => hostItem(h.alias, blocks.find((b) => b.status.alias === h.alias), h))}
        <SideNavItem
          label="Manage hosts"
          icon={Cog6ToothIcon}
          selectedIcon={Cog6ToothSolid}
          isSelected={view === "hosts"}
          onClick={() => navigate("hosts")}
        />
      </SideNavSection>
    </SideNav>
  )

  let content: React.ReactNode
  if (view === "events") content = <EventsPage />
  else if (view === "notifications") content = <NotificationsPage />
  else if (view === "setup") content = <SetupPage onOpenNotifications={() => navigate("notifications")} />
  else if (view === "hosts")
    content = (
      <HostsPage
        hosts={hosts}
        blocks={blocks}
        onAdd={openAdd}
        onEdit={openEdit}
        onToggle={toggleHost}
        refresh={refresh}
      />
    )
  else
    content = (
      <DashboardContent
        blocks={blocks}
        configError={configError}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        onSelectContainer={setSelected}
        hostFilter={hostFilter}
      />
    )

  const end =
    view === "dashboard" && selected ? (
      <>
        <ResizeHandle resizable={detail.props} isReversed isAlwaysVisible={false} />
        <ContainerDetailPanel
          container={selected}
          onClose={() => setSelected(null)}
          resizable={detail.props}
        />
      </>
    ) : undefined

  return (
    <>
      <AstryxAppShell sideNav={nav} contentPadding={0} height="fill" variant="section">
        <Layout height="fill" contentWidth={1280} content={content} end={end} />
      </AstryxAppShell>
      <HostDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editingHost}
        onSaved={() => refresh()}
      />
    </>
  )
}
