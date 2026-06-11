import { useState } from "react"
import { CheckIcon, Loader2Icon, PlugZapIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { addHost, testHost, type HostConfig } from "@/lib/api"

interface AddHostDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: () => void
}

const EMPTY = { alias: "", host: "", user: "", port: "", keyPath: "" }

function Field({
  id,
  label,
  hint,
  ...input
}: { id: string; label: string; hint?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...input} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function AddHostDialog({ open, onOpenChange, onAdded }: AddHostDialogProps) {
  const [form, setForm] = useState(EMPTY)
  const [testing, setTesting] = useState(false)
  const [adding, setAdding] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [k]: e.target.value })
    setTestResult(null)
  }

  const toHostConfig = (): HostConfig => ({
    alias: form.alias.trim() || form.host.trim().split(".")[0],
    host: form.host.trim(),
    user: form.user.trim(),
    port: form.port.trim() ? Number(form.port) : undefined,
    keyPath: form.keyPath.trim() || undefined,
  })

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testHost(toHostConfig())
      setTestResult({
        ok: true,
        text: `Connected — ${res.containers} container${res.containers === 1 ? "" : "s"} found`,
      })
    } catch (e) {
      setTestResult({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setTesting(false)
    }
  }

  const handleAdd = async () => {
    setAdding(true)
    try {
      await addHost(toHostConfig())
      toast.success(`Host "${toHostConfig().alias}" added`)
      setForm(EMPTY)
      setTestResult(null)
      onOpenChange(false)
      onAdded()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setAdding(false)
    }
  }

  const incomplete = !form.host.trim() || !form.user.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add SSH host</DialogTitle>
          <DialogDescription>
            Monitor the Docker daemon on a remote machine over SSH. Requires
            public-key auth and your user in the remote docker group.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <Field
            id="host"
            label="Host"
            placeholder="server.example.com or 100.64.0.5"
            value={form.host}
            onChange={set("host")}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="user"
              label="User"
              placeholder="cobanov"
              value={form.user}
              onChange={set("user")}
            />
            <Field
              id="port"
              label="Port"
              placeholder="22"
              value={form.port}
              onChange={set("port")}
            />
          </div>
          <Field
            id="alias"
            label="Alias (optional)"
            placeholder="defaults to hostname"
            value={form.alias}
            onChange={set("alias")}
          />
          <Field
            id="keyPath"
            label="SSH key (optional)"
            placeholder="auto-detect from /ssh"
            hint="Keys are read from ~/.ssh mounted into the container; ssh-agent is used when available."
            value={form.keyPath}
            onChange={set("keyPath")}
          />

          {testResult && (
            <div
              className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                testResult.ok
                  ? "border-ok/25 bg-ok/10 text-ok"
                  : "border-alert/25 bg-alert/10 text-alert"
              }`}
            >
              {testResult.ok && <CheckIcon className="mt-px size-3.5 flex-none" />}
              <span className="break-all">{testResult.text}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={testing || incomplete}
          >
            {testing ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />}
            Test connection
          </Button>
          <Button onClick={handleAdd} disabled={adding || incomplete}>
            {adding && <Loader2Icon className="animate-spin" />}
            Add host
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
