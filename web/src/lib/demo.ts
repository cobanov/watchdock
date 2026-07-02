// Demo mode: a fully in-memory backend so the real dashboard can be hosted
// statically (e.g. Cloudflare Pages) with no daemon. Enabled at build time with
// VITE_DEMO=1 (`npm run build:demo`). api.ts short-circuits to these helpers.
import type {
  Config,
  Container,
  ContainerEvent,
  HostContainersResponse,
} from "@/lib/api"

export const DEMO = import.meta.env.VITE_DEMO === "1"

// Deterministic 64-char hex id (like a real Docker container id) from a seed.
function hexId(seed: string): string {
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    h = (h ^ seed.charCodeAt(i)) >>> 0
    h = (h * 16777619) >>> 0
  }
  let out = ""
  let x = h
  while (out.length < 64) {
    out += (x >>> 0).toString(16).padStart(8, "0")
    x = (x * 2654435761 + 1) >>> 0
  }
  return out.slice(0, 64)
}

const c = (
  host: string,
  name: string,
  image: string,
  state: string,
  health: string,
  status: string,
  ports: string[] = [],
): Container => ({
  id: hexId(`${host}/${name}`),
  name,
  image,
  state,
  health,
  status,
  ports,
  ignored: false,
  host,
})

// Per-host container fleet. A spread of healthy / running / unhealthy / exited
// states so every status colour and the detail panel are visible at a glance.
const containers: Record<string, Container[]> = {
  local: [
    c("local", "watchdock", "ghcr.io/cobanov/watchdock:latest", "running", "healthy", "Up 6 days (healthy)", ["8080→8080/tcp"]),
    c("local", "traefik", "traefik:v3", "running", "healthy", "Up 6 days (healthy)", ["80→80/tcp", "443→443/tcp", "8080/tcp"]),
    c("local", "portainer", "portainer/portainer-ce:latest", "running", "none", "Up 6 days", ["9000→9000/tcp"]),
    c("local", "grafana", "grafana/grafana:latest", "running", "healthy", "Up 6 days (healthy)", ["3000→3000/tcp"]),
    c("local", "prometheus", "prom/prometheus:latest", "running", "none", "Up 6 days", ["9090→9090/tcp"]),
  ],
  "web-prod": [
    c("web-prod", "nginx", "nginx:1.27-alpine", "running", "healthy", "Up 12 days (healthy)", ["80→80/tcp", "443→443/tcp"]),
    c("web-prod", "storefront", "ghcr.io/acme/storefront:2.4.1", "running", "healthy", "Up 2 days (healthy)", ["3000/tcp"]),
    c("web-prod", "api", "ghcr.io/acme/api:2.4.1", "running", "healthy", "Up 2 days (healthy)", ["8080/tcp"]),
    c("web-prod", "worker", "ghcr.io/acme/worker:2.4.1", "running", "none", "Up 2 days"),
    c("web-prod", "redis", "redis:7-alpine", "running", "healthy", "Up 12 days (healthy)", ["6379/tcp"]),
  ],
  "db-prod": [
    c("db-prod", "postgres-primary", "postgres:16", "running", "healthy", "Up 30 days (healthy)", ["5432→5432/tcp"]),
    c("db-prod", "postgres-replica", "postgres:16", "running", "healthy", "Up 30 days (healthy)", ["5433→5432/tcp"]),
    c("db-prod", "pgbouncer", "edoburu/pgbouncer:latest", "running", "none", "Up 30 days", ["6432→6432/tcp"]),
    c("db-prod", "nightly-backup", "ghcr.io/acme/pgbackup:1.2", "exited", "none", "Exited (0) 3 hours ago"),
  ],
  edge: [
    c("edge", "caddy", "caddy:2-alpine", "running", "healthy", "Up 8 days (healthy)", ["80→80/tcp", "443→443/tcp"]),
    c("edge", "cloudflared", "cloudflare/cloudflared:latest", "running", "none", "Up 8 days"),
    c("edge", "jellyfin", "jellyfin/jellyfin:latest", "running", "unhealthy", "Up 5 hours (unhealthy)", ["8096→8096/tcp"]),
    c("edge", "qbittorrent", "linuxserver/qbittorrent:latest", "restarting", "none", "Restarting (1) 40 seconds ago", ["8080→8080/tcp", "6881→6881/tcp", "6881→6881/udp"]),
  ],
}

// `ci` is configured but unreachable — shows the offline-host state.
const config: Config = {
  ntfyServer: "https://ntfy.sh",
  ntfyTopic: "watchdock-demo",
  ntfyToken: "",
  notifyUnhealthy: true,
  notifyDown: true,
  notifyRecovered: true,
  notifyStopped: false,
  notifyStarted: false,
  ignore: ["watchtower", "*-cron"],
  hosts: [
    { alias: "web-prod", host: "10.0.1.20", user: "deploy", keyPath: "~/.ssh/id_ed25519" },
    { alias: "db-prod", host: "10.0.1.30", user: "deploy", keyPath: "~/.ssh/id_ed25519" },
    { alias: "edge", host: "edge.example.com", user: "ops", port: 2222 },
    { alias: "ci", host: "10.0.1.40", user: "runner" },
  ],
}

const now = Math.floor(Date.now() / 1000)
const ev = (
  ago: number,
  host: string,
  container: string,
  kind: ContainerEvent["kind"],
  detail?: string,
): ContainerEvent => ({ t: now - ago, host, container, kind, detail })

const events: ContainerEvent[] = [
  ev(95, "edge", "jellyfin", "unhealthy", "healthcheck failing"),
  ev(140, "edge", "qbittorrent", "crashed", "exited with code 1"),
  ev(220, "edge", "qbittorrent", "started"),
  ev(3 * 3600, "db-prod", "nightly-backup", "stopped", "exited with code 0"),
  ev(3 * 3600 + 30, "db-prod", "nightly-backup", "started"),
  ev(6 * 3600, "web-prod", "api", "healthy", "back to healthy"),
  ev(6 * 3600 + 120, "web-prod", "api", "unhealthy", "healthcheck failing"),
  ev(2 * 86400, "web-prod", "storefront", "started", "deployed 2.4.1"),
  ev(2 * 86400 + 5, "web-prod", "api", "started", "deployed 2.4.1"),
]

// Mutable copy so toggles, saves and host edits feel live in the demo.
const store = {
  config: structuredClone(config),
  containers: structuredClone(containers),
  events,
}

const delay = <T>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), 180))

export const demoFetchConfig = () => delay(structuredClone(store.config))

export const demoSaveConfig = (cfg: Config) => {
  store.config = structuredClone(cfg)
  return delay(structuredClone(store.config))
}

export const demoFetchHostContainers = (alias: string): Promise<HostContainersResponse> => {
  const host = store.config.hosts.find((h) => h.alias === alias)
  if (host?.disabled)
    return delay({ host: { alias, ok: true, disabled: true }, containers: [] })
  if (alias === "ci")
    return delay({ host: { alias, ok: false, error: "dial tcp 10.0.1.40:22: connect: connection refused" }, containers: [] })
  return delay({ host: { alias, ok: true }, containers: store.containers[alias] ?? [] })
}

export const demoFetchEvents = () => delay(store.events)
export const demoTestNotification = () => delay({ status: "sent" })
export const demoTestHost = () => delay({ ok: true, containers: 5 })
export const demoImportSSHConfig = () => delay({ added: 0, hosts: [] })
