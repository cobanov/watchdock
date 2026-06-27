import { useEffect, useMemo, useState } from "react"
import { LayoutContent, VStack, HStack, StackItem } from "@astryxdesign/core/Layout"
import { Text, Heading } from "@astryxdesign/core/Text"
import { TextInput } from "@astryxdesign/core/TextInput"
import { Banner } from "@astryxdesign/core/Banner"
import { Center } from "@astryxdesign/core/Center"
import { Spinner } from "@astryxdesign/core/Spinner"
import { EmptyState } from "@astryxdesign/core/EmptyState"
import { fetchEvents, type ContainerEvent, type EventKind } from "@/lib/api"
import { pagePad } from "@/app/lib/styles"

const POLL_INTERVAL_MS = 5000

const KIND_META: Record<
  EventKind,
  { label: string; status: "info" | "warning" | "error" | "success" }
> = {
  crashed: { label: "Crashed", status: "error" },
  unhealthy: { label: "Unhealthy", status: "error" },
  stopped: { label: "Stopped", status: "warning" },
  started: { label: "Started", status: "success" },
  healthy: { label: "Recovered", status: "success" },
}

function formatTime(t: number): string {
  const d = new Date(t * 1000)
  const time = d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  if (d.toDateString() === new Date().toDateString()) return time
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`
}

export function EventsPage() {
  const [events, setEvents] = useState<ContainerEvent[] | null>(null)
  const [filter, setFilter] = useState("")

  useEffect(() => {
    const load = () => fetchEvents().then(setEvents).catch(() => {})
    load()
    const timer = setInterval(load, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  const query = filter.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!events) return []
    if (!query) return events
    return events.filter(
      (e) =>
        e.container.toLowerCase().includes(query) ||
        e.host.toLowerCase().includes(query) ||
        e.kind.includes(query),
    )
  }, [events, query])

  return (
    <LayoutContent role="main">
      <VStack gap={6} style={pagePad}>
        <HStack gap={3} vAlign="center">
          <StackItem size="fill">
            <VStack gap={0}>
              <Heading level={1}>Event Log</Heading>
              <Text type="supporting" color="secondary">
                Container starts, stops, crashes and health changes across all hosts,
                newest first.
              </Text>
            </VStack>
          </StackItem>
        </HStack>

        <TextInput
          label="Filter events"
          isLabelHidden
          startIcon="search"
          placeholder="Filter by container, host or event…"
          value={filter}
          onChange={setFilter}
          hasClear
        />

        {events === null ? (
          <Center style={{ padding: "var(--spacing-8)" }}>
            <Spinner size="md" label="Loading events…" />
          </Center>
        ) : filtered.length === 0 ? (
          <Center style={{ padding: "var(--spacing-8)" }}>
            <EmptyState
              title={query ? "No matching events" : "No events yet"}
              description={
                query
                  ? "No events match the filter."
                  : "Container starts, stops and crashes will appear here."
              }
            />
          </Center>
        ) : (
          <VStack gap={2}>
            {filtered.map((e, i) => {
              const meta = KIND_META[e.kind] ?? { label: e.kind, status: "info" as const }
              return (
                <Banner
                  key={`${e.t}-${e.host}-${e.container}-${i}`}
                  status={meta.status}
                  title={`${e.container} — ${meta.label}`}
                  description={`${e.host} · ${formatTime(e.t)}${e.detail ? ` · ${e.detail}` : ""}`}
                />
              )
            })}
          </VStack>
        )}
      </VStack>
    </LayoutContent>
  )
}
