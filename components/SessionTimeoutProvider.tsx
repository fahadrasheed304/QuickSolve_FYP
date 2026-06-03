"use client"

import { useSessionTimeout } from "@/hooks/use-session-timeout"

export function SessionTimeoutProvider({ children }: { children: React.ReactNode }) {
  // This will enable auto-logout after 15 min inactivity
  useSessionTimeout()
  
  return <>{children}</>
}
