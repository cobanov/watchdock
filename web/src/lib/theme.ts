export type Theme = "light" | "dark"

const STORAGE_KEY = "dockwatch-theme"

function storedTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === "light" || saved === "dark") return saved
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark")
}

export function initTheme() {
  apply(storedTheme())
}

export function toggleTheme(): Theme {
  const next: Theme = document.documentElement.classList.contains("dark")
    ? "light"
    : "dark"
  localStorage.setItem(STORAGE_KEY, next)
  apply(next)
  return next
}
