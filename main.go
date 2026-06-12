package main

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"regexp"
	"sort"
	"strings"
	"syscall"
	"time"
)

//go:embed all:web/dist
var webFS embed.FS

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	port := envOr("PORT", "9622")
	socket := envOr("DOCKER_SOCKET", "/var/run/docker.sock")
	configPath := envOr("CONFIG_PATH", "/data/config.json")

	store, err := NewConfigStore(configPath)
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	if added, err := ImportSSHConfigHosts(store); err != nil {
		log.Printf("ssh config import skipped: %v", err)
	} else if added > 0 {
		log.Printf("imported %d SSH host(s) from %s", added, sshConfigPath)
	}

	docker := NewDockerClient(socket)
	pingCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	if err := docker.Ping(pingCtx); err != nil {
		log.Printf("warning: docker daemon unreachable at %s: %v (will keep retrying)", socket, err)
	} else {
		log.Printf("connected to docker daemon at %s", socket)
	}
	cancel()

	notifier := NewNotifier(store)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	hostKeys := newTOFUKeyStore(envOr("KNOWN_HOSTS_PATH", "/data/known_hosts"))
	hosts := NewHostManager(ctx, socket, store, notifier, hostKeys)
	hosts.Start()

	mux := http.NewServeMux()
	web, _ := fs.Sub(webFS, "web/dist")
	mux.Handle("GET /", http.FileServerFS(web))
	mux.HandleFunc("GET /api/containers", handleContainers(hosts, store))
	mux.HandleFunc("GET /api/config", handleGetConfig(store))
	mux.HandleFunc("PUT /api/config", handlePutConfig(store, hosts))
	mux.HandleFunc("POST /api/hosts/test", handleTestHost(hosts))
	mux.HandleFunc("POST /api/hosts/import-ssh-config", handleImportSSHConfig(store, hosts))
	mux.HandleFunc("GET /api/history", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, hosts.History())
	})
	mux.HandleFunc("POST /api/test", handleTest(notifier))

	srv := &http.Server{Addr: ":" + port, Handler: mux}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		srv.Shutdown(shutdownCtx)
	}()

	log.Printf("dockwatch listening on http://localhost:%s", port)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

type apiContainer struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Image   string `json:"image"`
	State   string `json:"state"`
	Health  string `json:"health"`
	Status  string `json:"status"`
	Ignored bool   `json:"ignored"`
}

func toAPIContainer(c Container, cfg Config) apiContainer {
	id := c.ID
	if len(id) > 12 {
		id = id[:12]
	}
	return apiContainer{
		ID:      id,
		Name:    c.Name(),
		Image:   c.Image,
		State:   c.State,
		Health:  healthFromStatus(c.Status),
		Status:  c.Status,
		Ignored: isIgnored(cfg.Ignore, c.Name()),
	}
}

func handleContainers(hosts *HostManager, store *ConfigStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cfg := store.Get()
		statuses, containers := hosts.Snapshot(r.Context(), cfg)
		sort.SliceStable(containers, func(i, j int) bool {
			ri, rj := containers[i].State == "running", containers[j].State == "running"
			if ri != rj {
				return ri
			}
			return containers[i].Name < containers[j].Name
		})
		writeJSON(w, http.StatusOK, map[string]any{
			"hosts":      statuses,
			"containers": containers,
		})
	}
}

func handleGetConfig(store *ConfigStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, store.Get())
	}
}

var (
	topicRe = regexp.MustCompile(`^[-_A-Za-z0-9]{1,64}$`)
	aliasRe = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,31}$`)
)

func validateHosts(hosts []HostConfig) ([]HostConfig, error) {
	seen := map[string]bool{}
	out := make([]HostConfig, 0, len(hosts))
	for _, h := range hosts {
		h.Alias = strings.TrimSpace(h.Alias)
		h.Host = strings.TrimSpace(h.Host)
		h.User = strings.TrimSpace(h.User)
		h.KeyPath = strings.TrimSpace(h.KeyPath)
		if h.Alias == localHostAlias {
			return nil, errors.New(`alias "local" is reserved`)
		}
		if !aliasRe.MatchString(h.Alias) {
			return nil, fmt.Errorf("invalid alias %q: use lowercase letters, digits, - and _", h.Alias)
		}
		if seen[h.Alias] {
			return nil, fmt.Errorf("duplicate alias %q", h.Alias)
		}
		seen[h.Alias] = true
		if h.Host == "" || strings.ContainsAny(h.Host, " /") {
			return nil, fmt.Errorf("invalid host address for %q", h.Alias)
		}
		if h.User == "" {
			return nil, fmt.Errorf("user is required for %q", h.Alias)
		}
		if h.Port < 0 || h.Port > 65535 {
			return nil, fmt.Errorf("invalid port for %q", h.Alias)
		}
		out = append(out, h)
	}
	return out, nil
}

func handlePutConfig(store *ConfigStore, hosts *HostManager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var cfg Config
		if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
			return
		}
		if cfg.NtfyServer != "" {
			u, err := url.Parse(cfg.NtfyServer)
			if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
				writeError(w, http.StatusBadRequest, "ntfy server must be an http(s) URL")
				return
			}
		} else {
			cfg.NtfyServer = "https://ntfy.sh"
		}
		if cfg.NtfyTopic != "" && !topicRe.MatchString(cfg.NtfyTopic) {
			writeError(w, http.StatusBadRequest, "topic may only contain letters, digits, - and _ (max 64 chars)")
			return
		}
		if cfg.Ignore == nil {
			cfg.Ignore = []string{}
		}
		validHosts, err := validateHosts(cfg.Hosts)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		cfg.Hosts = validHosts
		if err := store.Set(cfg); err != nil {
			writeError(w, http.StatusInternalServerError, "save failed: "+err.Error())
			return
		}
		hosts.Reload()
		writeJSON(w, http.StatusOK, store.Get())
	}
}

func handleTestHost(hosts *HostManager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var hc HostConfig
		if err := json.NewDecoder(r.Body).Decode(&hc); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
			return
		}
		if _, err := validateHosts([]HostConfig{hc}); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		n, err := hosts.TestHost(r.Context(), hc)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "containers": n})
	}
}

func handleImportSSHConfig(store *ConfigStore, hosts *HostManager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		added, err := ImportSSHConfigHosts(store)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		if added > 0 {
			hosts.Reload()
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"added": added,
			"hosts": store.Get().Hosts,
		})
	}
}

func handleTest(notifier *Notifier) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		err := notifier.Send("Test notification", "dockwatch is connected and working", "default", "tada")
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "sent"})
	}
}
