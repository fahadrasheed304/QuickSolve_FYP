import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, BookOpen, Clock, Wallet, History, LogOut, Shield, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuthStore } from '@/stores/auth-store'
import { useWalletStore } from '@/stores/wallet-store'
import { useEffect, useState } from 'react'

export default function TutorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isLoading, fetchUser, logout } = useAuthStore()
  const { balance, fetchWallet } = useWalletStore()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    fetchUser()
    fetchWallet()
  }, [fetchUser, fetchWallet])

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
    { name: 'Availability', href: '/tutor/availability', icon: Clock },
    {
      name: 'Wallet',
      href: '/tutor/wallet',
      icon: Wallet,
      trailing: <span className="text-xs font-semibold text-success">Rs. {balance.toLocaleString()}</span>
    },
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