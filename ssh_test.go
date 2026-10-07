package main

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"io"
	"net"
	"net/http"
	"path/filepath"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
)

// Synology refuses unix socket forwarding, so every Docker stream goes through
// dial-stdio. Opening a new stream must not tear down the SSH session, or the
// long-lived event stream on it dies with "unexpected EOF" each reconcile.
func TestSSHTransportKeepsStreamsWhenSocketForwardingIsRefused(t *testing.T) {
	streams := make(chan struct{}, 4)
	srv := startTestSSHServer(t, synologyLike(t, fakeDockerAPI(streams)))
	client := NewDockerClientDialer(newTestTransport(t, srv.addr).DialContext)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ended := make(chan error, 1)
	go func() { ended <- client.Events(ctx, func(DockerEvent) {}) }()
	select {
	case <-streams:
	case err := <-ended:
		t.Fatalf("event stream failed to open: %v", err)
	case <-time.After(5 * time.Second):
		t.Fatal("event stream never opened")
	}

	// Concurrent requests need fresh connections next to the busy event
	// stream, as the reconcile poll and the dashboard do.
	var wg sync.WaitGroup
	for range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := client.ListContainers(ctx); err != nil {
				t.Errorf("list containers: %v", err)
			}
		}()
	}
	wg.Wait()

	select {
	case err := <-ended:
		t.Fatalf("event stream cut by a later dial: %v", err)
	case <-time.After(200 * time.Millisecond):
	}
	if n := srv.conns.Load(); n != 1 {
		t.Errorf("opened %d SSH connections, want 1", n)
	}
}

// A peer that vanished without the TCP connection noticing never answers a
// channel open. The dial must give up instead of holding the transport lock
// until the kernel times the connection out.
func TestSSHTransportGivesUpOnSilentServer(t *testing.T) {
	defer func(d time.Duration) { channelOpenTimeout = d }(channelOpenTimeout)
	channelOpenTimeout = 100 * time.Millisecond

	srv := startTestSSHServer(t, func(ssh.NewChannel) {})
	transport := newTestTransport(t, srv.addr)

	done := make(chan error, 1)
	go func() {
		conn, err := transport.DialContext(context.Background(), "", "")
		if conn != nil {
			conn.Close()
		}
		done <- err
	}()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("dial succeeded against a server that never answers")
		}
	case <-time.After(5 * time.Second):
		srv.stop() // unblock the dial so cleanup can take the lock
		t.Fatal("dial still blocked after 5s")
	}
}

type testSSHServer struct {
	addr  string
	conns atomic.Int32 // completed handshakes

	ln  net.Listener
	mu  sync.Mutex
	raw []net.Conn
}

// stop closes the listener and every connection it accepted.
func (s *testSSHServer) stop() {
	s.ln.Close()
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, c := range s.raw {
		c.Close()
	}
}

// startTestSSHServer runs an SSH server on loopback that accepts any client
// and passes every channel it is asked to open to handle.
func startTestSSHServer(t *testing.T, handle func(ssh.NewChannel)) *testSSHServer {
	t.Helper()
	_, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromKey(key)
	if err != nil {
		t.Fatal(err)
	}
	conf := &ssh.ServerConfig{NoClientAuth: true}
	conf.AddHostKey(signer)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	s := &testSSHServer{addr: ln.Addr().String(), ln: ln}
	t.Cleanup(s.stop)
	go func() {
		for {
			raw, err := ln.Accept()
			if err != nil {
				return
			}
			s.mu.Lock()
			s.raw = append(s.raw, raw)
			s.mu.Unlock()
			go func() {
				_, chans, reqs, err := ssh.NewServerConn(raw, conf)
				if err != nil {
					raw.Close()
					return
				}
				s.conns.Add(1)
				go ssh.DiscardRequests(reqs)
				for nc := range chans {
					handle(nc)
				}
			}()
		}
	}()
	return s
}

// synologyLike refuses unix socket forwarding the way DSM does and serves api
// on exec sessions, standing in for `docker system dial-stdio`.
func synologyLike(t *testing.T, api http.Handler) func(ssh.NewChannel) {
	ln := &chanListener{conns: make(chan net.Conn), done: make(chan struct{})}
	go (&http.Server{Handler: api}).Serve(ln)
	t.Cleanup(func() { ln.Close() })

	return func(nc ssh.NewChannel) {
		if nc.ChannelType() != "session" {
			nc.Reject(ssh.ConnectionFailed, "open failed")
			return
		}
		ch, reqs, err := nc.Accept()
		if err != nil {
			return
		}
		go func() {
			for req := range reqs {
				req.Reply(req.Type == "exec", nil)
				if req.Type != "exec" {
					continue
				}
				select {
				case ln.conns <- channelConn{ch}:
				case <-ln.done:
					ch.Close()
				}
			}
		}()
	}
}

// fakeDockerAPI answers the calls watchdock makes. Each /events request is
// announced on streams and held open until the client goes away.
func fakeDockerAPI(streams chan<- struct{}) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /_ping", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Api-Version", "1.43")
		io.WriteString(w, "OK")
	})
	mux.HandleFunc("GET /v1.43/containers/json", func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, "[]")
	})
	mux.HandleFunc("GET /v1.43/events", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.(http.Flusher).Flush()
		streams <- struct{}{}
		<-r.Context().Done()
	})
	return mux
}

func newTestTransport(t *testing.T, addr string) *sshTransport {
	t.Helper()
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		t.Fatal(err)
	}
	p, _ := strconv.Atoi(port)
	// The server takes "none" auth; the password only satisfies authMethods
	// when there are no keys to load.
	cfg := HostConfig{Alias: "test", Host: host, Port: p, User: "test", Password: "unused"}
	transport := newSSHTransport(cfg, newTOFUKeyStore(filepath.Join(t.TempDir(), "known_hosts")))
	t.Cleanup(transport.Close)
	return transport
}

// chanListener hands connections pushed on conns to an http.Server.
type chanListener struct {
	conns chan net.Conn
	done  chan struct{}
	once  sync.Once
}

func (l *chanListener) Accept() (net.Conn, error) {
	select {
	case c := <-l.conns:
		return c, nil
	case <-l.done:
		return nil, net.ErrClosed
	}
}

func (l *chanListener) Close() error {
	l.once.Do(func() { close(l.done) })
	return nil
}

func (l *chanListener) Addr() net.Addr { return commandAddr("test") }

// channelConn lets an SSH channel stand in for a net.Conn.
type channelConn struct{ ssh.Channel }

func (channelConn) LocalAddr() net.Addr              { return commandAddr("test-local") }
func (channelConn) RemoteAddr() net.Addr             { return commandAddr("test-remote") }
func (channelConn) SetDeadline(time.Time) error      { return nil }
func (channelConn) SetReadDeadline(time.Time) error  { return nil }
func (channelConn) SetWriteDeadline(time.Time) error { return nil }
