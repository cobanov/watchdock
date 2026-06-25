import { MoonIcon, SunIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toggleTheme } from "@/lib/theme"

export function ThemeToggle() {
  return (
    <Button variant="ghost" size="icon" onClick={() => toggleTheme()}>
      <SunIcon className="dark:hidden" />
      <MoonIcon className="hidden dark:block" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
