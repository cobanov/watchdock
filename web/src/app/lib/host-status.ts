import { isHostLoading, type HostBlock } from "@/app/lib/use-fleet"

export interface HostDot {
  variant: "success" | "warning" | "error" | "accent" | "neutral"
  pulse: boolean
  label: string
}

// Maps a host's live block + configured disabled flag to a StatusDot descriptor.
// Shared by the sidebar host list and the Hosts page so both stay in sync.
export function hostStatusDot(block: HostBlock | undefined, disabled?: boolean): HostDot {
  if (disabled) return { variant: "neutral", pulse: false, label: "Paused" }
  if (!block || isHostLoading(block))
    return { variant: "accent", pulse: true, label: "Connecting" }
  return block.status.ok
    ? { variant: "success", pulse: false, label: "Online" }
    : { variant: "error", pulse: true, label: "Offline" }
}
