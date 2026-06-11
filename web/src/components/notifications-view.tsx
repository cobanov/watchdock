import { useEffect, useState } from "react"
import { Loader2Icon, SendIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { WindowTitle } from "@/components/window-title"
import { cn } from "@/lib/utils"
import {
  fetchConfig,
  saveConfig,
  sendTestNotification,
  type Config,
} from "@/lib/api"

interface RuleProps {
  title: string
  description: string
  priority: string
  priorityClass: string
  checked: boolean
  onChange: (v: boolean) => void
}

function Rule({ title, description, priority, priorityClass, checked, onChange }: RuleProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border px-3.5 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
      </div>
      <div className="flex flex-none items-center gap-3">
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em]",
            priorityClass,
          )}
        >
          {priority}
        </span>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  )
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  return (
    <Label
      htmlFor={htmlFor}
      className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground"
    >
      {children}
    </Label>
  )
}

export function NotificationsView() {
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
      .catch((e) => toast.error(`Failed to load config: ${e.message}`))
  }, [])

  if (cfg === null) {
    return (
      <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" /> loading configuration…
      </div>
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
      toast.success("Settings saved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      await sendTestNotification()
      toast.success("Test notification sent — check your phone")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Alerts are pushed to your phone through{" "}
          <a
            href="https://ntfy.sh"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            ntfy
          </a>
          . Subscribe to the same topic in the ntfy app.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
            {testing ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <SendIcon />
            )}
            Send test
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
            {saving && <Loader2Icon className="animate-spin" />}
            Save changes
          </Button>
        </div>
      </div>

      {cfg.ntfyTopic.trim() ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-ok/25 bg-ok/10 px-3.5 py-2.5 text-sm">
          <span className="font-semibold text-ok">Notifications armed</span>
          <span className="font-mono text-xs text-ok/80">
            {(cfg.ntfyServer.trim() || "https://ntfy.sh").replace(/^https?:\/\//, "")}/
            {cfg.ntfyTopic.trim()}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          <span className="led text-warn" />
          No topic configured — notifications are disabled until you set one.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <WindowTitle>ntfy endpoint</WindowTitle>
            </CardTitle>
            <CardDescription>
              Defaults to the public ntfy.sh service; any self-hosted server works too.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <FieldLabel htmlFor="server">server</FieldLabel>
              <Input
                id="server"
                className="font-mono text-sm"
                placeholder="https://ntfy.sh"
                value={cfg.ntfyServer}
                onChange={(e) => patch({ ntfyServer: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <FieldLabel htmlFor="topic">topic</FieldLabel>
              <Input
                id="topic"
                className="font-mono text-sm"
                placeholder="my-secret-topic-x7q2"
                value={cfg.ntfyTopic}
                onChange={(e) => patch({ ntfyTopic: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Anyone who knows the topic can read it — pick something unguessable.
              </p>
            </div>
            <div className="grid gap-1.5">
              <FieldLabel htmlFor="token">access token (optional)</FieldLabel>
              <Input
                id="token"
                type="password"
                autoComplete="off"
                className="font-mono text-sm"
                placeholder="tk_…"
                value={cfg.ntfyToken}
                onChange={(e) => patch({ ntfyToken: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <WindowTitle>alert rules</WindowTitle>
            </CardTitle>
            <CardDescription>
              Fires only on state transitions, rate-limited per container.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Rule
              title="Unhealthy"
              description="A container's healthcheck starts failing"
              priority="urgent"
              priorityClass="border-alert/25 bg-alert/10 text-alert"
              checked={cfg.notifyUnhealthy}
              onChange={(v) => patch({ notifyUnhealthy: v })}
            />
            <Rule
              title="Crashed"
              description="Died with a non-zero exit code; manual stops are ignored"
              priority="high"
              priorityClass="border-warn/25 bg-warn/10 text-warn"
              checked={cfg.notifyDown}
              onChange={(v) => patch({ notifyDown: v })}
            />
            <Rule
              title="Recovered"
              description="Back to healthy, or back up after a crash"
              priority="default"
              priorityClass="border-ok/25 bg-ok/10 text-ok"
              checked={cfg.notifyRecovered}
              onChange={(v) => patch({ notifyRecovered: v })}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              <WindowTitle>ignore list</WindowTitle>
            </CardTitle>
            <CardDescription>
              Containers matched here never trigger notifications. Comma separated,{" "}
              <code className="font-mono text-foreground">*</code> wildcards supported.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              className="font-mono text-sm"
              placeholder="watchtower, dev-*"
              value={ignoreText}
              onChange={(e) => {
                setIgnoreText(e.target.value)
                setDirty(true)
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
