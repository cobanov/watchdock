package main

import "testing"

func TestTopicFor(t *testing.T) {
	cfg := Config{
		NtfyTopic: "alerts",
		Hosts: []HostConfig{
			{Alias: "spark", NtfyTopic: "dataland"},
			{Alias: "nuc"},
			{Alias: "blank", NtfyTopic: "   "},
		},
	}
	for _, tc := range []struct{ alias, want string }{
		{"spark", "dataland"}, // own topic
		{"nuc", "alerts"},     // no override
		{"blank", "alerts"},   // whitespace is not a topic
		{"local", "alerts"},   // the daemon watchdock runs on has no host entry
		{"gone", "alerts"},    // a host removed from the config
	} {
		if got := topicFor(cfg, tc.alias); got != tc.want {
			t.Errorf("topicFor(%q) = %q, want %q", tc.alias, got, tc.want)
		}
	}
}
