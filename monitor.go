package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	reconcileInterval = 30 * time.Second
	notifyCooldown    = 5 * time.Minute  // per container+kind, tames crash loops
	recoveryGrace     = 30 * time.Second // container must stay up this long before "recovered"
	manualStopWindow  = 15 * time.Second // a die this soon after a kill event is a manual stop
)

type containerState struct {
	name         string
	image        string
	running      bool
	health       string // "", starting, healthy, unhealthy
	wasDown      bool
	wasUnhealthy bool
	lastKillAt   time.Time
}

// Monitor keeps a state map of all containers and turns observed transitions
// into notifications. Transitions arrive from two sources feeding the same
// handlers: the Docker events stream (primary) and a periodic reconcile poll
// (safety net for missed events while reconnecting).
type Monitor struct {
	host   string // host alias; "local" is the daemon dockwatch runs on
	docker *DockerClient
	store  *ConfigStore
	notify *Notifier

	mu           sync.Mutex
	states       map[string]*containerState
	lastNotified map[string]time.Time
	selfHost     string // container hostname == short container ID when dockerized
}

func NewMonitor(host string, docker *DockerClient, store *ConfigStore, notify *Notifier) *Monitor {
	m := &Monitor{
		host:         host,
		docker:       docker,
		store:        store,
		notify:       notify,
		states:       map[string]*containerState{},
		lastNotified: map[string]time.Time{},
	}
	if host == localHostAlias {
		m.selfHost, _ = os.Hostname()
	}
	return m
}

// subject names a container in notification messages, qualified with the
// host alias for remote daemons.
func (m *Monitor) subject(name string) string {
	if m.host == localHostAlias {
		return name
	}
	return name + " on " + m.host
}

func (m *Monitor) Run(ctx context.Context) {
	m.reconcile(ctx, true)
	go m.reconcileLoop(ctx)
	m.eventLoop(ctx)
}

func (m *Monitor) eventLoop(ctx context.Context) {
	backoff := time.Second
	for ctx.Err() == nil {
		connectedAt := time.Now()
		err := m.docker.Events(ctx, m.handleEvent)
		if ctx.Err() != nil {
			return
		}
		if time.Since(connectedAt) > time.Minute {
			backoff = time.Second
		}
		log.Printf("[%s] docker event stream lost: %v (reconnecting in %s)", m.host, err, backoff)
		select {
		case <-time.After(backoff):
		case <-ctx.Done():
			return
		}
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
}

func (m *Monitor) reconcileLoop(ctx context.Context) {
	t := time.NewTicker(reconcileInterval)
	defer t.Stop()
	for {
		select {
		case <-t.C:
			m.reconcile(ctx, false)
		case <-ctx.Done():
			return
		}
	}
}

func (m *Monitor) handleEvent(ev DockerEvent) {
	if ev.Type != "container" {
		return
	}
	id := ev.Actor.ID
	name := strings.TrimPrefix(ev.Actor.Attributes["name"], "/")
	image := ev.Actor.Attributes["image"]

	switch {
	case ev.Action == "start":
		m.onStart(id, name, image)
	case ev.Action == "kill":
		m.markKill(id)
	case ev.Action == "die":
		code, _ := strconv.Atoi(ev.Actor.Attributes["exitCode"])
		m.onDie(id, name, image, code)
	case ev.Action == "destroy":
		m.forget(id)
	case strings.HasPrefix(ev.Action, "health_status"):
		status := strings.TrimSpace(strings.TrimPrefix(ev.Action, "health_status:"))
		m.onHealth(id, name, image, status)
	}
}

// ensure returns the state entry for id, creating it if needed. Caller holds mu.
func (m *Monitor) ensure(id, name, image string) *containerState {
	st, ok := m.states[id]
	if !ok {
		st = &containerState{}
		m.states[id] = st
	}
	if name != "" {
		st.name = name
	}
	if image != "" {
		st.image = image
	}
	return st
}

func (m *Monitor) markKill(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if st, ok := m.states[id]; ok {
		st.lastKillAt = time.Now()
	}
}

func (m *Monitor) forget(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.states, id)
}

func (m *Monitor) onHealth(id, name, image, status string) {
	m.mu.Lock()
	st := m.ensure(id, name, image)
	prev := st.health
	st.health = status
	notifyUnhealthy := status == "unhealthy" && prev != "unhealthy"
	notifyRecovered := status == "healthy" && st.wasUnhealthy
	if notifyUnhealthy {
		st.wasUnhealthy = true
	}
	if notifyRecovered {
		st.wasUnhealthy = false
	}
	name, image = st.name, st.image
	m.mu.Unlock()

	if notifyUnhealthy {
		m.send(id, name, "unhealthy",
			"Container unhealthy", fmt.Sprintf("%s is unhealthy (image: %s)", m.subject(name), image),
			"urgent", "rotating_light")
	}
	if notifyRecovered {
		m.send(id, name, "recovered",
			"Container recovered", fmt.Sprintf("%s is healthy again", m.subject(name)),
			"default", "white_check_mark")
	}
}

func (m *Monitor) onDie(id, name, image string, exitCode int) {
	m.mu.Lock()
	st := m.ensure(id, name, image)
	st.running = false
	st.health = ""
	manual := time.Since(st.lastKillAt) < manualStopWindow
	crashed := exitCode != 0 && !manual
	if crashed {
		st.wasDown = true
	}
	name, image = st.name, st.image
	m.mu.Unlock()

	if crashed {
		m.send(id, name, "down",
			"Container down", fmt.Sprintf("%s exited with code %d (image: %s)", m.subject(name), exitCode, image),
			"high", "skull")
	}
}

func (m *Monitor) onStart(id, name, image string) {
	m.mu.Lock()
	st := m.ensure(id, name, image)
	st.running = true
	pending := st.wasDown
	m.mu.Unlock()

	if !pending {
		return
	}
	// Only call it recovered if the container is still up after the grace
	// period; a crash loop keeps wasDown set and stays on cooldown instead.
	time.AfterFunc(recoveryGrace, func() {
		m.mu.Lock()
		st, ok := m.states[id]
		recovered := ok && st.running && st.wasDown
		var name string
		if recovered {
			st.wasDown = false
			name = st.name
		}
		m.mu.Unlock()
		if recovered {
			m.send(id, name, "recovered",
				"Container recovered", fmt.Sprintf("%s is back up", m.subject(name)),
				"default", "white_check_mark")
		}
	})
}

// reconcile lists all containers and replays any transitions the event stream
// missed. With seed=true it only takes a baseline snapshot, silently.
func (m *Monitor) reconcile(ctx context.Context, seed bool) {
	listCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	list, err := m.docker.ListContainers(listCtx)
	if err != nil {
		log.Printf("[%s] reconcile: %v", m.host, err)
		return
	}

	seen := map[string]bool{}
	for _, c := range list {
		seen[c.ID] = true
		name := c.Name()
		health := healthFromStatus(c.Status)
		running := c.State == "running"

		m.mu.Lock()
		st, exists := m.states[c.ID]
		if !exists || seed {
			st = m.ensure(c.ID, name, c.Image)
			st.running = running
			st.health = health
			m.mu.Unlock()
			continue
		}
		prevRunning, prevHealth := st.running, st.health
		st.name, st.image = name, c.Image
		m.mu.Unlock()

		// The handlers update running/health themselves and decide whether
		// the transition warrants a notification.
		if prevRunning && !running {
			m.onDie(c.ID, name, c.Image, exitCodeFromStatus(c.Status))
		}
		if running && !prevRunning {
			m.onStart(c.ID, name, c.Image)
		}
		if health != prevHealth && (health == "unhealthy" || health == "healthy") {
			m.onHealth(c.ID, name, c.Image, health)
		}

		// Sync any residual drift the handlers didn't cover (e.g. "" → "starting").
		m.mu.Lock()
		if st, ok := m.states[c.ID]; ok {
			st.running = running
			st.health = health
		}
		m.mu.Unlock()
	}

	m.mu.Lock()
	for id := range m.states {
		if !seen[id] {
			delete(m.states, id)
		}
	}
	m.mu.Unlock()
}

// send applies the config toggles, ignore list, self-exclusion and cooldown,
// then ships the notification without blocking the event loop.
func (m *Monitor) send(id, name, kind, title, message, priority, tags string) {
	if m.selfHost != "" && strings.HasPrefix(id, m.selfHost) {
		return
	}
	cfg := m.store.Get()
	enabled := map[string]bool{
		"unhealthy": cfg.NotifyUnhealthy,
		"down":      cfg.NotifyDown,
		"recovered": cfg.NotifyRecovered,
	}[kind]
	if !enabled || isIgnored(cfg.Ignore, name) {
		return
	}

	key := id + "/" + kind
	m.mu.Lock()
	if last, ok := m.lastNotified[key]; ok && time.Since(last) < notifyCooldown {
		m.mu.Unlock()
		return
	}
	m.lastNotified[key] = time.Now()
	m.mu.Unlock()

	log.Printf("[%s] notify [%s] %s: %s", m.host, kind, name, message)
	go func() {
		if err := m.notify.Send(title, message, priority, tags); err != nil {
			log.Printf("[%s] notify [%s] %s failed: %v", m.host, kind, name, err)
		}
	}()
}

func isIgnored(patterns []string, name string) bool {
	for _, p := range patterns {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if p == name {
			return true
		}
		if ok, _ := path.Match(p, name); ok {
			return true
		}
	}
	return false
}
