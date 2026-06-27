import { useState } from "react"
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog"
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  VStack,
  HStack,
  StackItem,
} from "@astryxdesign/core/Layout"
import { TextInput } from "@astryxdesign/core/TextInput"
import { Button } from "@astryxdesign/core/Button"
import { Banner } from "@astryxdesign/core/Banner"
import { useToast } from "@astryxdesign/core/Toast"
import {
  addHost,
  importSSHConfigHosts,
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
  /** Called after add/update with the saved alias, or null after removal/import. */
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

export function HostDialog({ open, onOpenChange, editing, onSaved }: HostDialogProps) {
  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange}>
      {/* Mount the form only while open so its state re-seeds from `editing`. */}
      {open && <HostForm editing={editing} onOpenChange={onOpenChange} onSaved={onSaved} />}
    </Dialog>
  )
}

function HostForm({ editing, onOpenChange, onSaved }: Omit<HostDialogProps, "open">) {
  const toast = useToast()
  const [form, setForm] = useState(editing ? toForm(editing) : EMPTY)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)

  const set = (k: keyof typeof EMPTY) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
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
        toast({ body: `Host "${hc.alias}" updated` })
      } else {
        await addHost(hc)
        toast({ body: `Host "${hc.alias}" added` })
      }
      onOpenChange(false)
      onSaved(hc.alias)
    } catch (e) {
      toast({ body: e instanceof Error ? e.message : String(e), type: "error" })
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
      toast({ body: `Host "${editing.alias}" removed` })
      onOpenChange(false)
      onSaved(null)
    } catch (e) {
      toast({ body: e instanceof Error ? e.message : String(e), type: "error" })
    } finally {
      setRemoving(false)
    }
  }

  const handleImport = async () => {
    setImporting(true)
    try {
      const res = await importSSHConfigHosts()
      toast({
        body:
          res.added === 0
            ? "No new SSH hosts found"
            : `Imported ${res.added} SSH host${res.added === 1 ? "" : "s"}`,
      })
      if (res.added > 0) {
        onOpenChange(false)
        onSaved(null)
      }
    } catch (e) {
      toast({ body: e instanceof Error ? e.message : String(e), type: "error" })
    } finally {
      setImporting(false)
    }
  }

  const incomplete = !form.host.trim() || !form.user.trim()
  const busy = saving || removing || importing

  return (
    <Layout
      header={
        <DialogHeader
          title={editing ? `Edit host "${editing.alias}"` : "Add SSH host"}
          onOpenChange={onOpenChange}
        />
      }
      content={
        <LayoutContent padding={4}>
          <VStack gap={4}>
            <TextInput
              label="Host"
              placeholder="server.example.com or 100.64.0.5"
              value={form.host}
              onChange={set("host")}
            />
            <HStack gap={3}>
              <StackItem size="fill">
                <TextInput label="User" placeholder="deploy" value={form.user} onChange={set("user")} />
              </StackItem>
              <StackItem size="fill">
                <TextInput label="Port" placeholder="22" value={form.port} onChange={set("port")} />
              </StackItem>
            </HStack>
            <TextInput
              label="Alias"
              isOptional
              placeholder="defaults to hostname"
              value={form.alias}
              onChange={set("alias")}
            />
            <TextInput
              label="SSH key"
              isOptional
              placeholder="auto-detect from /ssh"
              description="Keys are read from ~/.ssh mounted into the container; ssh-agent is used when available."
              value={form.keyPath}
              onChange={set("keyPath")}
            />
            <TextInput
              label="Password"
              isOptional
              type="password"
              placeholder="Used when no key works"
              description="Stored in plain text in the config volume — prefer SSH keys when possible."
              value={form.password}
              onChange={set("password")}
            />
            {testResult && (
              <Banner
                status={testResult.ok ? "success" : "error"}
                title={testResult.ok ? "Connection OK" : "Connection failed"}
                description={testResult.text}
              />
            )}
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter hasDivider>
          <HStack gap={2} vAlign="center">
            {editing ? (
              <Button
                label={confirmRemove ? "Confirm remove" : "Remove"}
                variant={confirmRemove ? "destructive" : "ghost"}
                isDisabled={busy}
                isLoading={removing}
                onClick={handleRemove}
              />
            ) : (
              <Button
                label="Import SSH config"
                variant="ghost"
                isDisabled={busy || testing}
                isLoading={importing}
                onClick={handleImport}
              />
            )}
            <StackItem size="fill" />
            <Button
              label="Test connection"
              variant="secondary"
              isDisabled={testing || busy || incomplete}
              isLoading={testing}
              onClick={handleTest}
            />
            <Button
              label={editing ? "Save changes" : "Add host"}
              variant="primary"
              isDisabled={busy || incomplete}
              isLoading={saving}
              onClick={handleSave}
            />
          </HStack>
        </LayoutFooter>
      }
    />
  )
}
