package main

import (
	"context"
	"errors"
	"fmt"
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
	}
	return conn, err
}

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
			if errors.As(err, &keyErr) && len(keyErr.Want) > 0 {
				return fmt.Errorf("host key mismatch for %s — remove its line from %s if the host was reinstalled", hostname, s.path)
			}
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
