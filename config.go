package main

import (
	"encoding/json"
	"fmt"
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
	Ignore          []string     `json:"ignore"`
	Hosts           []HostConfig `json:"hosts"`
}

// HostConfig describes a remote Docker daemon reached over SSH.
type HostConfig struct {
	Alias   string `json:"alias"`
	Host    string `json:"host"`
	User    string `json:"user"`
	Port    int    `json:"port,omitempty"`    // 0 means 22
	KeyPath string `json:"keyPath,omitempty"` // empty: default keys in /ssh
}

func defaultConfig() Config {
	return Config{
		NtfyServer:      "https://ntfy.sh",
		NotifyUnhealthy: true,
		NotifyDown:      true,
		NotifyRecovered: true,
		Ignore:          []string{},
		Hosts:           []HostConfig{},
	}
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
