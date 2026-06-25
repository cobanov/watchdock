import { Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"
import { hostStatusKind, type HostStatus, type StatusKind } from "@/lib/api"

const dotBg: Record<StatusKind, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  alert: "bg-alert",
  idle: "bg-idle",
}

export function StatusDot({
  kind,
  pulse,
  className,
}: {
  kind: StatusKind
  pulse?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full",
        dotBg[kind],
        pulse && "animate-pulse",
        className,
      )}
    />
  )
}

// HostDot shows a spinner while a host is still being reached, then resolves to
// a coloured dot. It never shows green until the host has actually answered.
export function HostDot({
  status,
  loading,
  className,
}: {
  status: HostStatus
  loading: boolean
  className?: string
}) {
  if (loading) {
    return (
      <Loader2Icon
        className={cn("size-3.5 shrink-0 animate-spin text-muted-foreground", className)}
      />
    )
  }
  return (
    <StatusDot
      kind={hostStatusKind(status)}
      pulse={!status.disabled && !status.ok}
      className={className}
    />
  )
}
