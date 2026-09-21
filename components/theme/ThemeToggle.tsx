"use client"

import { useClientReady } from "@/hooks/use-client-ready"
import { useTheme } from "next-themes"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const mounted = useClientReady()

  if (!mounted) return <div className="w-9 h-9" />

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center text-gray-600 dark:text-zinc-400"
      aria-label="Toggle Theme"
    >
      {theme === "dark" ? (
        <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>light_mode</span>
      ) : (
        <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>dark_mode</span>
      )}
    </button>
  )
}
