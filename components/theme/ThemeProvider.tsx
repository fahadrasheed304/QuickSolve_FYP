"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

// Wrapping the type properly depending on next-themes version
export function ThemeProvider({ 
  children, 
  ...props 
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
