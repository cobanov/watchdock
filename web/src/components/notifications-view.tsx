import { useEffect, useState } from "react"
import { CheckCircle2Icon, Loader2Icon, SendIcon, TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import {
  fetchConfig,
  saveConfig,
  sendTestNotification,
  type Config,
} from "@/lib/api"

interface RuleProps {
  id: string
  title: string
  description: string
  priority: string
  checked: boolean
  onChange: (v: boolean) => void
}

function Rule({ id, title, description, priority, checked, onChange }: RuleProps) {
  return (
    <div className="flex items-center justify-between gap-6 p-4">
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {title}
        </Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-none items-center gap-3">
        <Badge variant="outline" className="text-muted-foreground">
          {priority}
        </Badge>
        <Switch id={id} checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
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
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" /> Loading configuration…
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

  const serverHost = (cfg.ntfyServer.trim() || "https://ntfy.sh").replace(/^https?:\/\//, "")

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Notifications</h2>
          <p className="text-sm text-muted-foreground">
            Alerts are pushed to your phone through{" "}
            <a
              href="https://ntfy.sh"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline underline-offset-4"
            >
              ntfy
            </a>
            . Subscribe to the same topic in the ntfy app.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
            Send test
          </Button>
          <Button onClick={handleSave} disabled={saving || !dirty}>
            {saving && <Loader2Icon className="animate-spin" />}
            Save changes
          </Button>
        </div>
      </div>

      {cfg.ntfyTopic.trim() ? (
        <Alert className="border-ok/30 text-ok [&>svg]:text-ok">
          <CheckCircle2Icon />
          <AlertTitle>Notifications armed</AlertTitle>
          <AlertDescription className="text-ok/80">
            Publishing to {serverHost}/{cfg.ntfyTopic.trim()}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-warn/30 text-warn [&>svg]:text-warn">
          <TriangleAlertIcon />
          <AlertTitle>No topic configured</AlertTitle>
          <AlertDescription className="text-warn/80">
            Notifications are disabled until you set a topic below.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>ntfy endpoint</CardTitle>
          <CardDescription>
            Defaults to the public ntfy.sh service; any self-hosted server works too.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="server">Server</Label>
            <Input
              id="server"
              placeholder="https://ntfy.sh"
              value={cfg.ntfyServer}
              onChange={(e) => patch({ ntfyServer: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              placeholder="my-secret-topic-x7q2"
              value={cfg.ntfyTopic}
              onChange={(e) => patch({ ntfyTopic: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Anyone who knows the topic can read it — pick something unguessable.
            </p>
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="token">Access token</Label>
            <Input
              id="token"
              type="password"
              autoComplete="off"
              placeholder="Only needed for protected servers"
              value={cfg.ntfyToken}
              onChange={(e) => patch({ ntfyToken: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alert rules</CardTitle>
          <CardDescription>
            Fires only on state transitions, rate-limited per container.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y rounded-xl border">
            <Rule
              id="rule-unhealthy"
              title="Unhealthy containers"
              description="A container's healthcheck starts failing"
              priority="Urgent"
              checked={cfg.notifyUnhealthy}
              onChange={(v) => patch({ notifyUnhealthy: v })}
            />
            <Rule
              id="rule-down"
              title="Crashed containers"
              description="Died with a non-zero exit code; manual stops are ignored"
              priority="High"
              checked={cfg.notifyDown}
              onChange={(v) => patch({ notifyDown: v })}
            />
            <Rule
              id="rule-recovered"
              title="Recoveries"
              description="Back to healthy, or back up after a crash"
              priority="Default"
              checked={cfg.notifyRecovered}
              onChange={(v) => patch({ notifyRecovered: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ignore list</CardTitle>
          <CardDescription>
            Containers matched here never trigger notifications. Comma separated,
            wildcards supported.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
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
  )
}
