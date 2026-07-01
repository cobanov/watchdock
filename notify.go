package main

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ErrNoTopic is returned when a send is attempted without an ntfy topic set. It
// is a caller/configuration problem (HTTP 400), distinct from an upstream ntfy
// failure (HTTP 502), so handlers can map it to the right status code.
var ErrNoTopic = errors.New("ntfy topic is not configured")

type Notifier struct {
	store *ConfigStore
	http  *http.Client
}

func NewNotifier(store *ConfigStore) *Notifier {
	return &Notifier{store: store, http: &http.Client{Timeout: 15 * time.Second}}
}

// Send publishes a message via ntfy using the saved configuration. Titles must
// stay ASCII (HTTP header); emoji go through Tags, which ntfy renders in front
// of the title.
func (n *Notifier) Send(title, message, priority, tags string) error {
	cfg := n.store.Get()
	return n.send(cfg.NtfyServer, cfg.NtfyTopic, cfg.NtfyToken, title, message, priority, tags)
}

// SendTestTo sends the canned test message to an explicit target, letting the
// UI verify settings before they are saved.
func (n *Notifier) SendTestTo(server, topic, token string) error {
	return n.send(server, topic, token, "Test notification", "watchdock is connected and working", "default", "tada")
}

func (n *Notifier) send(server, topic, token, title, message, priority, tags string) error {
	topic = strings.TrimSpace(topic)
	if topic == "" {
		return ErrNoTopic
	}
	server = strings.TrimRight(strings.TrimSpace(server), "/")
	if server == "" {
		server = "https://ntfy.sh"
	}
	req, err := http.NewRequest(http.MethodPost, server+"/"+url.PathEscape(topic), strings.NewReader(message))
	if err != nil {
		return err
	}
	req.Header.Set("Title", title)
	req.Header.Set("Priority", priority)
	req.Header.Set("Tags", tags)
	if token = strings.TrimSpace(token); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := n.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("ntfy: %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}
	return nil
}
