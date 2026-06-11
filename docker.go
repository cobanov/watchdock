package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

// apiVersion is pinned low for broad compatibility; the daemon accepts any
// version it is newer than.
const apiVersion = "v1.41"

// DockerClient talks to the Docker Engine API over the unix socket using
// nothing but the standard library.
type DockerClient struct {
	http *http.Client
	base string
}

func NewDockerClient(socketPath string) *DockerClient {
	return NewDockerClientDialer(func(ctx context.Context, _, _ string) (net.Conn, error) {
		var d net.Dialer
		return d.DialContext(ctx, "unix", socketPath)
	})
}

// NewDockerClientDialer builds a client over any stream transport, e.g. an
// SSH-forwarded unix socket on a remote machine.
func NewDockerClientDialer(dial func(ctx context.Context, network, addr string) (net.Conn, error)) *DockerClient {
	return &DockerClient{
		http: &http.Client{Transport: &http.Transport{DialContext: dial}},
		base: "http://docker/" + apiVersion,
	}
}

func (c *DockerClient) get(ctx context.Context, path string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+path, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		resp.Body.Close()
		return nil, fmt.Errorf("docker API %s: %s: %s", path, resp.Status, strings.TrimSpace(string(body)))
	}
	return resp, nil
}

func (c *DockerClient) Ping(ctx context.Context) error {
	resp, err := c.get(ctx, "/_ping")
	if err != nil {
		return err
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	return nil
}

type Container struct {
	ID      string   `json:"Id"`
	Names   []string `json:"Names"`
	Image   string   `json:"Image"`
	State   string   `json:"State"`  // running, exited, paused, ...
	Status  string   `json:"Status"` // e.g. "Up 2 hours (healthy)", "Exited (1) 5 minutes ago"
	Created int64    `json:"Created"`
}

func (ct Container) Name() string {
	if len(ct.Names) > 0 {
		return strings.TrimPrefix(ct.Names[0], "/")
	}
	if len(ct.ID) >= 12 {
		return ct.ID[:12]
	}
	return ct.ID
}

func (c *DockerClient) ListContainers(ctx context.Context) ([]Container, error) {
	resp, err := c.get(ctx, "/containers/json?all=1")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out []Container
	return out, json.NewDecoder(resp.Body).Decode(&out)
}

type DockerEvent struct {
	Type   string `json:"Type"`
	Action string `json:"Action"`
	Actor  struct {
		ID         string            `json:"ID"`
		Attributes map[string]string `json:"Attributes"`
	} `json:"Actor"`
}

// Events streams container events to handle until the stream breaks or ctx is
// cancelled. It always returns a non-nil error.
func (c *DockerClient) Events(ctx context.Context, handle func(DockerEvent)) error {
	filters := url.QueryEscape(`{"type":["container"]}`)
	resp, err := c.get(ctx, "/events?filters="+filters)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	dec := json.NewDecoder(resp.Body)
	for {
		var ev DockerEvent
		if err := dec.Decode(&ev); err != nil {
			return fmt.Errorf("event stream: %w", err)
		}
		handle(ev)
	}
}

// healthFromStatus extracts the health state Docker embeds in the
// human-readable Status field ("Up 2 hours (unhealthy)").
func healthFromStatus(status string) string {
	switch {
	case strings.Contains(status, "(healthy)"):
		return "healthy"
	case strings.Contains(status, "(unhealthy)"):
		return "unhealthy"
	case strings.Contains(status, "(health: starting)"):
		return "starting"
	}
	return ""
}

var exitedRe = regexp.MustCompile(`^Exited \((\d+)\)`)

func exitCodeFromStatus(status string) int {
	m := exitedRe.FindStringSubmatch(status)
	if m == nil {
		return 0
	}
	code, _ := strconv.Atoi(m[1])
	return code
}
