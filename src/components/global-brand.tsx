"use client"

import { usePathname } from 'next/navigation'

const hiddenBrandRoutes = new Set([
  '/signin-page',
  '/signup-page',
  '/admin/signin',
  '/tutor/signin-page',
  '/tutor/signup',
])

export function GlobalBrand() {
  const pathname = usePathname()

  const isDashboardShell = pathname.startsWith('/tutor/') || pathname.startsWith('/student/')

  if (hiddenBrandRoutes.has(pathname) || isDashboardShell) return null

  return (
    <header className="w-full border-b border-border/80 bg-white/92 px-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur-xl sm:px-8">
      <div className="mx-auto flex h-16 max-w-7xl items-center">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-slate-950 text-white shadow-lg shadow-slate-900/15"
          >
            <span className="absolute inset-0 bg-[linear-gradient(135deg,rgba(37,99,235,0.95),rgba(20,184,166,0.9))]" />
            <span className="relative flex h-6 w-6 items-center justify-center rounded-md border border-white/30 bg-white/10 text-[13px] font-black leading-none">
              Q
            </span>
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-white/90" />
          </span>
          <span className="text-xl font-black tracking-normal text-text-main">QuickSolve</span>
        </div>
      </div>
    </header>
  )
}
