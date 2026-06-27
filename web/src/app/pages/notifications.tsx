import { useEffect, useState } from "react"
import { LayoutContent, VStack, HStack, StackItem } from "@astryxdesign/core/Layout"
import { Section } from "@astryxdesign/core/Section"
import { Text, Heading } from "@astryxdesign/core/Text"
import { TextInput } from "@astryxdesign/core/TextInput"
import { Switch } from "@astryxdesign/core/Switch"
import { Button } from "@astryxdesign/core/Button"
import { Badge } from "@astryxdesign/core/Badge"
import { Link } from "@astryxdesign/core/Link"
import { Center } from "@astryxdesign/core/Center"
import { Spinner } from "@astryxdesign/core/Spinner"
import { useToast } from "@astryxdesign/core/Toast"
import { fetchConfig, saveConfig, sendTestNotification, type Config } from "@/lib/api"
import { pagePad, formMax } from "@/app/lib/styles"

const RULES: { key: keyof Config; title: string; description: string; priority: string }[] = [
  { key: "notifyUnhealthy", title: "Unhealthy containers", description: "A container's healthcheck starts failing", priority: "Urgent" },
  { key: "notifyDown", title: "Crashed containers", description: "Died with a non-zero exit code; manual stops are ignored", priority: "High" },
  { key: "notifyRecovered", title: "Recoveries", description: "Back to healthy, or back up after a crash", priority: "Default" },
  { key: "notifyStopped", title: "Stopped containers", description: "Clean exits and manual stops", priority: "Default" },
  { key: "notifyStarted", title: "Started containers", description: "A container starts, including restarts", priority: "Default" },
]

export function NotificationsPage() {
  const toast = useToast()
  const [cfg, setCfg] = useState<Config | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [ignoreText, setIgnoreText] = useState("")

  useEffect(() => {
    fetchConfig()
      .then((c) => {
        setCfg(c)
        setIgnoreText(c.ignore.join(", "))
      })
      .catch((e) => toast({ body: `Failed to load config: ${e.message}`, type: "error" }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (cfg === null) {
    return (
      <LayoutContent role="main">
        <Center style={{ padding: "var(--spacing-8)" }}>
          <Spinner size="md" label="Loading configuration…" />
        </Center>
      </LayoutContent>
    )
  }

  const patch = (p: Partial<Config>) => {
    setCfg({ ...cfg, ...p })
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const saved = await saveConfig({
        ...cfg,
        ntfyServer: cfg.ntfyServer.trim(),
        ntfyTopic: cfg.ntfyTopic.trim(),
        ntfyToken: cfg.ntfyToken.trim(),
        ignore: ignoreText.split(",").map((s) => s.trim()).filter(Boolean),
      })
      setCfg(saved)
      setIgnoreText(saved.ignore.join(", "))
      setDirty(false)
      toast({ body: "Settings saved" })
    } catch (e) {
      toast({ body: e instanceof Error ? e.message : String(e), type: "error" })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      await sendTestNotification({
        ntfyServer: cfg.ntfyServer.trim(),
        ntfyTopic: cfg.ntfyTopic.trim(),
        ntfyToken: cfg.ntfyToken.trim(),
      })
      toast({ body: "Test notification sent — check your phone" })
    } catch (e) {
      toast({ body: e instanceof Error ? e.message : String(e), type: "error" })
    } finally {
      setTesting(false)
    }
  }

  const topicSet = cfg.ntfyTopic.trim().length > 0
  const serverHost = (cfg.ntfyServer.trim() || "https://ntfy.sh").replace(/^https?:\/\//, "")

  return (
    <LayoutContent role="main">
      <VStack gap={6} style={{ ...pagePad, ...formMax }}>
        <HStack gap={3} vAlign="start">
          <StackItem size="fill">
            <VStack gap={0}>
              <Heading level={1}>Notifications</Heading>
              <Text type="supporting" color="secondary">
                Alerts are pushed to your phone through{" "}
                <Link href="https://ntfy.sh" isExternalLink>
                  ntfy
                </Link>
                . Subscribe to the same topic in the ntfy app.
              </Text>
            </VStack>
          </StackItem>
          <Button
            label="Send test"
            variant="secondary"
            isDisabled={testing || !topicSet}
            isLoading={testing}
            onClick={handleTest}
          />
          <Button
            label="Save changes"
            variant="primary"
            isDisabled={saving || !dirty}
            isLoading={saving}
            onClick={handleSave}
          />
        </HStack>

        <Section padding={4}>
          <VStack gap={4}>
            <HStack gap={2} vAlign="center">
              <StackItem size="fill">
                <Heading level={2}>Endpoint</Heading>
              </StackItem>
              <Badge
                variant={topicSet ? "green" : "yellow"}
                label={topicSet ? "Active" : "Not configured"}
              />
            </HStack>
            <Text type="supporting" color="secondary">
              {topicSet
                ? `Publishing to ${serverHost}/${cfg.ntfyTopic.trim()}`
                : "Notifications are disabled until you set a topic."}
            </Text>
            <TextInput
              label="Server"
              placeholder="https://ntfy.sh"
              description="Defaults to the public ntfy.sh service; self-hosted works too."
              value={cfg.ntfyServer}
              onChange={(v) => patch({ ntfyServer: v })}
            />
            <TextInput
              label="Topic"
              placeholder="my-secret-topic-x7q2"
              description="Anyone who knows the topic can read it — pick something unguessable."
              value={cfg.ntfyTopic}
              onChange={(v) => patch({ ntfyTopic: v })}
            />
            <TextInput
              label="Access token"
              type="password"
              placeholder="Only needed for protected servers"
              value={cfg.ntfyToken}
              onChange={(v) => patch({ ntfyToken: v })}
            />
          </VStack>
        </Section>

        <Section padding={4}>
          <VStack gap={4}>
            <VStack gap={0}>
              <Heading level={3}>Alert rules</Heading>
              <Text type="supporting" color="secondary">
                Fires only on state transitions, rate-limited per container.
              </Text>
            </VStack>
            {RULES.map((rule) => (
              <Switch
                key={rule.key}
                label={rule.title}
                description={rule.description}
                value={cfg[rule.key] as boolean}
                onChange={(v) => patch({ [rule.key]: v } as Partial<Config>)}
                labelPosition="start"
                labelSpacing="spread"
              />
            ))}
          </VStack>
        </Section>

        <Section padding={4}>
          <VStack gap={4}>
            <VStack gap={0}>
              <Heading level={3}>Ignore list</Heading>
              <Text type="supporting" color="secondary">
                Containers matched here never trigger notifications. Comma separated,
                wildcards supported.
              </Text>
            </VStack>
            <TextInput
              label="Ignore list"
              isLabelHidden
              placeholder="watchtower, dev-*"
              value={ignoreText}
              onChange={(v) => {
                setIgnoreText(v)
                setDirty(true)
              }}
            />
          </VStack>
        </Section>
      </VStack>
    </LayoutContent>
  )
}
