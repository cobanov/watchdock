package main

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"regexp"
	"sort"
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

	docker := NewDockerClient(socket)
	pingCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	if err := docker.Ping(pingCtx); err != nil {
		log.Printf("warning: docker daemon unreachable at %s: %v (will keep retrying)", socket, err)
	} else {
		log.Printf("connected to docker daemon at %s", socket)
	}
	cancel()

	notifier := NewNotifier(store)
	monitor := NewMonitor(docker, store, notifier)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go monitor.Run(ctx)

	mux := http.NewServeMux()
	web, _ := fs.Sub(webFS, "web/dist")
	mux.Handle("GET /", http.FileServerFS(web))
	mux.HandleFunc("GET /api/containers", handleContainers(docker, store))
	mux.HandleFunc("GET /api/config", handleGetConfig(store))
	mux.HandleFunc("PUT /api/config", handlePutConfig(store))
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

func handleContainers(docker *DockerClient, store *ConfigStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		list, err := docker.ListContainers(ctx)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		cfg := store.Get()
		out := make([]apiContainer, 0, len(list))
		for _, c := range list {
			id := c.ID
			if len(id) > 12 {
				id = id[:12]
			}
			out = append(out, apiContainer{
				ID:      id,
				Name:    c.Name(),
				Image:   c.Image,
				State:   c.State,
				Health:  healthFromStatus(c.Status),
				Status:  c.Status,
				Ignored: isIgnored(cfg.Ignore, c.Name()),
			})
		}
		sort.Slice(out, func(i, j int) bool {
			ri, rj := out[i].State == "running", out[j].State == "running"
			if ri != rj {
				return ri
			}
			return out[i].Name < out[j].Name
		})
		writeJSON(w, http.StatusOK, out)
	}
}

func handleGetConfig(store *ConfigStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, store.Get())
	}
}

var topicRe = regexp.MustCompile(`^[-_A-Za-z0-9]{1,64}$`)

func handlePutConfig(store *ConfigStore) http.HandlerFunc {
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
		if err := store.Set(cfg); err != nil {
			writeError(w, http.StatusInternalServerError, "save failed: "+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, store.Get())
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
