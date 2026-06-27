import type { CSSProperties } from "react"

// Shared token-based inline styles reused across the app's pages. Astryx stacks
// expose no padding prop and Tailwind/StyleX aren't wired up here, so token CSS
// vars via `style` are the sanctioned fallback (see web/.claude/CLAUDE.md).

// Standard outer padding for a page's content area.
export const pagePad: CSSProperties = { padding: "var(--spacing-6)" }

// Centered, readable max width for form/guide pages.
export const formMax: CSSProperties = { maxWidth: 760, width: "100%", marginInline: "auto" }

// A framed surface around a table so it reads as a contained panel rather than
// bleeding to the viewport edges. overflow:hidden clips full-bleed rows to the
// rounded corners.
export const tableFrame: CSSProperties = {
  border: "var(--border-width) solid var(--color-border-emphasized)",
  borderRadius: "var(--radius-container)",
  overflow: "hidden",
  backgroundColor: "var(--color-background-surface)",
}
