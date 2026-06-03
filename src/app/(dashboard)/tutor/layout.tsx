"use client"

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, BookOpen, History, LogOut, Shield, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuthStore } from '@/stores/auth-store'
import { useEffect, useState } from 'react'

export default function TutorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isLoading, fetchUser, logout } = useAuthStore()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        const timer = setTimeout(() => {
          const currentUser = useAuthStore.getState().user
          if (!currentUser) {
            router.push('/signin-page?role=tutor')
          }
        }, 300)
        return () => clearTimeout(timer)
      } else if (user.role !== 'tutor') {
        router.push('/student/dashboard')
      }
    }
  }, [isLoading, user, router])

  const isTestPage = pathname === '/tutor/take-test'
  const verificationStatus = user?.tutorProfile?.verificationStatus || 'pending'

  const navItems = [
    { name: 'Dashboard', href: '/tutor/dashboard', icon: LayoutDashboard },
    { name: 'My Subjects', href: '/tutor/subjects', icon: BookOpen },
    { name: 'History', href: '/tutor/history', icon: History },
  ]

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
          <p className="mt-4 text-sm font-medium text-text-muted">Loading your profile...</p>
        </div>
      </div>
    )
  }

  if (isTestPage) {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden flex-col md:flex-row">
      <div className="md:hidden flex items-center justify-between bg-surface/92 backdrop-blur-xl border-b border-border p-4 flex-shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-2">
          <Link href="/tutor/dashboard" className="text-xl font-black text-gradient-primary">
            QuickSolve
          </Link>
          <span className="text-[10px] font-black bg-secondary text-white px-2 py-0.5 rounded-full">TUTOR</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-text-muted hover:bg-surface-hover rounded-lg">
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-[#101d32]/55 z-30 md:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <div className={cn(
        "fixed inset-y-0 left-0 z-40 w-[292px] bg-surface/90 backdrop-blur-2xl border-r border-border flex flex-col transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 h-full shadow-2xl md:shadow-none",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-5 flex items-center justify-between">
          <Link href="/tutor/dashboard" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-premium-gradient text-white font-black shadow-lg shadow-secondary/20">Q</span>
            <span className="text-2xl font-black text-gradient-primary">QuickSolve</span>
          </Link>
          <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden p-2 text-text-muted hover:bg-surface-hover rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mx-4 mb-4 rounded-lg border border-border bg-surface-hover/70 p-4">
          <p className="text-xs font-bold uppercase text-text-muted">Verification</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="text-sm font-black capitalize text-text-main">{verificationStatus.replace(/_/g, ' ')}</span>
            <Shield className="h-4 w-4 text-secondary" />
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200",
                  isActive
                    ? "bg-premium-gradient text-white shadow-lg shadow-primary/20"
                    : "text-text-muted hover:bg-surface-hover hover:text-text-main hover:translate-x-1"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive ? "text-white" : "text-text-muted")} />
                <span className="flex-1">{item.name}</span>
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-border flex items-center justify-between bg-surface/70">
          <div className="flex items-center gap-3 truncate pr-2">
            <Avatar className="h-10 w-10 ring-2 ring-secondary/25 ring-offset-2 ring-offset-background">
              <AvatarFallback className="bg-secondary-subtle text-secondary-dark font-bold">{(user?.fullname || user?.email || 'TU').substring(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="truncate">
              <p className="text-sm font-semibold text-text-main truncate">{(user?.fullname || user?.email || 'Tutor').split('@')[0]}</p>
              <p className="text-xs text-text-muted truncate">Tutor</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-2 text-text-muted flex-shrink-0 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
            title="Log Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto relative qs-page-enter">
        {children}
      </main>
    </div>
  )
}
