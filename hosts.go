package main

import (
	"context"
	"fmt"
	"reflect"
	"sync"
	"time"
)

const localHostAlias = "local"

type hostRuntime struct {
	cfg       HostConfig
	client    *DockerClient
	transport *sshTransport // nil for the local daemon
	monitor   *Monitor
	cancel    context.CancelFunc
}

// HostManager runs one DockerClient+Monitor pair per host (the local daemon
// plus every SSH host in the config) and reconciles the set on config saves.
type HostManager struct {
	ctx      context.Context
	store    *ConfigStore
	notify   *Notifier
	hostKeys *tofuKeyStore
	socket   string // local docker socket path

	mu    sync.Mutex
	hosts map[string]*hostRuntime

	histMu  sync.Mutex
	history []HistoryPoint
}

func NewHostManager(ctx context.Context, socket string, store *ConfigStore, notify *Notifier, hostKeys *tofuKeyStore) *HostManager {
	return &HostManager{
		ctx:      ctx,
		store:    store,
		notify:   notify,
		hostKeys: hostKeys,
		socket:   socket,
		hosts:    map[string]*hostRuntime{},
	}
}

func (hm *HostManager) Start() {
	hm.mu.Lock()
	hm.startLocked(HostConfig{Alias: localHostAlias}, NewDockerClient(hm.socket), nil)
	hm.mu.Unlock()
	hm.Reload()
	go hm.historyLoop()
}

// startLocked registers a runtime and launches its monitor. Caller holds mu.
func (hm *HostManager) startLocked(cfg HostConfig, client *DockerClient, transport *sshTransport) {
	ctx, cancel := context.WithCancel(hm.ctx)
	monitor := NewMonitor(cfg.Alias, client, hm.store, hm.notify)
	rt := &hostRuntime{cfg: cfg, client: client, transport: transport, monitor: monitor, cancel: cancel}
	hm.hosts[cfg.Alias] = rt
	go monitor.Run(ctx)
}

func (hm *HostManager) stopLocked(alias string) {
	rt, ok := hm.hosts[alias]
	if !ok {
		return
	}
	rt.cancel()
	if rt.transport != nil {
		rt.transport.Close()
	}
	delete(hm.hosts, alias)
}

// Reload diffs the configured SSH hosts against the running set, starting,
// stopping or restarting runtimes as needed.
func (hm *HostManager) Reload() {
	want := map[string]HostConfig{}
	for _, h := range hm.store.Get().Hosts {
		if h.Disabled {
			continue
		}
		want[h.Alias] = h
	}

	hm.mu.Lock()
	defer hm.mu.Unlock()

	for alias, rt := range hm.hosts {
		if alias == localHostAlias {
			continue
		}
		cfg, keep := want[alias]
		if keep && reflect.DeepEqual(cfg, rt.cfg) {
			delete(want, alias)
			continue
		}
		hm.stopLocked(alias)
	}
	for _, cfg := range want {
		transport := newSSHTransport(cfg, hm.hostKeys)
		hm.startLocked(cfg, NewDockerClientDialer(transport.DialContext), transport)
	}
}

type hostStatus struct {
	Alias    string `json:"alias"`
	OK       bool   `json:"ok"`
	Error    string `json:"error,omitempty"`
	Disabled bool   `json:"disabled,omitempty"`
}

type hostedContainer struct {
	apiContainer
	Host string `json:"host"`
}

// Snapshot lists containers on every host in parallel. Host order: local
// first, then config order.
func (hm *HostManager) Snapshot(ctx context.Context, cfg Config) ([]hostStatus, []hostedContainer) {
	type snapHost struct {
		alias    string
		client   *DockerClient // nil for disabled hosts
		disabled bool
	}
	hm.mu.Lock()
	snap := []snapHost{{alias: localHostAlias, client: hm.hosts[localHostAlias].client}}
	for _, h := range cfg.Hosts {
		if h.Disabled {
			snap = append(snap, snapHost{alias: h.Alias, disabled: true})
			continue
		}
		if rt, ok := hm.hosts[h.Alias]; ok {
			snap = append(snap, snapHost{alias: h.Alias, client: rt.client})
		}
	}
	hm.mu.Unlock()

	type result struct {
		status     hostStatus
		containers []hostedContainer
	}
	results := make(map[string]result, len(snap))
	var wg sync.WaitGroup
	var resMu sync.Mutex

	for _, sh := range snap {
		if sh.disabled {
			results[sh.alias] = result{status: hostStatus{Alias: sh.alias, OK: true, Disabled: true}}
			continue
		}
		wg.Add(1)
		go func(alias string, client *DockerClient) {
			defer wg.Done()
			listCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
			defer cancel()
			list, err := client.ListContainers(listCtx)
			res := result{status: hostStatus{Alias: alias, OK: err == nil}}
			if err != nil {
				res.status.Error = err.Error()
			}
			for _, c := range list {
				res.containers = append(res.containers, hostedContainer{
					apiContainer: toAPIContainer(c, cfg),
					Host:         alias,
				})
			}
			resMu.Lock()
			results[alias] = res
			resMu.Unlock()
		}(sh.alias, sh.client)
	}
	wg.Wait()

	statuses := make([]hostStatus, 0, len(snap))
	containers := []hostedContainer{}
	for _, sh := range snap {
		res := results[sh.alias]
		statuses = append(statuses, res.status)
		containers = append(containers, res.containers...)
	}
	return statuses, containers
}

// HistoryPoint is one sample of aggregate container counts across all hosts.
type HistoryPoint struct {
	T         int64 `json:"t"` // unix seconds
	Running   int   `json:"running"`
	Unhealthy int   `json:"unhealthy"`
	Stopped   int   `json:"stopped"`
	Total     int   `json:"total"`
}

const (
	historyInterval = time.Minute
	historyCap      = 24 * 60 // 24 hours of one-minute samples
)

// historyLoop samples aggregate counts from the monitors' in-memory state —
// no extra Docker calls — once a minute into a ring buffer.
func (hm *HostManager) historyLoop() {
	// Give the initial reconciles a moment to populate state.
	select {
	case <-time.After(10 * time.Second):
	case <-hm.ctx.Done():
		return
	}
	hm.sampleHistory()
	t := time.NewTicker(historyInterval)
	defer t.Stop()
	for {
		select {
		case <-t.C:
			hm.sampleHistory()
		case <-hm.ctx.Done():
			return
		}
	}
}

func (hm *HostManager) sampleHistory() {
	var running, unhealthy, total int
	hm.mu.Lock()
	for _, rt := range hm.hosts {
		r, u, t := rt.monitor.Counts()
		running += r
		unhealthy += u
		total += t
	}
	hm.mu.Unlock()

	p := HistoryPoint{
		T:         time.Now().Unix(),
		Running:   running,
		Unhealthy: unhealthy,
		Stopped:   total - running,
		Total:     total,
	}
	hm.histMu.Lock()
	hm.history = append(hm.history, p)
	if len(hm.history) > historyCap {
		hm.history = hm.history[len(hm.history)-historyCap:]
	}
	hm.histMu.Unlock()
}

func (hm *HostManager) History() []HistoryPoint {
	hm.histMu.Lock()
	defer hm.histMu.Unlock()
	return append([]HistoryPoint{}, hm.history...)
}

// TestHost opens a one-off SSH connection and pings the remote Docker daemon.
func (hm *HostManager) TestHost(ctx context.Context, cfg HostConfig) (int, error) {
	transport := newSSHTransport(cfg, hm.hostKeys)
	defer transport.Close()
	client := NewDockerClientDialer(transport.DialContext)
	testCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	if err := client.Ping(testCtx); err != nil {
		return 0, err
	}
	list, err := client.ListContainers(testCtx)
	if err != nil {
		return 0, fmt.Errorf("connected, but listing containers failed: %w", err)
	}
	return len(list), nil
}
