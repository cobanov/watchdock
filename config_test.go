package main

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

// A fresh install gets its own topic, saved so it survives a restart.
func TestFirstRunTopicIsPrivateAndPersisted(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	first, err := NewConfigStore(path)
	if err != nil {
		t.Fatal(err)
	}
	topic := first.Get().NtfyTopic
	if !regexp.MustCompile(`^watchdock-[0-9a-f]{12}$`).MatchString(topic) {
		t.Fatalf("topic %q is not a generated private topic", topic)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("defaults were not saved: %v", err)
	}
	again, err := NewConfigStore(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := again.Get().NtfyTopic; got != topic {
		t.Fatalf("topic changed across restarts: %q then %q", topic, got)
	}
}
