import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@fontsource-variable/geist/index.css"
import "@fontsource-variable/geist-mono/index.css"
import "./index.css"
import App from "./App"
import { Toaster } from "@/components/ui/sonner"
import { initTheme } from "@/lib/theme"

initTheme()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Toaster position="bottom-right" />
  </StrictMode>,
)
