export interface Container {
  id: string
  name: string
  image: string
  state: string
  health: string
  status: string
  ignored: boolean
}

export interface Config {
  ntfyServer: string
  ntfyTopic: string
  ntfyToken: string
  notifyUnhealthy: boolean
  notifyDown: boolean
  notifyRecovered: boolean
  ignore: string[]
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? res.statusText)
  }
  return body as T
}

export const fetchContainers = () => request<Container[]>("/containers")
export const fetchConfig = () => request<Config>("/config")
export const sendTestNotification = () =>
  request<{ status: string }>("/test", { method: "POST" })
export const saveConfig = (cfg: Config) =>
  request<Config>("/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  })

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
