package main

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

var sshConfigPath = envOr("SSH_CONFIG_PATH", filepath.Join(sshKeyDir, "config"))

type sshConfigBlock struct {
	patterns []string
	hostname string
	user     string
	port     int
	keyPath  string
}

func discoverSSHConfigHosts(path string) ([]HostConfig, error) {
	f, err := os.Open(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var hosts []HostConfig
	var block *sshConfigBlock

	flush := func() {
		if block == nil {
			return
		}
		h, ok := block.toHostConfig()
		if ok {
			hosts = append(hosts, h)
		}
	}

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		fields := sshConfigFields(scanner.Text())
		if len(fields) == 0 {
			continue
		}
		key := strings.ToLower(fields[0])
		if key == "host" {
			flush()
			block = &sshConfigBlock{patterns: fields[1:]}
			continue
		}
		if block == nil || len(fields) < 2 {
			continue
		}
		value := fields[1]
		switch key {
		case "hostname":
			block.hostname = value
		case "user":
			block.user = value
		case "port":
			if p, err := strconv.Atoi(value); err == nil && p > 0 && p <= 65535 {
				block.port = p
			}
		case "identityfile":
			if block.keyPath == "" {
				block.keyPath = sshKeyPathInContainer(value)
			}
		}
	}
	flush()
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return hosts, nil
}

func (b sshConfigBlock) toHostConfig() (HostConfig, bool) {
	alias := firstLiteralHostPattern(b.patterns)
	if alias == "" || alias == localHostAlias || !aliasRe.MatchString(alias) {
		return HostConfig{}, false
	}
	if b.user == "" {
		return HostConfig{}, false
	}
	host := b.hostname
	if host == "" || host == "%h" {
		host = alias
	}
	if strings.Contains(host, "%") || strings.ContainsAny(host, " /") {
		return HostConfig{}, false
	}
	return HostConfig{
		Alias:   alias,
		Host:    host,
		User:    b.user,
		Port:    b.port,
		KeyPath: b.keyPath,
	}, true
}

func firstLiteralHostPattern(patterns []string) string {
	for _, p := range patterns {
		p = strings.TrimSpace(p)
		if p == "" || strings.HasPrefix(p, "!") {
			continue
		}
		if strings.ContainsAny(p, "*?") {
			continue
		}
		return p
	}
	return ""
}

func sshConfigFields(line string) []string {
	line = strings.TrimSpace(stripSSHConfigComment(line))
	if line == "" {
		return nil
	}
	return strings.Fields(line)
}

func stripSSHConfigComment(line string) string {
	var out strings.Builder
	var quote rune
	escaped := false
	for _, r := range line {
		if escaped {
			out.WriteRune(r)
			escaped = false
			continue
		}
		if r == '\\' {
			out.WriteRune(r)
			escaped = true
			continue
		}
		if quote != 0 {
			if r == quote {
				quote = 0
			}
			out.WriteRune(r)
			continue
		}
		if r == '\'' || r == '"' {
			quote = r
			out.WriteRune(r)
			continue
		}
		if r == '#' {
			break
		}
		out.WriteRune(r)
	}
	return out.String()
}

func sshKeyPathInContainer(p string) string {
	p = strings.Trim(p, `"'`)
	switch {
	case strings.HasPrefix(p, "~/.ssh/"):
		return filepath.Join(sshKeyDir, strings.TrimPrefix(p, "~/.ssh/"))
	case strings.HasPrefix(p, "$HOME/.ssh/"):
		return filepath.Join(sshKeyDir, strings.TrimPrefix(p, "$HOME/.ssh/"))
	}
	if home, err := os.UserHomeDir(); err == nil {
		prefix := filepath.Join(home, ".ssh") + string(filepath.Separator)
		if strings.HasPrefix(p, prefix) {
			return filepath.Join(sshKeyDir, strings.TrimPrefix(p, prefix))
		}
	}
	return p
}

func ImportSSHConfigHosts(store *ConfigStore) (int, error) {
	discovered, err := discoverSSHConfigHosts(sshConfigPath)
	if err != nil {
		return 0, fmt.Errorf("read %s: %w", sshConfigPath, err)
	}
	if len(discovered) == 0 {
		return 0, nil
	}

	cfg := store.Get()
	seenAlias := map[string]bool{}
	seenTarget := map[string]bool{}
	for _, h := range cfg.Hosts {
		seenAlias[h.Alias] = true
		seenTarget[hostTargetKey(h)] = true
	}

	added := 0
	for _, h := range discovered {
		if seenAlias[h.Alias] || seenTarget[hostTargetKey(h)] {
			continue
		}
		cfg.Hosts = append(cfg.Hosts, h)
		seenAlias[h.Alias] = true
		seenTarget[hostTargetKey(h)] = true
		added++
	}
	if added == 0 {
		return 0, nil
	}
	valid, err := validateHosts(cfg.Hosts)
	if err != nil {
		return 0, err
	}
	cfg.Hosts = valid
	return added, store.Set(cfg)
}

func hostTargetKey(h HostConfig) string {
	port := h.Port
	if port == 0 {
		port = 22
	}
	return fmt.Sprintf("%s@%s:%d", h.User, h.Host, port)
}
