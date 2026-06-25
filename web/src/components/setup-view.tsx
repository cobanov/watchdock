import { useState } from "react"
import {
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import type { View } from "@/App"

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="relative rounded-lg border bg-muted/50">
      <pre className="overflow-x-auto p-4 pr-12 font-mono text-xs leading-relaxed">
        {code}
      </pre>
      <Button
        variant="ghost"
        size="icon"
        onClick={copy}
        aria-label="Copy to clipboard"
        className="absolute right-1.5 top-1.5 size-7 text-muted-foreground"
      >
        {copied ? <CheckIcon className="text-ok" /> : <CopyIcon />}
      </Button>
    </div>
  )
}

function StepTitle({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <CardTitle className="flex items-center gap-3">
      <span className="flex size-6 flex-none items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {step}
      </span>
      {children}
    </CardTitle>
  )
}

export function SetupView({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Setup guide</h2>
        <p className="text-sm text-muted-foreground">
          Get dockwatch running and receive container alerts on your phone in a
          few minutes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <StepTitle step={1}>Run dockwatch</StepTitle>
          <CardDescription>
            dockwatch runs as a container and watches every other container on
            the machine through the Docker socket.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <CodeBlock
            code={`git clone https://github.com/cobanov/dockwatch.git
cd dockwatch
docker compose up -d --build`}
          />
          <p className="text-sm text-muted-foreground">
            The compose file mounts <code className="font-mono text-xs">/var/run/docker.sock</code>{" "}
            read-only and stores configuration in a named volume. Once it is up,
            the UI is served at{" "}
            <code className="font-mono text-xs">http://localhost:9622</code> — the
            page you are looking at right now.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <StepTitle step={2}>Install the ntfy app</StepTitle>
          <CardDescription>
            ntfy is a free pub-sub notification service; no account required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Install the app on your phone, then subscribe to a topic. The
            default topic is{" "}
            <code className="font-mono text-xs">dockwatch</code> — fine for a
            quick test or a self-hosted server, but on the public ntfy.sh
            anyone who knows the topic can read it, so pick something
            unguessable like{" "}
            <code className="font-mono text-xs">dockwatch-x7q2-mertc</code>.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a
                href="https://apps.apple.com/us/app/ntfy/id1625396347"
                target="_blank"
                rel="noreferrer"
              >
                App Store <ExternalLinkIcon />
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a
                href="https://play.google.com/store/apps/details?id=io.heckel.ntfy"
                target="_blank"
                rel="noreferrer"
              >
                Google Play <ExternalLinkIcon />
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="https://ntfy.sh" target="_blank" rel="noreferrer">
                ntfy.sh <ExternalLinkIcon />
              </a>
            </Button>
          </div>
          <Separator />
          <p className="text-sm text-muted-foreground">
            In the app: tap <span className="font-medium text-foreground">+</span>,
            choose <span className="font-medium text-foreground">Subscribe to topic</span>,
            and enter your topic name. Self-hosted ntfy servers work too.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <StepTitle step={3}>Connect dockwatch to ntfy</StepTitle>
          <CardDescription>
            Point dockwatch at the same topic your phone subscribes to.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Open the Notifications page, enter your topic, hit{" "}
            <span className="font-medium text-foreground">Save changes</span>, then{" "}
            <span className="font-medium text-foreground">Send test</span>. A
            notification should arrive on your phone within a second or two.
          </p>
          <Button size="sm" onClick={() => onNavigate("notifications")}>
            Open Notifications <ArrowRightIcon />
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <StepTitle step={4}>Add remote hosts (optional)</StepTitle>
          <CardDescription>
            Monitor Docker on other machines over SSH — nothing to install on
            the remote side.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Click <span className="font-medium text-foreground">+</span> next to{" "}
            <span className="font-medium text-foreground">Hosts</span> in the
            sidebar and enter the machine's address and SSH user. Authenticate
            with an SSH key (recommended) or a password; your user must be able
            to access the Docker socket (in the{" "}
            <code className="font-mono text-xs">docker</code> group).
          </p>
          <p className="text-sm text-muted-foreground">
            SSH keys are read from <code className="font-mono text-xs">~/.ssh</code>,
            mounted read-only into the container. Each host gets its own table on
            the dashboard, and the switch next to a host pauses or resumes its
            monitoring.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
