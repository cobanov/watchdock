import { useState } from "react"
import { CheckIcon, Loader2Icon, PlugZapIcon, Trash2Icon } from "lucide-react"
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
import {
  addHost,
  removeHost,
  testHost,
  updateHost,
  type HostConfig,
} from "@/lib/api"

interface HostDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Host being edited; null means the dialog adds a new host. */
  editing: HostConfig | null
  /** Called after add/update with the saved alias, or null after removal. */
  onSaved: (alias: string | null) => void
}

const EMPTY = { alias: "", host: "", user: "", port: "", keyPath: "", password: "" }

function toForm(h: HostConfig): typeof EMPTY {
  return {
    alias: h.alias,
    host: h.host,
    user: h.user,
    port: h.port ? String(h.port) : "",
    keyPath: h.keyPath ?? "",
    password: h.password ?? "",
  }
}

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

export function HostDialog({ open, onOpenChange, editing, onSaved }: HostDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* DialogContent mounts fresh on every open, resetting the form state. */}
      <HostForm editing={editing} onOpenChange={onOpenChange} onSaved={onSaved} />
    </Dialog>
  )
}

function HostForm({
  editing,
  onOpenChange,
  onSaved,
}: Omit<HostDialogProps, "open">) {
  const [form, setForm] = useState(editing ? toForm(editing) : EMPTY)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
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
    password: form.password || undefined,
    disabled: editing?.disabled,
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

  const handleSave = async () => {
    setSaving(true)
    try {
      const hc = toHostConfig()
      if (editing) {
        await updateHost(editing.alias, hc)
        toast.success(`Host "${hc.alias}" updated`)
      } else {
        await addHost(hc)
        toast.success(`Host "${hc.alias}" added`)
      }
      onOpenChange(false)
      onSaved(hc.alias)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    if (!editing) return
    if (!confirmRemove) {
      setConfirmRemove(true)
      return
    }
    setRemoving(true)
    try {
      await removeHost(editing.alias)
      toast.success(`Host "${editing.alias}" removed`)
      onOpenChange(false)
      onSaved(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setRemoving(false)
    }
  }

  const incomplete = !form.host.trim() || !form.user.trim()
  const busy = saving || removing

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
          <DialogTitle>{editing ? `Edit host “${editing.alias}”` : "Add SSH host"}</DialogTitle>
          <DialogDescription>
            Monitor the Docker daemon on a remote machine over SSH. Authenticate
            with an SSH key (recommended) or a password; your user must be in
            the remote docker group.
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
          <Field
            id="password"
            label="Password (optional)"
            type="password"
            autoComplete="off"
            placeholder="Used when no key works"
            hint="Stored in plain text in the config volume — prefer SSH keys when possible."
            value={form.password}
            onChange={set("password")}
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

        <DialogFooter className="gap-2 sm:justify-between">
          {editing ? (
            <Button
              variant={confirmRemove ? "destructive" : "outline"}
              onClick={handleRemove}
              disabled={busy}
              className={confirmRemove ? "" : "text-destructive"}
            >
              {removing ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
              {confirmRemove ? "Confirm remove" : "Remove"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testing || busy || incomplete}
            >
              {testing ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />}
              Test connection
            </Button>
            <Button onClick={handleSave} disabled={busy || incomplete}>
              {saving && <Loader2Icon className="animate-spin" />}
              {editing ? "Save changes" : "Add host"}
            </Button>
          </div>
        </DialogFooter>
    </DialogContent>
  )
}
