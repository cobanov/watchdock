# dockwatch

A tiny self-hosted watchdog for your Docker containers. It runs as a container itself, watches every other container on the machine, and pushes a notification to your phone via [ntfy.sh](https://ntfy.sh) when something goes wrong.

**▶︎ [Try the live demo](https://dockwatch-demo.pages.dev)** — the full dashboard with realistic sample data, no install required.

- 🔴 **Unhealthy** — a container's healthcheck starts failing
- 💀 **Crashed** — a container dies with a non-zero exit code (a manual `docker stop` counts as stopped, not crashed)
- ✅ **Recovered** — a container comes back healthy / back up
- 🛑 **Stopped** — a container exits cleanly or is stopped by hand
- ▶️ **Started** — a container starts or restarts

It can also watch **remote machines over SSH**: add a host from the UI and dockwatch monitors its Docker daemon through an SSH-forwarded socket — nothing to install on the remote side.

Single static Go binary (only dependency: `golang.org/x/crypto` for SSH), ~11 MB image. The web UI is React + the [Astryx](https://astryx.atmeta.com) design system, embedded into the binary at build time. Works anywhere Docker Desktop or the Docker daemon runs: macOS, Windows (WSL2), Linux.

The dashboard groups containers by host (or status / health / image), surfaces live status as colour-coded badges, and has pages for the event log, ntfy notifications, a setup guide, and SSH host management — all in a collapsible sidebar with light/dark themes.

## Quick start

```bash
git clone https://github.com/cobanov/dockwatch.git
cd dockwatch
docker compose up -d --build
```

Open **http://localhost:9622**, set an ntfy topic, hit **Save**, then **Send test notification**.

On your phone, install the [ntfy app](https://ntfy.sh/) (iOS/Android) and subscribe to the same topic. That's it — anyone who knows the topic name can read it, so pick something unguessable.

## Live demo

**Live at [dockwatch-demo.pages.dev](https://dockwatch-demo.pages.dev).**

A fully interactive, **backend-free** build of the dashboard ships with realistic in-memory data — click around the grouped table, host filters, detail panel, event log and settings without a Docker daemon. It's a normal static bundle, so it deploys anywhere (Cloudflare Pages, Netlify, GitHub Pages, …):

```bash
cd web
npm install
npm run build:demo        # sets VITE_DEMO=1; emits a static site to web/dist
```

Deploy `web/dist` as static files. On **Cloudflare Pages** either:

- **Dashboard** — connect this repo, set build command `cd web && npm ci && npm run build:demo` and output directory `web/dist`; or
- **CLI** — `cd web && npm run build:demo && npx wrangler pages deploy dist --project-name dockwatch-demo`

The demo runs entirely in the browser (a `LIVE DEMO` badge marks it); edits, toggles and saves mutate in-memory state and reset on reload.

## Configuration

Everything is configured from the web UI and stored in a Docker volume (`/data/config.json`):

| Setting | Default | Description |
|---|---|---|
| ntfy server | `https://ntfy.sh` | Any ntfy server, including self-hosted |
| Topic | `dockwatch` | The channel your phone subscribes to — change it to something unguessable on the public ntfy.sh |
| Access token | — | Only needed for auth-protected servers |
| Unhealthy / Crashed / Recovered / Stopped / Started | all on | Toggle each notification type |
| Ignore | — | Comma-separated container names, `*` wildcards supported |

Notifications fire only on state *transitions* and are rate-limited to one per container per type per 5 minutes, so a crash-looping container won't flood your phone.

### Remote hosts

Use the **+** next to *Hosts* in the sidebar — or the **Hosts** page (*Manage hosts*) — to add a machine (its address, SSH user and optionally port, alias, key path or password). The Hosts page also imports hosts from a previously exported file and exports your hosts to `dockwatch-hosts.json` (passwords are never exported). dockwatch also imports literal hosts from your mounted SSH config (`/ssh/config` by default) on startup when they have `HostName` and `User` entries, and the host dialog has an *Import SSH config* button to pull in newly-added entries. Authentication uses SSH keys / ssh-agent (recommended) or a password — note that passwords are stored in plain text in `config.json`. Your remote user must be able to access `/var/run/docker.sock` (i.e. in the `docker` group).

Hosts are paused/resumed with the toggle next to their name — pausing keeps the host in the config but stops monitoring. To remove one permanently, delete its entry from `config.json` in the data volume.

Keys are read from `~/.ssh`, mounted read-only into the container (see `docker-compose.yml`). Passphrase-protected keys work through ssh-agent forwarding, which Docker Desktop exposes automatically on macOS/Windows; on Linux, point the `SSH_AUTH_SOCK` mount at your agent socket instead. Host keys are pinned on first use to `/data/known_hosts`.

### Environment variables

| Variable | Default |
|---|---|
| `PORT` | `9622` |
| `DOCKER_SOCKET` | `/var/run/docker.sock` |
| `CONFIG_PATH` | `/data/config.json` |
| `EVENTS_PATH` | `/data/events.json` |
| `SSH_KEY_DIR` | `/ssh` |
| `SSH_CONFIG_PATH` | `/ssh/config` |
| `KNOWN_HOSTS_PATH` | `/data/known_hosts` |

## How it works

dockwatch subscribes to the Docker events stream over the (read-only) mounted socket and falls back to a 30-second reconcile poll in case the stream drops. The Docker Engine API is called directly with Go's standard library — no SDK, no external dependencies.

## Development

```bash
# build the UI once (go:embed needs web/dist to exist)
cd web && npm install && npm run build && cd ..

# run the backend
CONFIG_PATH=./config.json go run .

# UI dev server with hot reload (proxies /api to :9622)
cd web && npm run dev
```

## License

MIT
