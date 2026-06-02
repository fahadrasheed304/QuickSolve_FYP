import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Wallet, FileText, CheckCircle, Star, Zap, Bell, PlusCircle, ArrowRight, Sparkles, Clock3, XCircle, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useWalletStore } from '@/stores/wallet-store'
import { useBidsStore } from '@/stores/bids-store'
import { useAuthStore } from '@/stores/auth-store'
import { LiveBidsList } from '@/components/bids/live-bids-list'
import { notifyError, notifySuccess } from '@/lib/toast'

export default function StudentDashboard() {
  const balance = useWalletStore((state) => state.balance)
  const bids = useBidsStore((state) => state.bids)
  const activeProblems = useBidsStore((state) => state.activeProblems)
  const fetchStudentBids = useBidsStore((state) => state.fetchStudentBids)
  const cancelProblem = useBidsStore((state) => state.cancelProblem)
  const bidsError = useBidsStore((state) => state.error)
  const { user, logout } = useAuthStore()
  const [showNotifications, setShowNotifications] = useState(false)
  const [cancellingProblemId, setCancellingProblemId] = useState<string | null>(null)
  const displayName = (user?.fullname || user?.email || 'Student').split(' ')[0].split('@')[0]

  useEffect(() => {
    fetchStudentBids()
    const interval = window.setInterval(fetchStudentBids, 5000)
    return () => window.clearInterval(interval)
  }, [fetchStudentBids])

  useEffect(() => {
    if (bidsError) {
      notifyError(bidsError)
    }
  }, [bidsError])

  const metrics = [
    { label: 'Available Balance', value: `Rs. ${balance.toLocaleString()}`, icon: Wallet, href: '/student/wallet', tone: 'bg-primary-subtle text-primary' },
    { label: 'Active Problems', value: activeProblems.length, icon: FileText, tone: 'bg-accent-subtle text-accent' },
    { label: 'Sessions Completed', value: user?.sessions || 0, icon: CheckCircle, tone: 'bg-success-subtle text-success' },
    { label: 'Rating', value: user?.rating ? `${user.rating}/5` : 'New', icon: Star, tone: 'bg-secondary-subtle text-secondary' },
  ]

  const handleCancelProblem = async (problemId: string) => {
    const shouldCancel = window.confirm('Cancel this active problem request? Tutors will no longer be able to bid on it.')
    if (!shouldCancel) return

    setCancellingProblemId(problemId)
    const cancelled = await cancelProblem(problemId)
    if (cancelled) {
      notifySuccess('Problem request cancelled.')
    }
    setCancellingProblemId(null)
  }

  return (
    <div className="p-4 md:p-8 pb-20 qs-stagger">
      <div className="relative z-50 mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="qs-kicker rounded-full px-3 py-1.5">
            <Sparkles className="h-4 w-4" />
            Student workspace
          </div>
          <h1 className="mt-4 text-4xl font-black text-text-main">Welcome back, {displayName}</h1>
          <p className="mt-1 text-text-muted">{user?.class && user?.group ? `${user.class} / ${user.group}` : 'Student'}</p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={logout} className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-600 transition-colors hover:bg-red-100">
            Logout
          </button>
                    <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative rounded-lg border border-border bg-surface p-2.5 text-text-muted shadow-sm transition-all hover:bg-surface-hover"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-72 rounded-lg border border-border bg-surface shadow-2xl z-50 overflow-hidden animate-scale-in">
                <div className="border-b border-border p-4 font-bold text-text-main">
                  Notifications
                </div>
                <div className="p-6 text-center text-text-muted text-sm">
                  No new notifications.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon
          const body = (
            <Card className="h-full">
              <CardContent className="flex items-center gap-4 p-5">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${metric.tone}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-muted">{metric.label}</p>
                  <h3 className="text-2xl font-black text-text-main">{metric.value}</h3>
                </div>
              </CardContent>
            </Card>
          )

          return metric.href ? <Link key={metric.label} href={metric.href}>{body}</Link> : <div key={metric.label}>{body}</div>
        })}
      </div>

      <Card className="mesh-sheen mb-8 overflow-hidden border-transparent bg-hero-gradient text-white shadow-2xl">
        <CardContent className="relative grid gap-8 p-8 md:grid-cols-[1fr_auto] md:items-center md:p-10">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-black uppercase">
              <Zap className="h-4 w-4 text-amber-200" />
              Average tutor response: 3 minutes
            </div>
            <h2 className="text-3xl font-black">Need help right now?</h2>
            <p className="mt-3 max-w-2xl text-white/75">
              Post a question with image, class, subject, duration, and your price. Verified tutors can bid instantly.
            </p>
          </div>
          <Link href="/student/post-problem">
            <Button className="h-14 w-full bg-white text-primary hover:bg-surface-hover md:w-64">
              <PlusCircle className="mr-2 h-5 w-5" />
              Post New Problem
            </Button>
          </Link>
        </CardContent>
      </Card>

      {activeProblems.length > 0 && bids.length === 0 && (
        <div className="mb-8 qs-panel rounded-lg p-5">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black uppercase text-amber-700">
                <Clock3 className="h-4 w-4" />
                Waiting for tutor bids
              </div>