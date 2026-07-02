import {
  DEMO,
  demoFetchConfig,
  demoSaveConfig,
  demoFetchHostContainers,
  demoFetchEvents,
  demoTestNotification,
  demoTestHost,
  demoImportSSHConfig,
} from "@/lib/demo"

export interface Container {
  id: string
  name: string
  image: string
  state: string
  health: string
  status: string
  ports: string[]
  ignored: boolean
  host: string
}

export interface HostConfig {
  alias: string
  host: string
  user: string
  port?: number
  keyPath?: string
  password?: string
  disabled?: boolean
}

export interface HostStatus {
  alias: string
  ok: boolean
  error?: string
  disabled?: boolean
}

export interface Config {
  ntfyServer: string
  ntfyTopic: string
  ntfyToken: string
  notifyUnhealthy: boolean
  notifyDown: boolean
  notifyRecovered: boolean
  notifyStopped: boolean
  notifyStarted: boolean
  ignore: string[]
  hosts: HostConfig[]
}

export interface ContainersResponse {
  hosts: HostStatus[]
  containers: Container[]
}

export interface HostContainersResponse {
  host: HostStatus
  containers: Container[]
}

export interface HistoryPoint {
  t: number // unix seconds
  running: number
  unhealthy: number
  stopped: number
  total: number
}

export type EventKind = "crashed" | "stopped" | "started" | "unhealthy" | "healthy"

export interface ContainerEvent {
  t: number // unix seconds
  host: string
  container: string
  kind: EventKind
  detail?: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? res.statusText)
  }
  return body as T
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

export const fetchContainers = () => request<ContainersResponse>("/containers")
export const fetchHostContainers = (alias: string) =>
  DEMO
    ? demoFetchHostContainers(alias)
    : request<HostContainersResponse>(`/containers/${encodeURIComponent(alias)}`)
export const fetchHistory = () => request<HistoryPoint[]>("/history")
export const fetchEvents = () =>
  DEMO ? demoFetchEvents() : request<ContainerEvent[]>("/events")
export const fetchConfig = () =>
  DEMO ? demoFetchConfig() : request<Config>("/config")
export const saveConfig = (cfg: Config) =>
  DEMO ? demoSaveConfig(cfg) : request<Config>("/config", jsonInit("PUT", cfg))
export const sendTestNotification = (opts?: {
  ntfyServer?: string
  ntfyTopic?: string
  ntfyToken?: string
}) =>
  DEMO
    ? demoTestNotification()
    : request<{ status: string }>(
        "/test",
        opts ? jsonInit("POST", opts) : { method: "POST" },
      )
export const testHost = (h: HostConfig) =>
  DEMO
    ? demoTestHost()
    : request<{ ok: boolean; containers: number }>("/hosts/test", jsonInit("POST", h))
export const importSSHConfigHosts = () =>
  DEMO
    ? demoImportSSHConfig()
    : request<{ added: number; hosts: HostConfig[] }>("/hosts/import-ssh-config", {
        method: "POST",
      })

// Fetch the current config, apply a pure transform, and persist the result.
// Shared by the host mutators below so each expresses only its own change.
function mutateConfig(update: (cfg: Config) => Config): Promise<Config> {
  return fetchConfig().then((cfg) => saveConfig(update(cfg)))
}

export function addHost(h: HostConfig): Promise<Config> {
  return mutateConfig((cfg) => ({ ...cfg, hosts: [...cfg.hosts, h] }))
}

export function updateHost(originalAlias: string, h: HostConfig): Promise<Config> {
  return mutateConfig((cfg) => ({
    ...cfg,
    hosts: cfg.hosts.map((x) => (x.alias === originalAlias ? h : x)),
  }))
}

export function removeHost(alias: string): Promise<Config> {
  return mutateConfig((cfg) => ({ ...cfg, hosts: cfg.hosts.filter((h) => h.alias !== alias) }))
}

export function setHostDisabled(alias: string, disabled: boolean): Promise<Config> {
  return mutateConfig((cfg) => ({
    ...cfg,
    hosts: cfg.hosts.map((h) => (h.alias === alias ? { ...h, disabled } : h)),
  }))
}

// Persist a new host order. `aliases` lists the (non-local) hosts in the desired
// order; any host not listed is kept at the end so nothing is dropped.
export function reorderHosts(aliases: string[]): Promise<Config> {
  return mutateConfig((cfg) => {
    const byAlias = new Map(cfg.hosts.map((h) => [h.alias, h]))
    const ordered: HostConfig[] = []
    for (const a of aliases) {
      const h = byAlias.get(a)
      if (h) {
        ordered.push(h)
        byAlias.delete(a)
      }
    }
    for (const h of byAlias.values()) ordered.push(h) // safety: keep unlisted hosts
    return { ...cfg, hosts: ordered }
  })
}

// --- Host import / export ------------------------------------------------

const HOSTS_EXPORT_VERSION = 1

interface HostsExport {
  version: number
  exportedAt: string
  hosts: HostConfig[]
}

// Drop the password (a secret; SSH keys live in ~/.ssh, never in this file).
function publicHost(h: HostConfig): HostConfig {
  const out: HostConfig = { alias: h.alias, host: h.host, user: h.user }
  if (h.port) out.port = h.port
  if (h.keyPath) out.keyPath = h.keyPath
  if (h.disabled) out.disabled = h.disabled
  return out
}

// Download the configured hosts as a portable JSON file (passwords excluded).
// Returns the number of hosts written.
export async function exportHosts(): Promise<number> {
  const cfg = await fetchConfig()
  const payload: HostsExport = {
    version: HOSTS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    hosts: cfg.hosts.map(publicHost),
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "watchdock-hosts.json"
  a.click()
  URL.revokeObjectURL(url)
  return cfg.hosts.length
}

export interface ImportResult {
  added: number
  updated: number
}

// Read an exported file and upsert its hosts by alias into the current config.
// Accepts either {hosts:[...]} or a bare array; the backend re-validates on save.
export async function importHostsFromFile(file: File): Promise<ImportResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new Error("Not a valid JSON file")
  }
  const incoming = parseHosts(parsed)
  if (incoming.length === 0) throw new Error("No hosts found in file")

  const cfg = await fetchConfig()
  const byAlias = new Map(cfg.hosts.map((h) => [h.alias, h]))
  let added = 0
  let updated = 0
  for (const h of incoming) {
    const existing = byAlias.get(h.alias)
    if (existing) updated++
    else added++
    byAlias.set(h.alias, { ...existing, ...h }) // keep existing password on update
  }
  await saveConfig({ ...cfg, hosts: [...byAlias.values()] })
  return { added, updated }
}

function parseHosts(parsed: unknown): HostConfig[] {
  const arr = Array.isArray(parsed)
    ? parsed
    : (parsed as { hosts?: unknown } | null)?.hosts
  if (!Array.isArray(arr)) {
    throw new Error('File must contain a "hosts" array')
  }
  return arr.map(toHostConfig)
}

function toHostConfig(raw: unknown): HostConfig {
  const h = (raw ?? {}) as Record<string, unknown>
  const host = String(h.host ?? "").trim()
  const user = String(h.user ?? "").trim()
  if (!host || !user) throw new Error("Each host needs a host and user")
  const alias = String(h.alias ?? "").trim() || host.split(".")[0]
  const out: HostConfig = { alias, host, user }
  if (h.port != null && h.port !== "") out.port = Number(h.port)
  if (typeof h.keyPath === "string" && h.keyPath.trim()) out.keyPath = h.keyPath.trim()
  if (typeof h.disabled === "boolean") out.disabled = h.disabled
  return out
}

export type StatusKind = "ok" | "warn" | "alert" | "idle"

export function hostStatusKind(host: HostStatus): StatusKind {
  if (host.disabled) return "idle"
  return host.ok ? "ok" : "alert"
}

export function uiStatus(c: Container): { kind: StatusKind; label: string } {
  if (c.health === "unhealthy") return { kind: "alert", label: "unhealthy" }
  if (c.health === "starting") return { kind: "warn", label: "starting" }
  if (c.state === "running") {
    return { kind: "ok", label: c.health === "healthy" ? "healthy" : "running" }
  }
  if (c.state === "restarting" || c.state === "paused") {
    return { kind: "warn", label: c.state }
  }
  return { kind: "idle", label: c.state }
}

// Untagged images surface as "sha256:<64 hex>"; show a short digest instead.
export function shortImage(image: string): string {
  return image.startsWith("sha256:") ? image.slice(7, 19) : image
}

export const statusTextClass: Record<StatusKind, string> = {
  ok: "text-ok",
  warn: "text-warn",
  alert: "text-alert",
  idle: "text-idle",
}
