package main

import (
	"encoding/json"
	"os"
	"sync"
	"time"
)

// Event is one observed container state transition, kept regardless of
// notification settings so the UI can show a timeline.
type Event struct {
	T         int64  `json:"t"` // unix seconds
	Host      string `json:"host"`
	Container string `json:"container"`
	Kind      string `json:"kind"` // crashed, stopped, started, unhealthy, healthy
	Detail    string `json:"detail,omitempty"`
}

const eventCap = 1000

// EventLog is a ring buffer of container events persisted as JSON. Writes are
// best-effort: losing the log on a crash only costs UI history.
type EventLog struct {
	mu     sync.Mutex
	path   string
	events []Event
}

func NewEventLog(path string) *EventLog {
	l := &EventLog{path: path}
	if data, err := os.ReadFile(path); err == nil {
		json.Unmarshal(data, &l.events)
	}
	return l
}

func (l *EventLog) Add(host, container, kind, detail string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.events = append(l.events, Event{
		T:         time.Now().Unix(),
		Host:      host,
		Container: container,
		Kind:      kind,
		Detail:    detail,
	})
	if len(l.events) > eventCap {
		l.events = l.events[len(l.events)-eventCap:]
	}
	if data, err := json.Marshal(l.events); err == nil {
		tmp := l.path + ".tmp"
		if os.WriteFile(tmp, data, 0o600) == nil {
			os.Rename(tmp, l.path)
		}
	}
}

// Recent returns up to n events, newest first.
func (l *EventLog) Recent(n int) []Event {
	l.mu.Lock()
	defer l.mu.Unlock()
	if n > len(l.events) {
		n = len(l.events)
	}
	out := make([]Event, 0, n)
	for i := len(l.events) - 1; i >= 0 && len(out) < n; i-- {
		out = append(out, l.events[i])
	}
	return out
}
