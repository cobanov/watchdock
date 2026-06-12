package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDiscoverSSHConfigHosts(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	err := os.WriteFile(path, []byte(`
Host edge-router router backup-router
  HostName 192.0.2.10
  User admin
  Port 22
  IdentityFile ~/.ssh/example_key

Host app-server
  HostName 198.51.100.20
  User deploy

Host *
  User ignored

Host bad*
  HostName 203.0.113.30
  User deploy
`), 0o600)
	if err != nil {
		t.Fatal(err)
	}

	got, err := discoverSSHConfigHosts(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 hosts, got %#v", got)
	}
	if got[0].Alias != "edge-router" || got[0].Host != "192.0.2.10" || got[0].User != "admin" {
		t.Fatalf("unexpected first host: %#v", got[0])
	}
	if got[0].KeyPath != filepath.Join(sshKeyDir, "example_key") {
		t.Fatalf("unexpected key path: %q", got[0].KeyPath)
	}
	if got[1].Alias != "app-server" || got[1].Host != "198.51.100.20" || got[1].User != "deploy" {
		t.Fatalf("unexpected second host: %#v", got[1])
	}
}

func TestDiscoverSSHConfigHostsMissingFile(t *testing.T) {
	got, err := discoverSSHConfigHosts(filepath.Join(t.TempDir(), "missing"))
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("expected no hosts, got %#v", got)
	}
}
