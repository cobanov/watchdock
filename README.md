# watchdock

A tiny self-hosted watchdog for your Docker containers — it watches every container on the machine (and remote ones over SSH) and pushes an alert to your phone the moment something breaks.

**[▶ Live demo](https://watchdock-demo.pages.dev)** · **[Website](https://watchdock.cobanov.dev)**

![watchdock dashboard](docs/dashboard.png)

## Quick start

```bash
git clone https://github.com/cobanov/watchdock.git
cd watchdock
docker compose up -d --build
```

Open **http://localhost:9622**, set an ntfy topic, and subscribe to it in the [ntfy app](https://ntfy.sh/) on your phone. That's it.

**Or run the prebuilt image** (no clone) — for the local host:

```bash
docker run -d --name watchdock -p 9622:9622 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v watchdock-data:/data \
  cobanov/watchdock
```

Multi-arch images are on [Docker Hub](https://hub.docker.com/r/cobanov/watchdock) (`cobanov/watchdock`) and GHCR (`ghcr.io/cobanov/watchdock`). To also watch remote hosts over SSH, use the Compose setup above so your `~/.ssh` keys are mounted.

## Features

- **Phone alerts** on real state changes — unhealthy, crash, recovery, stop, start — rate-limited so you're never spammed.
- **One dashboard for every host** — group by host, status, health or image, with live colour-coded states, an event log, and light/dark themes.
- **Remote hosts over SSH** — add a machine from the UI; nothing to install on the other side.
- **Tiny and config-free** — a single ~11 MB static Go binary with the UI embedded; everything's set in the UI and saved to a Docker volume.

Runs anywhere Docker does: macOS, Windows (WSL2), Linux.

<details>
<summary><b>Configuration, remote hosts &amp; development</b></summary>

### Remote hosts

Add a machine with the **+** next to *Hosts* in the sidebar (or the **Manage hosts** page): its address, SSH user, and optionally a port, alias, key path or password.

- **Auth:** SSH keys / ssh-agent (recommended) or a password (stored in plain text in the config). Keys are read from `~/.ssh`, mounted read-only into the container. The remote user must be able to reach `/var/run/docker.sock` (i.e. in the `docker` group).
- **Manage:** the toggle next to a host pauses/resumes monitoring. The Hosts page imports/exports hosts as JSON (passwords are never exported), and watchdock also picks up hosts from your mounted `~/.ssh/config`.

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

### Development

```bash
# build the UI once (go:embed needs web/dist to exist)
cd web && npm install && npm run build && cd ..

# backend
CONFIG_PATH=./config.json go run .

# UI with hot reload (proxies /api to :9622)
cd web && npm run dev
```

### Static demo build

`cd web && npm run build:demo` emits a backend-free build to `web/dist` (in-memory sample data) that deploys to any static host such as Cloudflare Pages, Netlify or GitHub Pages.

</details>

## License

MIT
