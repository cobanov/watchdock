import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  fetchConfig,
  fetchHostContainers,
  type Container,
  type HostConfig,
  type HostStatus,
} from "@/lib/api"

// A host's live status plus its containers; containers === null means the
// host's data is still being fetched (renders a per-host loading state).
export interface HostBlock {
  status: HostStatus
  containers: Container[] | null
}

export function isHostLoading(block: HostBlock): boolean {
  return block.containers === null && !block.status.disabled
}

const POLL_INTERVAL_MS = 5000
const LOCAL_ALIAS = "local"

export interface Fleet {
  // Host blocks in display order (local pinned first).
  blocks: HostBlock[]
  // Every loaded container across all hosts.
  allContainers: Container[]
  // Configured remote hosts (full config, for the sidebar + Hosts page).
  hosts: HostConfig[]
  // False when the dockwatch daemon /config endpoint is unreachable.
  apiOnline: boolean
  configError: string | null
  refresh: () => void
}

// Polls the dockwatch daemon for every configured host on an interval, patching
// each host's block in place so fast hosts render without waiting for slow ones.
// Lifted from the original App.tsx data layer.
export function useFleet(): Fleet {
  const [order, setOrder] = useState<string[]>([LOCAL_ALIAS])
  const [hostStates, setHostStates] = useState<Record<string, HostBlock>>({
    [LOCAL_ALIAS]: { status: { alias: LOCAL_ALIAS, ok: true }, containers: null },
  })
  const [configError, setConfigError] = useState<string | null>(null)
  const [hosts, setHosts] = useState<HostConfig[]>([])

  // Guards against overlapping fetches for the same host: an unreachable host
  // can take seconds to time out, and the poll would otherwise pile up.
  const inFlight = useRef<Set<string>>(new Set())

  const refreshHost = useCallback(async (alias: string) => {
    if (inFlight.current.has(alias)) return
    inFlight.current.add(alias)
    try {
      const res = await fetchHostContainers(alias)
      setHostStates((prev) => ({
        ...prev,
        [alias]: { status: res.host, containers: res.containers ?? [] },
      }))
    } catch (e) {
      setHostStates((prev) => ({
        ...prev,
        [alias]: {
          status: { alias, ok: false, error: e instanceof Error ? e.message : String(e) },
          containers: prev[alias]?.containers ?? [],
        },
      }))
    } finally {
      inFlight.current.delete(alias)
    }
  }, [])

  const refresh = useCallback(async () => {
    let cfg
    try {
      cfg = await fetchConfig()
      setConfigError(null)
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : String(e))
      return
    }

    const roster = [LOCAL_ALIAS, ...cfg.hosts.map((h) => h.alias)]
    setOrder(roster)
    setHosts(cfg.hosts)

    setHostStates((prev) => {
      const next: Record<string, HostBlock> = {
        [LOCAL_ALIAS]: prev[LOCAL_ALIAS] ?? {
          status: { alias: LOCAL_ALIAS, ok: true },
          containers: null,
        },
      }
      for (const h of cfg.hosts) {
        if (h.disabled) {
          next[h.alias] = {
            status: { alias: h.alias, ok: true, disabled: true },
            containers: [],
          }
        } else {
          next[h.alias] = prev[h.alias]?.status.disabled
            ? { status: { alias: h.alias, ok: true }, containers: null }
            : (prev[h.alias] ?? { status: { alias: h.alias, ok: true }, containers: null })
        }
      }
      return next
    })

    const live = [LOCAL_ALIAS, ...cfg.hosts.filter((h) => !h.disabled).map((h) => h.alias)]
    live.forEach((alias) => refreshHost(alias))
  }, [refreshHost])

  // Avoid a stale closure in the polling interval.
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect(() => {
    const tick = () => refreshRef.current()
    const initial = setTimeout(tick, 0)
    const timer = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      clearTimeout(initial)
      clearInterval(timer)
    }
  }, [])

  const blocks = useMemo(
    () => order.map((alias) => hostStates[alias]).filter(Boolean),
    [order, hostStates],
  )

  const allContainers = useMemo(
    () => blocks.flatMap((b) => b.containers ?? []),
    [blocks],
  )

  return {
    blocks,
    allContainers,
    hosts,
    apiOnline: configError === null,
    configError,
    refresh,
  }
}
