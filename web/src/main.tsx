import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@astryxdesign/core/reset.css"
import "@astryxdesign/core/astryx.css"
import { Theme } from "@astryxdesign/core"
import { neutralTheme } from "@astryxdesign/theme-neutral"
import { AppShell } from "@/app/app-shell"
import { useColorMode } from "@/app/lib/color-mode"

function Root() {
  const [mode, toggleMode] = useColorMode()
  return (
    <Theme theme={neutralTheme} mode={mode}>
      <AppShell mode={mode} onToggleMode={toggleMode} />
    </Theme>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
