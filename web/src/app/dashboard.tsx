import React, { useEffect, useMemo, useState } from "react"
import {
  LayoutContent,
  LayoutPanel,
  VStack,
  HStack,
  StackItem,
} from "@astryxdesign/core/Layout"
import { Grid } from "@astryxdesign/core/Grid"
import { Text, Heading } from "@astryxdesign/core/Text"
import { TextInput } from "@astryxdesign/core/TextInput"
import { Badge } from "@astryxdesign/core/Badge"
import { Banner } from "@astryxdesign/core/Banner"
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl"
import { SelectableCard } from "@astryxdesign/core/SelectableCard"
import { MoreMenu } from "@astryxdesign/core/MoreMenu"
import { Tooltip } from "@astryxdesign/core/Tooltip"
import { IconButton } from "@astryxdesign/core/IconButton"
import { CodeBlock } from "@astryxdesign/core/CodeBlock"
import { Center } from "@astryxdesign/core/Center"
import { Icon } from "@astryxdesign/core/Icon"
import { Spinner } from "@astryxdesign/core/Spinner"
import { StatusDot } from "@astryxdesign/core/StatusDot"
import { Divider } from "@astryxdesign/core/Divider"
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList"
import {
  Table,
  TableRow,
  TableCell,
  proportional,
  pixel,
  resolveColumnWidths,
} from "@astryxdesign/core/Table"
import type { TableColumn } from "@astryxdesign/core/Table"
import type { ResizableProps } from "@astryxdesign/core/Resizable"
import {
  ChevronRightIcon,
  ChevronDownIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  DocumentDuplicateIcon,
  TagIcon,
} from "@heroicons/react/24/outline"
import {
  shortImage,
  uiStatus,
  type Container,
  type HostStatus,
  type StatusKind,
} from "@/lib/api"
import { isHostLoading, type HostBlock } from "@/app/lib/use-fleet"
import { pagePad, tableFrame } from "@/app/lib/styles"

// Plain inline styles using Astryx design-token CSS variables. TableCell/stack
// components expose no padding/background props, so token vars via `style` are
// the sanctioned non-StyleX fallback (Tailwind/StyleX aren't wired up here).
const groupHeaderCell: React.CSSProperties = {
  cursor: "pointer",
  backgroundColor: "var(--color-background-muted)",
  padding: "var(--spacing-3) var(--spacing-4)",
}
const spanCell: React.CSSProperties = { padding: "var(--spacing-3) var(--spacing-4)" }

// dockwatch status semantics → Astryx StatusDot variants (leading row dot +
// host group headers).
const DOT_VARIANT: Record<StatusKind, "success" | "warning" | "error" | "neutral"> = {
  ok: "success",
  warn: "warning",
  alert: "error",
  idle: "neutral",
}

// Container status → Badge color. Tinted color variants (green/yellow/red) stay
// legible across a full table without every healthy row shouting — solid
// semantic success on every row would flatten the signal (Badge best-practice);
// idle uses the neutral (gray) variant.
const BADGE_VARIANT: Record<StatusKind, "green" | "yellow" | "red" | "neutral"> = {
  ok: "green",
  warn: "yellow",
  alert: "red",
  idle: "neutral",
}

function StatusBadge({ kind, label }: { kind: StatusKind; label: string }) {
  return <Badge variant={BADGE_VARIANT[kind]} label={cap(label)} />
}

function copy(text: string) {
  navigator.clipboard?.writeText(text)
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export type GroupByField = "host" | "status" | "health" | "image"

const GROUP_BY_OPTIONS: { value: GroupByField; label: string }[] = [
  { value: "host", label: "Host" },
  { value: "status", label: "Status" },
  { value: "health", label: "Health" },
  { value: "image", label: "Image" },
]

type StatusFilter = "all" | "running" | "stopped" | "unhealthy"

const STAT_CARDS: {
  key: StatusFilter
  label: string
  dot?: "success" | "warning" | "error" | "neutral"
}[] = [
  { key: "all", label: "Total" },
  { key: "running", label: "Running", dot: "success" },
  { key: "stopped", label: "Stopped", dot: "neutral" },
  { key: "unhealthy", label: "Unhealthy", dot: "error" },
]

function matchesStatus(c: Container, filter: StatusFilter): boolean {
  if (filter === "all") return true
  if (filter === "running") return c.state === "running"
  if (filter === "stopped") return c.state !== "running"
  return c.health === "unhealthy"
}

const columns: TableColumn<Record<string, unknown>>[] = [
  { key: "status", header: "", width: pixel(40) },
  { key: "name", header: "Container", width: proportional(1) },
  { key: "state", header: "Status", width: pixel(120) },
  { key: "uptime", header: "Uptime", width: pixel(140) },
  { key: "host", header: "Host", width: pixel(96) },
  { key: "actions", header: "", width: pixel(48) },
]

interface Group {
  key: string
  label: string
  containers: Container[]
  host?: HostStatus
  loading?: boolean
}

function healthLabel(health: string): string {
  return health && health !== "none" ? health : "No healthcheck"
}

function buildGroups(
  blocks: HostBlock[],
  groupBy: GroupByField,
  query: string,
  statusFilter: StatusFilter,
): Group[] {
  const match = (c: Container) =>
    matchesStatus(c, statusFilter) &&
    (!query ||
      c.name.toLowerCase().includes(query) ||
      c.image.toLowerCase().includes(query))

  if (groupBy === "host") {
    return blocks.map((b) => ({
      key: b.status.alias,
      label: b.status.alias,
      host: b.status,
      loading: isHostLoading(b),
      containers: (b.containers ?? []).filter(match),
    }))
  }

  const all = blocks.flatMap((b) => b.containers ?? []).filter(match)
  const keyOf = (c: Container): string =>
    groupBy === "status"
      ? uiStatus(c).label
      : groupBy === "health"
        ? healthLabel(c.health)
        : shortImage(c.image)

  const map = new Map<string, Container[]>()
  for (const c of all) {
    const key = keyOf(c)
    const arr = map.get(key)
    if (arr) arr.push(c)
    else map.set(key, [c])
  }
  return Array.from(map, ([key, containers]) => ({
    key,
    label: cap(key),
    containers,
  }))
}

function StatCard({
  label,
  value,
  dot,
  isSelected,
  onSelect,
}: {
  label: string
  value: number
  dot?: "success" | "warning" | "error" | "neutral"
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <SelectableCard
      label={`Filter by ${label}`}
      isSelected={isSelected}
      onChange={onSelect}
      padding={4}
    >
      <VStack gap={1}>
        <HStack gap={2} vAlign="center">
          {dot && <StatusDot variant={dot} label={label} />}
          <Text type="supporting" color="secondary">
            {label}
          </Text>
        </HStack>
        <Heading level={2}>{value}</Heading>
      </VStack>
    </SelectableCard>
  )
}

function ContainerRow({
  container,
  onSelect,
}: {
  container: Container
  onSelect: () => void
}) {
  const s = uiStatus(container)
  return (
    <TableRow
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <TableCell>
        <Center axis="horizontal">
          <StatusDot
            variant={DOT_VARIANT[s.kind]}
            isPulsing={s.kind === "alert"}
            label={s.label}
          />
        </Center>
      </TableCell>
      <TableCell>
        <HStack gap={3} vAlign="center">
          <Text type="supporting" color="secondary">
            {container.id.slice(0, 12)}
          </Text>
          <Text type="body" weight="semibold" maxLines={1}>
            {container.name}
          </Text>
          <Tooltip content={container.image} hasHoverIndication={false}>
            <Text type="supporting" color="secondary" maxLines={1}>
              › {shortImage(container.image)}
            </Text>
          </Tooltip>
          {container.ignored && <Badge variant="neutral" label="Ignored" />}
        </HStack>
      </TableCell>
      <TableCell>
        <StatusBadge kind={s.kind} label={s.label} />
      </TableCell>
      <TableCell>
        <Text type="supporting" color="secondary" maxLines={1}>
          {container.status}
        </Text>
      </TableCell>
      <TableCell>
        <Text type="supporting" color="secondary" maxLines={1}>
          {container.host}
        </Text>
      </TableCell>
      <TableCell>
        <HStack hAlign="end" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
          <MoreMenu
            label={`Actions for ${container.name}`}
            size="sm"
            items={[
              { label: "Copy name", icon: TagIcon, onClick: () => copy(container.name) },
              { label: "Copy image", icon: DocumentDuplicateIcon, onClick: () => copy(container.image) },
              { label: "Copy container ID", icon: DocumentDuplicateIcon, onClick: () => copy(container.id) },
            ]}
          />
        </HStack>
      </TableCell>
    </TableRow>
  )
}

function SpanRow({ colCount, children }: { colCount: number; children: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={colCount} style={spanCell}>
        {children}
      </TableCell>
    </TableRow>
  )
}

export function DashboardContent({
  blocks,
  configError,
  groupBy,
  onGroupByChange,
  onSelectContainer,
  hostFilter,
}: {
  blocks: HostBlock[]
  configError: string | null
  groupBy: GroupByField
  onGroupByChange: (value: GroupByField) => void
  onSelectContainer: (container: Container) => void
  hostFilter?: string | null
}) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const query = search.trim().toLowerCase()

  // When a host is picked in the sidebar, narrow the whole view to it.
  const shownBlocks = useMemo(
    () => (hostFilter ? blocks.filter((b) => b.status.alias === hostFilter) : blocks),
    [blocks, hostFilter],
  )

  const groups = useMemo(
    () => buildGroups(shownBlocks, groupBy, query, statusFilter),
    [shownBlocks, groupBy, query, statusFilter],
  )
  const groupKeys = useMemo(() => groups.map((g) => g.key), [groups])

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prune stale group keys when grouping changes
    setCollapsed((prev) => {
      const next = new Set([...prev].filter((k) => groupKeys.includes(k)))
      return next.size === prev.size ? prev : next
    })
  }, [groupKeys])

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const counts = useMemo(() => {
    const list = shownBlocks.flatMap((b) => b.containers ?? [])
    return {
      all: list.length,
      running: list.filter((c) => c.state === "running").length,
      stopped: list.filter((c) => c.state !== "running").length,
      unhealthy: list.filter((c) => c.health === "unhealthy").length,
    }
  }, [shownBlocks])

  const hostCount = shownBlocks.length
  const COL_COUNT = columns.length
  const resolvedWidths = resolveColumnWidths(columns)

  // Single-select: clicking the active card clears back to "all".
  const selectStatus = (key: StatusFilter) =>
    setStatusFilter((prev) => (prev === key ? "all" : key))

  return (
    <LayoutContent role="main">
      <VStack gap={6} style={pagePad}>
        <VStack gap={4}>
          <VStack gap={0}>
            <Heading level={1}>{hostFilter ?? "Dashboard"}</Heading>
            <Text type="supporting" color="secondary">
              {hostFilter
                ? `${counts.all} container${counts.all === 1 ? "" : "s"} on ${hostFilter}`
                : `${counts.all} container${counts.all === 1 ? "" : "s"} across ${hostCount} host${hostCount === 1 ? "" : "s"}`}
            </Text>
          </VStack>

          <Grid columns={{ minWidth: 180 }} gap={3}>
            {STAT_CARDS.map((card) => (
              <StatCard
                key={card.key}
                label={card.label}
                value={counts[card.key]}
                dot={card.dot}
                isSelected={statusFilter === card.key}
                onSelect={() => selectStatus(card.key)}
              />
            ))}
          </Grid>

          <HStack gap={2} vAlign="center">
            <StackItem size="fill">
              <TextInput
                label="Filter containers"
                isLabelHidden
                startIcon="search"
                placeholder="Filter containers…"
                value={search}
                onChange={setSearch}
                hasClear
              />
            </StackItem>
            <SegmentedControl
              label="Group by"
              value={groupBy}
              onChange={(v) => onGroupByChange(v as GroupByField)}
            >
              {GROUP_BY_OPTIONS.map((opt) => (
                <SegmentedControlItem key={opt.value} value={opt.value} label={opt.label} />
              ))}
            </SegmentedControl>
          </HStack>

          {configError && (
            <Banner
              status="error"
              title="Docker daemon unreachable"
              description={configError}
            />
          )}
        </VStack>

        <VStack style={tableFrame}>
        <Table
          columns={columns}
          density="balanced"
          dividers="rows"
          textOverflow="truncate"
          hasHover
        >
          <colgroup>
            {columns.map((col) => (
              <col key={col.key} style={resolvedWidths.columns.get(col.key)?.style} />
            ))}
          </colgroup>
          {groups.map((group) => {
            const isExpanded = !collapsed.has(group.key)
            const hostError =
              group.host && !group.host.ok && !group.host.disabled
                ? (group.host.error ?? "Host unreachable")
                : null
            return (
              <React.Fragment key={group.key}>
                <TableRow
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleGroup(group.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      toggleGroup(group.key)
                    }
                  }}
                >
                  <TableCell colSpan={COL_COUNT} style={groupHeaderCell}>
                    <HStack gap={2} vAlign="center">
                      <Icon
                        icon={isExpanded ? ChevronDownIcon : ChevronRightIcon}
                        size="sm"
                        color="secondary"
                      />
                      {group.host && (
                        <StatusDot
                          variant={
                            group.host.disabled
                              ? "neutral"
                              : group.loading
                                ? "accent"
                                : group.host.ok
                                  ? "success"
                                  : "error"
                          }
                          isPulsing={group.loading}
                          label={group.label}
                        />
                      )}
                      <Text type="body" weight="bold">
                        {group.label}
                      </Text>
                      {group.host?.disabled && <Badge variant="neutral" label="Paused" />}
                      <Badge variant="neutral" label={String(group.containers.length)} />
                    </HStack>
                  </TableCell>
                </TableRow>
                {isExpanded && group.loading && (
                  <SpanRow colCount={COL_COUNT}>
                    <HStack gap={2} vAlign="center">
                      <Spinner size="sm" />
                      <Text type="supporting" color="secondary">
                        Connecting…
                      </Text>
                    </HStack>
                  </SpanRow>
                )}
                {isExpanded && hostError && (
                  <SpanRow colCount={COL_COUNT}>
                    <HStack gap={2} vAlign="center">
                      <Icon icon={ExclamationTriangleIcon} size="sm" color="error" />
                      <Text type="supporting" color="secondary">
                        {hostError}
                      </Text>
                    </HStack>
                  </SpanRow>
                )}
                {isExpanded &&
                  !group.loading &&
                  !hostError &&
                  group.containers.length === 0 && (
                    <SpanRow colCount={COL_COUNT}>
                      <Text type="supporting" color="secondary">
                        {group.host?.disabled
                          ? "Monitoring paused."
                          : query || statusFilter !== "all"
                            ? "No containers match the filter."
                            : "No containers."}
                      </Text>
                    </SpanRow>
                  )}
                {isExpanded &&
                  group.containers.map((c) => (
                    <ContainerRow
                      key={c.id}
                      container={c}
                      onSelect={() => onSelectContainer(c)}
                    />
                  ))}
              </React.Fragment>
            )
          })}
        </Table>
        </VStack>
      </VStack>
    </LayoutContent>
  )
}

export function ContainerDetailPanel({
  container,
  onClose,
  resizable,
}: {
  container: Container
  onClose: () => void
  resizable: ResizableProps
}) {
  const s = uiStatus(container)
  return (
    <LayoutPanel
      hasDivider
      resizable={resizable}
      padding={4}
      role="complementary"
      label="Container details"
    >
      <VStack gap={4}>
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            <Text type="supporting" color="secondary">
              {container.host}
            </Text>
          </StackItem>
          <IconButton
            label="Close panel"
            tooltip="Close"
            variant="ghost"
            size="sm"
            icon={<Icon icon={XMarkIcon} size="sm" />}
            onClick={onClose}
          />
        </HStack>

        <VStack gap={1}>
          <Heading level={2}>{container.name}</Heading>
          <Text type="supporting" color="secondary">
            {shortImage(container.image)}
          </Text>
        </VStack>

        <MetadataList label={{ position: "start" }}>
          <MetadataListItem label="Status">
            <StatusBadge kind={s.kind} label={s.label} />
          </MetadataListItem>
          <MetadataListItem label="State">
            <Badge variant="neutral" label={container.state} />
          </MetadataListItem>
          <MetadataListItem label="Health">
            <Badge variant="neutral" label={healthLabel(container.health)} />
          </MetadataListItem>
          <MetadataListItem label="Host">{container.host}</MetadataListItem>
          <MetadataListItem label="Uptime">{container.status}</MetadataListItem>
          <MetadataListItem label="Monitored">
            {container.ignored ? "Ignored" : "Yes"}
          </MetadataListItem>
        </MetadataList>

        <Divider />

        <VStack gap={2}>
          <Text type="label">Image</Text>
          <CodeBlock code={container.image} size="sm" width="100%" />
          <Text type="label">Container ID</Text>
          <CodeBlock code={container.id} size="sm" width="100%" />
        </VStack>
      </VStack>
    </LayoutPanel>
  )
}
