import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, PlusCircle, Video, Wallet, History, LogOut, Menu, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useWalletStore } from '@/stores/wallet-store'
import { useAuthStore } from '@/stores/auth-store'
import { useEffect, useState } from 'react'

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { balance, fetchWallet } = useWalletStore()
  const { user, isLoading, fetchUser, logout } = useAuthStore()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    fetchUser()
    fetchWallet()
  }, [fetchUser, fetchWallet])

  const navItems: Array<{
    name: string
    href: string
    icon: LucideIcon
    trailing?: React.ReactNode
    badge?: React.ReactNode
  }> = [
    { name: 'Dashboard', href: '/student/dashboard', icon: LayoutDashboard },
    { name: 'Post Problem', href: '/student/post-problem', icon: PlusCircle },
    { name: 'Sessions', href: '/student/session/history', icon: Video },
    {
      name: 'Wallet',
      href: '/student/wallet',
      icon: Wallet,
    },
    { name: 'History', href: '/student/history', icon: History },
  ]

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="mt-4 text-sm font-medium text-text-muted">Loading your profile...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden flex-col md:flex-row">
      <div className="md:hidden flex items-center justify-between bg-surface/92 backdrop-blur-xl border-b border-border p-4 flex-shrink-0 z-20 shadow-sm">
        <Link href="/student/dashboard" className="text-xl font-black text-gradient-primary">
          QuickSolve
        </Link>
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
          <Link href="/student/dashboard" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-premium-gradient text-white font-black shadow-lg shadow-primary/20">Q</span>
            <span className="text-2xl font-black text-gradient-primary">QuickSolve</span>