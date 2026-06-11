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
}

// startLocked registers a runtime and launches its monitor. Caller holds mu.
func (hm *HostManager) startLocked(cfg HostConfig, client *DockerClient, transport *sshTransport) {
	ctx, cancel := context.WithCancel(hm.ctx)
	rt := &hostRuntime{cfg: cfg, client: client, transport: transport, cancel: cancel}
	hm.hosts[cfg.Alias] = rt
	monitor := NewMonitor(cfg.Alias, client, hm.store, hm.notify)
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
	Alias string `json:"alias"`
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

type hostedContainer struct {
	apiContainer
	Host string `json:"host"`
}

// Snapshot lists containers on every host in parallel. Host order: local
// first, then config order.
func (hm *HostManager) Snapshot(ctx context.Context, cfg Config) ([]hostStatus, []hostedContainer) {
	hm.mu.Lock()
	order := []string{localHostAlias}
	clients := map[string]*DockerClient{localHostAlias: hm.hosts[localHostAlias].client}
	for _, h := range cfg.Hosts {
		if rt, ok := hm.hosts[h.Alias]; ok {
			order = append(order, h.Alias)
			clients[h.Alias] = rt.client
		}
	}
	hm.mu.Unlock()

	type result struct {
		status     hostStatus
		containers []hostedContainer
	}
	results := make(map[string]result, len(order))
	var wg sync.WaitGroup
	var resMu sync.Mutex

	for _, alias := range order {
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
		}(alias, clients[alias])
	}
	wg.Wait()

	statuses := make([]hostStatus, 0, len(order))
	containers := []hostedContainer{}
	for _, alias := range order {
		res := results[alias]
		statuses = append(statuses, res.status)
		containers = append(containers, res.containers...)
	}
	return statuses, containers
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
