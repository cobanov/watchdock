export interface Container {
  id: string
  name: string
  image: string
  state: string
  health: string
  status: string
  ignored: boolean
  host: string
}

export interface HostConfig {
  alias: string
  host: string
  user: string
  port?: number
  keyPath?: string
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
  ignore: string[]
  hosts: HostConfig[]
}

export interface ContainersResponse {
  hosts: HostStatus[]
  containers: Container[]
}

export interface HistoryPoint {
  t: number // unix seconds
  running: number
  unhealthy: number
  stopped: number
  total: number
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
export const fetchHistory = () => request<HistoryPoint[]>("/history")
export const fetchConfig = () => request<Config>("/config")
export const saveConfig = (cfg: Config) => request<Config>("/config", jsonInit("PUT", cfg))
export const sendTestNotification = () =>
  request<{ status: string }>("/test", { method: "POST" })
export const testHost = (h: HostConfig) =>
  request<{ ok: boolean; containers: number }>("/hosts/test", jsonInit("POST", h))
export const importSSHConfigHosts = () =>
  request<{ added: number; hosts: HostConfig[] }>("/hosts/import-ssh-config", {
    method: "POST",
  })

export async function addHost(h: HostConfig): Promise<Config> {
  const cfg = await fetchConfig()
  return saveConfig({ ...cfg, hosts: [...cfg.hosts, h] })
}

export async function setHostDisabled(alias: string, disabled: boolean): Promise<Config> {
  const cfg = await fetchConfig()
  return saveConfig({
    ...cfg,
    hosts: cfg.hosts.map((h) => (h.alias === alias ? { ...h, disabled } : h)),
  })
}

export type StatusKind = "ok" | "warn" | "alert" | "idle"

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
