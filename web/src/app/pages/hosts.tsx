import { useRef, type ChangeEvent } from "react"
import { LayoutContent, VStack, HStack, StackItem } from "@astryxdesign/core/Layout"
import { Text, Heading } from "@astryxdesign/core/Text"
import { Button } from "@astryxdesign/core/Button"
import { IconButton } from "@astryxdesign/core/IconButton"
import { Badge } from "@astryxdesign/core/Badge"
import { Switch } from "@astryxdesign/core/Switch"
import { Center } from "@astryxdesign/core/Center"
import { Icon } from "@astryxdesign/core/Icon"
import { StatusDot } from "@astryxdesign/core/StatusDot"
import { EmptyState } from "@astryxdesign/core/EmptyState"
import { useToast } from "@astryxdesign/core/Toast"
import {
  Table,
  TableRow,
  TableCell,
  proportional,
  pixel,
  resolveColumnWidths,
} from "@astryxdesign/core/Table"
import type { TableColumn } from "@astryxdesign/core/Table"
import { PencilIcon } from "@heroicons/react/24/outline"
import { exportHosts, importHostsFromFile, type HostConfig } from "@/lib/api"
import type { HostBlock } from "@/app/lib/use-fleet"
import { hostStatusDot } from "@/app/lib/host-status"
import { pagePad, tableFrame } from "@/app/lib/styles"

const columns: TableColumn<Record<string, unknown>>[] = [
  { key: "status", header: "", width: pixel(40) },
  { key: "alias", header: "Host", width: proportional(1) },
  { key: "endpoint", header: "Endpoint", width: pixel(280) },
  { key: "monitoring", header: "Monitoring", width: pixel(140) },
  { key: "actions", header: "", width: pixel(56) },
]

export function HostsPage({
  hosts,
  blocks,
  onAdd,
  onEdit,
  onToggle,
  refresh,
}: {
  hosts: HostConfig[]
  blocks: HostBlock[]
  onAdd: () => void
  onEdit: (host: HostConfig) => void
  onToggle: (alias: string, disabled: boolean) => void
  refresh: () => void
}) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const resolvedWidths = resolveColumnWidths(columns)
  const localBlock = blocks.find((b) => b.status.alias === "local")

  const handleExport = async () => {
    try {
      const n = await exportHosts()
      toast({ body: n ? `Exported ${n} host${n === 1 ? "" : "s"}` : "No hosts to export" })
    } catch (e) {
      toast({ body: e instanceof Error ? e.message : String(e), type: "error" })
    }
  }

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    try {
      const { added, updated } = await importHostsFromFile(file)
      toast({ body: `Imported hosts — ${added} added, ${updated} updated` })
      refresh()
    } catch (err) {
      toast({ body: err instanceof Error ? err.message : String(err), type: "error" })
    }
  }

  const dot = (block: HostBlock | undefined, disabled?: boolean) => {
    const d = hostStatusDot(block, disabled)
    return <StatusDot variant={d.variant} isPulsing={d.pulse} label={d.label} />
  }

  return (
    <LayoutContent role="main">
      <VStack gap={6} style={pagePad}>
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            <VStack gap={0}>
              <Heading level={1}>Hosts</Heading>
              <Text type="supporting" color="secondary">
                Monitor Docker on remote machines over SSH. The local daemon is always
                watched.
              </Text>
            </VStack>
          </StackItem>
          <Button label="Import from file" variant="ghost" onClick={() => fileRef.current?.click()} />
          <Button label="Export" variant="ghost" onClick={handleExport} />
          <Button label="Add host" variant="primary" onClick={onAdd} />
        </HStack>

        <VStack style={tableFrame}>
          <Table columns={columns} density="balanced" dividers="rows">
            <colgroup>
              {columns.map((col) => (
                <col key={col.key} style={resolvedWidths.columns.get(col.key)?.style} />
              ))}
            </colgroup>
            <TableRow>
              <TableCell>
                <Center axis="horizontal">{dot(localBlock)}</Center>
              </TableCell>
              <TableCell>
                <Text type="body" weight="semibold">
                  local
                </Text>
              </TableCell>
              <TableCell>
                <Text type="supporting" color="secondary">
                  In-container Docker socket
                </Text>
              </TableCell>
              <TableCell>
                <Badge variant="neutral" label="Always on" />
              </TableCell>
              <TableCell> </TableCell>
            </TableRow>
            {hosts.map((h) => {
              const block = blocks.find((b) => b.status.alias === h.alias)
              const auth = h.keyPath ? "SSH key" : h.password ? "Password" : "Agent / auto"
              return (
                <TableRow key={h.alias}>
                  <TableCell>
                    <Center axis="horizontal">{dot(block, h.disabled)}</Center>
                  </TableCell>
                  <TableCell>
                    <HStack gap={2} vAlign="center">
                      <Text type="body" weight="semibold" maxLines={1}>
                        {h.alias}
                      </Text>
                      <Badge variant="neutral" label={auth} />
                    </HStack>
                  </TableCell>
                  <TableCell>
                    <Text type="supporting" color="secondary" maxLines={1}>
                      {h.user}@{h.host}
                      {h.port ? `:${h.port}` : ""}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Switch
                      label={`Monitor ${h.alias}`}
                      isLabelHidden
                      value={!h.disabled}
                      onChange={(on) => onToggle(h.alias, !on)}
                    />
                  </TableCell>
                  <TableCell>
                    <HStack hAlign="end">
                      <IconButton
                        label={`Edit ${h.alias}`}
                        tooltip="Edit"
                        variant="ghost"
                        size="sm"
                        icon={<Icon icon={PencilIcon} size="sm" />}
                        onClick={() => onEdit(h)}
                      />
                    </HStack>
                  </TableCell>
                </TableRow>
              )
            })}
          </Table>
        </VStack>

        {hosts.length === 0 && (
          <Center style={{ padding: "var(--spacing-6)" }}>
            <EmptyState
              title="No remote hosts yet"
              description="Add a host to monitor Docker on another machine over SSH."
              actions={<Button label="Add host" variant="primary" onClick={onAdd} />}
            />
          </Center>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={handleImportFile}
        />
      </VStack>
    </LayoutContent>
  )
}
