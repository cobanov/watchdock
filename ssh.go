package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
	"golang.org/x/crypto/ssh/knownhosts"
)

const remoteDockerSocket = "/var/run/docker.sock"

// Some hardened SSH servers (notably Synology DSM) disable direct Unix socket
// forwarding even when the user can access Docker. Docker's dial-stdio command
// carries the same API stream over a regular SSH exec channel, which remains
// available on those hosts. The explicit fallback paths cover non-login shells
// whose PATH omits the Docker CLI location.
const remoteDockerDialCommand = `if command -v docker >/dev/null 2>&1; then exec docker system dial-stdio; elif [ -x /usr/local/bin/docker ]; then exec /usr/local/bin/docker system dial-stdio; elif [ -x /var/packages/ContainerManager/target/usr/bin/docker ]; then exec /var/packages/ContainerManager/target/usr/bin/docker system dial-stdio; else echo "docker CLI not found" >&2; exit 127; fi`

// sshKeyDir is where the user's ~/.ssh is mounted inside the container.
var sshKeyDir = envOr("SSH_KEY_DIR", "/ssh")

var defaultKeyNames = []string{"id_ed25519", "id_rsa", "id_ecdsa"}

// sshTransport keeps one SSH connection per remote host and opens Docker API
// streams over it by forwarding the remote unix socket.
type sshTransport struct {
	cfg      HostConfig
	hostKeys *tofuKeyStore
	mu       sync.Mutex
	client   *ssh.Client
}

func newSSHTransport(cfg HostConfig, hostKeys *tofuKeyStore) *sshTransport {
	return &sshTransport{cfg: cfg, hostKeys: hostKeys}
}

func (t *sshTransport) authMethods() ([]ssh.AuthMethod, error) {
	var methods []ssh.AuthMethod

	if sock := os.Getenv("SSH_AUTH_SOCK"); sock != "" {
		if conn, err := net.Dial("unix", sock); err == nil {
			methods = append(methods, ssh.PublicKeysCallback(agent.NewClient(conn).Signers))
		}
	}

	paths := []string{}
	if t.cfg.KeyPath != "" {
		paths = append(paths, t.cfg.KeyPath)
	} else {
		for _, name := range defaultKeyNames {
			paths = append(paths, filepath.Join(sshKeyDir, name))
		}
	}
	var keyErr error
	for _, p := range paths {
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		signer, err := ssh.ParsePrivateKey(data)
		if err != nil {
			var passErr *ssh.PassphraseMissingError
			if errors.As(err, &passErr) {
				keyErr = fmt.Errorf("%s is passphrase-protected; use ssh-agent forwarding instead", p)
			}
			continue
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}

	if pw := t.cfg.Password; pw != "" {
		methods = append(methods,
			ssh.Password(pw),
			// Some servers only offer keyboard-interactive for passwords.
			ssh.KeyboardInteractive(func(_, _ string, questions []string, _ []bool) ([]string, error) {
				answers := make([]string, len(questions))
				for i := range answers {
					answers[i] = pw
				}
				return answers, nil
			}),
		)
	}

	if len(methods) == 0 {
		if keyErr != nil {
			return nil, keyErr
		}
		return nil, fmt.Errorf("no usable SSH key in %s, no ssh-agent available, and no password set", sshKeyDir)
	}
	return methods, nil
}

func (t *sshTransport) connectLocked(ctx context.Context) error {
	methods, err := t.authMethods()
	if err != nil {
		return err
	}
	port := t.cfg.Port
	if port == 0 {
		port = 22
	}
	addr := net.JoinHostPort(t.cfg.Host, fmt.Sprint(port))

	conf := &ssh.ClientConfig{
		User:            t.cfg.User,
		Auth:            methods,
		HostKeyCallback: t.hostKeys.callback(),
		Timeout:         6 * time.Second,
	}

	// Bound the TCP connect so an unreachable host fails fast instead of
	// hanging on SYN retransmits up to the caller's timeout.
	dialCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	var d net.Dialer
	raw, err := d.DialContext(dialCtx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("dial %s: %w", addr, err)
	}
	sshConn, chans, reqs, err := ssh.NewClientConn(raw, addr, conf)
	if err != nil {
		raw.Close()
		return fmt.Errorf("ssh %s@%s: %w", t.cfg.User, addr, err)
	}
	t.client = ssh.NewClient(sshConn, chans, reqs)
	return nil
}

// DialContext opens a stream to the remote Docker socket, reconnecting the
// SSH session once if it has gone stale.
func (t *sshTransport) DialContext(ctx context.Context, _, _ string) (net.Conn, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.client == nil {
		if err := t.connectLocked(ctx); err != nil {
			return nil, err
		}
	}
	conn, err := t.client.Dial("unix", remoteDockerSocket)
	if err != nil {
		t.client.Close()
		t.client = nil
		if err := t.connectLocked(ctx); err != nil {
			return nil, err
		}
		conn, err = t.client.Dial("unix", remoteDockerSocket)
		if err != nil {
			return t.dialDockerCommandLocked()
		}
	}
	return conn, err
}

// dialDockerCommandLocked opens a Docker API byte stream through an ordinary
// SSH exec channel. The caller must hold t.mu and ensure t.client is connected.
func (t *sshTransport) dialDockerCommandLocked() (net.Conn, error) {
	session, err := t.client.NewSession()
	if err != nil {
		return nil, fmt.Errorf("open Docker dial-stdio session: %w", err)
	}
	stdin, err := session.StdinPipe()
	if err != nil {
		session.Close()
		return nil, fmt.Errorf("open Docker dial-stdio stdin: %w", err)
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		session.Close()
		return nil, fmt.Errorf("open Docker dial-stdio stdout: %w", err)
	}
	if err := session.Start(remoteDockerDialCommand); err != nil {
		session.Close()
		return nil, fmt.Errorf("start Docker dial-stdio: %w", err)
	}
	return &sshCommandConn{Reader: stdout, Writer: stdin, stdin: stdin, session: session}, nil
}

// sshCommandConn adapts a bidirectional SSH command stream to net.Conn so it
// can be used by net/http's Transport.
type sshCommandConn struct {
	io.Reader
	io.Writer
	stdin   io.Closer
	session *ssh.Session
	once    sync.Once
}

func (c *sshCommandConn) Close() error {
	var closeErr error
	c.once.Do(func() {
		if err := c.stdin.Close(); err != nil {
			closeErr = err
		}
		if err := c.session.Close(); err != nil && closeErr == nil && !errors.Is(err, io.EOF) {
			closeErr = err
		}
	})
	return closeErr
}

func (c *sshCommandConn) LocalAddr() net.Addr              { return commandAddr("ssh-local") }
func (c *sshCommandConn) RemoteAddr() net.Addr             { return commandAddr("docker-remote") }
func (c *sshCommandConn) SetDeadline(time.Time) error      { return nil }
func (c *sshCommandConn) SetReadDeadline(time.Time) error  { return nil }
func (c *sshCommandConn) SetWriteDeadline(time.Time) error { return nil }

type commandAddr string

func (a commandAddr) Network() string { return "ssh" }
func (a commandAddr) String() string  { return string(a) }

func (t *sshTransport) Close() {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.client != nil {
		t.client.Close()
		t.client = nil
	}
}

// tofuKeyStore implements trust-on-first-use host key checking persisted to a
// known_hosts file (default /data/known_hosts).
type tofuKeyStore struct {
	mu   sync.Mutex
	path string
}

func newTOFUKeyStore(path string) *tofuKeyStore {
	return &tofuKeyStore{path: path}
}

func (s *tofuKeyStore) callback() ssh.HostKeyCallback {
	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		s.mu.Lock()
		defer s.mu.Unlock()

		if _, err := os.Stat(s.path); err == nil {
			check, err := knownhosts.New(s.path)
			if err != nil {
				return fmt.Errorf("read %s: %w", s.path, err)
			}
			err = check(hostname, remote, key)
			if err == nil {
				return nil
			}
			var keyErr *knownhosts.KeyError
			if !errors.As(err, &keyErr) {
				// Anything that isn't a key mismatch (e.g. a revoked key or a
				// parse error) must never fall through to the trust-and-append
				// path below.
				return fmt.Errorf("verify host key for %s: %w", hostname, err)
			}
			if len(keyErr.Want) > 0 {
				return fmt.Errorf("host key mismatch for %s — remove its line from %s if the host was reinstalled", hostname, s.path)
			}
			// keyErr with no known keys for this host → genuinely first contact →
			// fall through and record the key (trust on first use).
		}

		f, err := os.OpenFile(s.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
		if err != nil {
			return err
		}
		defer f.Close()
		_, err = fmt.Fprintln(f, knownhosts.Line([]string{knownhosts.Normalize(hostname)}, key))
		return err
	}
}
