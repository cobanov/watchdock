import { useCallback, useState } from "react"

export type ColorMode = "light" | "dark"

const STORAGE_KEY = "dockwatch-theme"

function initialMode(): ColorMode {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === "light" || saved === "dark") return saved
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

// Persisted light/dark mode, fed to <Theme mode={...}> at the app root.
export function useColorMode(): [ColorMode, () => void] {
  const [mode, setMode] = useState<ColorMode>(initialMode)
  const toggle = useCallback(() => {
    setMode((prev) => {
      const next = prev === "dark" ? "light" : "dark"
      localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }, [])
  return [mode, toggle]
}
