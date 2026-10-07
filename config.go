package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
)

type Config struct {
	NtfyServer      string       `json:"ntfyServer"`
	NtfyTopic       string       `json:"ntfyTopic"`
	NtfyToken       string       `json:"ntfyToken"`
	NotifyUnhealthy bool         `json:"notifyUnhealthy"`
	NotifyDown      bool         `json:"notifyDown"`
	NotifyRecovered bool         `json:"notifyRecovered"`
	NotifyStopped   bool         `json:"notifyStopped"`
	NotifyStarted   bool         `json:"notifyStarted"`
	Ignore          []string     `json:"ignore"`
	Hosts           []HostConfig `json:"hosts"`
}

// HostConfig describes a remote Docker daemon reached over SSH.
type HostConfig struct {
	Alias    string `json:"alias"`
	Host     string `json:"host"`
	User     string `json:"user"`
	Port     int    `json:"port,omitempty"`     // 0 means 22
	KeyPath  string `json:"keyPath,omitempty"`  // empty: default keys in /ssh
	Password string `json:"password,omitempty"` // optional; stored in plain text, prefer keys
	Disabled bool   `json:"disabled,omitempty"`
	// NtfyTopic sends this host's alerts to their own topic instead of the
	// global one, so one watchdock can route work machines to a team topic
	// and the rest to a personal one. Empty uses the global topic.
	NtfyTopic string `json:"ntfyTopic,omitempty"`
}

func defaultConfig() Config {
	return Config{
		NtfyServer:      "https://ntfy.sh",
		NtfyTopic:       randomTopic(),
		NotifyUnhealthy: true,
		NotifyDown:      true,
		NotifyRecovered: true,
		NotifyStopped:   true,
		NotifyStarted:   true,
		Ignore:          []string{},
		Hosts:           []HostConfig{},
	}
}

// randomTopic names a fresh install's ntfy topic. On a public server anyone
// who knows a topic can read it, so a shared default like "watchdock" would put
// every new install's container names in one public feed.
func randomTopic() string {
	b := make([]byte, 6)
	rand.Read(b) // never fails since Go 1.24
	return "watchdock-" + hex.EncodeToString(b)
}

// ConfigStore is a thread-safe view of the config, persisted as JSON on disk.
type ConfigStore struct {
	mu   sync.RWMutex
	path string
	cfg  Config
}

func NewConfigStore(path string) (*ConfigStore, error) {
	s := &ConfigStore{path: path, cfg: defaultConfig()}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		// Save the first-run defaults so the generated topic survives a restart;
		// a phone subscribed to it would otherwise go silent.
		if err := s.Set(s.cfg); err != nil {
			log.Printf("config: could not save defaults to %s: %v", path, err)
		}
		return s, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(data, &s.cfg); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	if s.cfg.Ignore == nil {
		s.cfg.Ignore = []string{}
	}
	if s.cfg.Hosts == nil {
		s.cfg.Hosts = []HostConfig{}
	}
	return s, nil
}

func (s *ConfigStore) Get() Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	cfg := s.cfg
	cfg.Ignore = append([]string{}, s.cfg.Ignore...)
	cfg.Hosts = append([]HostConfig{}, s.cfg.Hosts...)
	return cfg
}

func (s *ConfigStore) Set(cfg Config) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, s.path); err != nil {
		return err
	}
	s.cfg = cfg
	return nil
}
