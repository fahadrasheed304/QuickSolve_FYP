import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet, BookOpen, Users, Star, Zap, Bell, Shield, Clock, CheckCircle, AlertCircle, GraduationCap, FileText, Send, Loader2, MapPin, Award } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/stores/auth-store'
import { getApiMessage, notifyError, notifySuccess } from '@/lib/toast'
import Link from 'next/link'

interface OpenProblem {
  id: string
  subject: string
  class: string
  details: string
  offer_price: number
  duration_min: number
  image_url?: string | null
  created_at: string
  bids?: Array<{ id: string }>
}

export default function TutorDashboard() {
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [showNotifications, setShowNotifications] = useState(false)
  const [openProblems, setOpenProblems] = useState<OpenProblem[]>([])
  const [isLoadingProblems, setIsLoadingProblems] = useState(false)
  const [bidPrices, setBidPrices] = useState<Record<string, string>>({})
  const [placingBidId, setPlacingBidId] = useState<string | null>(null)
  const [bidMessage, setBidMessage] = useState<string | null>(null)
  const [localAvailability, setLocalAvailability] = useState<boolean | null>(null)
  const [isUpdatingAvailability, setIsUpdatingAvailability] = useState(false)
  const profile = user?.tutorProfile
  const verificationStatus = profile?.verificationStatus || 'not_started'
  const totalSessions = profile?.totalSessions || 0
  const totalEarnings = profile?.totalEarnings || 0
  const subjects = profile?.subjects || []
  const isAvailable = localAvailability ?? profile?.isAvailable ?? true
  const displayName = (user?.fullname || user?.email || 'Tutor').split(' ')[0].split('@')[0]

  useEffect(() => {
    if (user?.role === 'tutor' && (!user.tutorProfile || user.tutorProfile.requiresProfileCompletion)) {
      router.replace('/tutor/complete-profile')
    }
  }, [user, router])

  useEffect(() => {
    if (profile?.isAvailable !== undefined) {
      setLocalAvailability(profile.isAvailable)
    }
  }, [profile?.isAvailable])

  useEffect(() => {
    let cancelled = false
    const loadOpenProblems = async () => {
      setIsLoadingProblems(true)
      try {
        const res = await fetch('/api/tutor/open-problems', { cache: 'no-store' })
        const data = await res.json()
        if (cancelled) return
        if (res.ok) {
          const problems = data.problems || []
          setOpenProblems(problems)
                    setBidPrices((current) =>
            problems.reduce((acc: Record<string, string>, problem: OpenProblem) => {
              acc[problem.id] = current[problem.id] || String(problem.offer_price || 400)
              return acc
            }, {})
          )
        }
      } finally {
        if (!cancelled) setIsLoadingProblems(false)
      }
    }

    if (user?.role === 'tutor' && user.tutorProfile && !user.tutorProfile.requiresProfileCompletion && isAvailable) {
      loadOpenProblems()
      const interval = window.setInterval(loadOpenProblems, 5000)
      return () => {
        cancelled = true
        window.clearInterval(interval)
      }
    } else if (!isAvailable) {
      setOpenProblems([])
      setBidPrices({})
    }
    return () => {
      cancelled = true
    }
  }, [user, isAvailable])

  const handleAvailabilityToggle = async () => {
    const nextAvailability = !isAvailable
    setIsUpdatingAvailability(true)
    setLocalAvailability(nextAvailability)
    if (!nextAvailability) {
      setOpenProblems([])
      setBidPrices({})
    }

    try {
      const res = await fetch('/api/tutor/availability', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable: nextAvailability }),
      })
      const data = await res.json()

      if (!res.ok) {
        setLocalAvailability(isAvailable)
        const message = getApiMessage(data, 'We could not update your availability. Please try again.')
        setBidMessage(message)
        notifyError(message)
        return
      }

      setLocalAvailability(Boolean(data.isAvailable))
      const message = data.isAvailable ? 'You are available for student requests' : 'You are unavailable now'
      setBidMessage(message)
      notifySuccess(message)
    } catch {
      setLocalAvailability(isAvailable)
      const message = 'We could not update your availability right now. Please check your connection and try again.'
      setBidMessage(message)
      notifyError(message)
    } finally {
      setIsUpdatingAvailability(false)
    }
      }

  const handlePlaceBid = async (problem: OpenProblem) => {
    setPlacingBidId(problem.id)
    setBidMessage(null)

    try {
      const price = Number(bidPrices[problem.id] || problem.offer_price)
      const res = await fetch('/api/tutor/bids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId: problem.id,
          price,
          durationMin: problem.duration_min,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        const message = getApiMessage(data, 'We could not place your bid. Please check the amount and try again.')
        setBidMessage(message)
        notifyError(message)
        return
      }

      setBidMessage('Bid placed successfully')
      notifySuccess('Your bid has been sent to the student.')
      setOpenProblems((current) =>
        current.map((item) =>
          item.id === problem.id
            ? { ...item, bids: [...(item.bids || []), data.bid] }
            : item
        )
      )
    } finally {
      setPlacingBidId(null)
    }
  }

  const metrics = [
    { label: 'Total Earnings', value: `Rs. ${totalEarnings.toLocaleString()}`, icon: Wallet, href: '/tutor/wallet', tone: 'bg-success-subtle text-success' },
    { label: 'Subjects', value: subjects.length, icon: BookOpen, tone: 'bg-primary-subtle text-primary' },
    { label: 'Sessions Done', value: totalSessions, icon: Users, tone: 'bg-accent-subtle text-accent' },
    { label: 'Rating', value: profile?.rating ? `${profile.rating}/5` : 'New', icon: Star, tone: 'bg-secondary-subtle text-secondary' },
  ]

  return (
    <div className="p-4 md:p-8 pb-20 qs-stagger">
      <div className="relative z-50 mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="qs-kicker rounded-full px-3 py-1.5">
            <GraduationCap className="h-4 w-4" />
            Tutor workspace
          </div>
          <h1 className="mt-4 text-4xl font-black text-text-main">Welcome, {displayName}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            {profile?.city && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-bold text-text-muted shadow-sm">
                <MapPin className="h-4 w-4 text-primary" />
                {profile.city}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-bold text-text-muted shadow-sm">
              <BookOpen className="h-4 w-4 text-secondary" />
                            {subjects.length} {subjects.length === 1 ? 'subject' : 'subjects'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-bold text-text-muted shadow-sm">
              <Award className="h-4 w-4 text-accent" />
              {profile?.highestEducation || 'Qualification pending'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAvailabilityToggle}
            disabled={isUpdatingAvailability}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 shadow-sm transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-70"
            aria-pressed={isAvailable}
          >
            <span className="text-sm font-bold text-text-muted">
              {isAvailable ? 'Available' : 'Unavailable'}
            </span>
            <span className={`flex h-6 w-12 items-center rounded-full px-1 transition-colors ${isAvailable ? 'justify-end bg-success' : 'justify-start bg-surface-container-high'}`}>
              <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
            </span>
          </button>

          <button onClick={logout} className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-600 transition-colors hover:bg-red-100">
            Logout
          </button>

          <div className="relative">
            <button onClick={() => setShowNotifications(!showNotifications)} className="rounded-lg border border-border bg-surface p-2.5 text-text-muted shadow-sm transition-all hover:bg-surface-hover">
              <Bell className="w-5 h-5" />
            </button>
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-72 rounded-lg border border-border bg-surface shadow-2xl z-50 overflow-hidden animate-scale-in">
                <div className="border-b border-border p-4 font-bold text-text-main">Notifications</div>
                <div className="p-6 text-center text-text-muted text-sm">No new notifications.</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {verificationStatus !== 'verified' && (
        <Card className="mb-8">
          <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center">
            {verificationStatus === 'under_review' ? (
              <Clock className="h-9 w-9 shrink-0 text-amber-500" />
            ) : verificationStatus === 'rejected' ? (
              <AlertCircle className="h-9 w-9 shrink-0 text-red-500" />
            ) : (
              <Shield className="h-9 w-9 shrink-0 text-primary" />
            )}
            <div className="flex-1">
              <h3 className="font-black text-text-main">
                {verificationStatus === 'under_review' ? 'Verification Under Review' :
                 verificationStatus === 'rejected' ? 'Verification Rejected' :
                 'Complete Your Verification'}
              </h3>
              <p className="mt-1 text-sm text-text-muted">
                {verificationStatus === 'under_review' ? 'Our team is reviewing your documents. This usually takes 24-48 hours.' :
                 verificationStatus === 'rejected' ? 'Your documents were not approved. Please re-submit clearer documents.' :
                 'Upload documents and pass the subject test to start receiving student problems.'}
              </p>
            </div>
                        {(verificationStatus === 'pending' || verificationStatus === 'not_started') && (
              <Link href="/tutor/complete-profile">
                <Button>Start Verification</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon
          const card = (
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
          return metric.href ? <Link key={metric.label} href={metric.href}>{card}</Link> : <div key={metric.label}>{card}</div>
        })}
      </div>

      <Card className="mesh-sheen mb-8 overflow-hidden border-transparent bg-hero-gradient text-white shadow-2xl">
        <CardContent className="grid gap-8 p-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-black uppercase">
              <Zap className="h-4 w-4 text-amber-200" />
              {verificationStatus === 'verified' ? 'Ready to teach' : 'Verification path'}
            </div>
            <h2 className="text-3xl font-black">
              {verificationStatus === 'verified'
                ? isAvailable ? 'You are visible to students' : 'You are currently unavailable'
                : 'Get verified to start earning'}
            </h2>
            <p className="mt-3 max-w-2xl text-white/75">
              {verificationStatus === 'verified'
                ? isAvailable
                  ? 'Keep availability on to receive live problem bids from students.'
                  : 'Turn availability on when you want to see student requests and place bids.'
                : 'Complete your profile, upload documents, and pass the subject test.'}
            </p>
          </div>
          {verificationStatus === 'verified' ? (
            <div className="rounded-lg border border-white/15 bg-white/10 p-6 text-center">
              <CheckCircle className="mx-auto mb-3 h-12 w-12 text-success-subtle" />
              <p className="text-lg font-black">Verified Tutor</p>
              <p className="mt-1 text-sm text-white/65">Students can book you</p>
            </div>
          ) : (
            <Link href="/tutor/complete-profile">
              <Button className="h-14 w-full bg-white text-primary hover:bg-surface-hover md:w-64">
                <Shield className="mr-2 h-5 w-5" />
                Start Verification
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>
      
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="qs-panel rounded-lg p-5">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="qs-kicker rounded-full px-3 py-1.5">
                <FileText className="h-4 w-4" />
                Student requests
              </div>
              <h3 className="mt-3 text-2xl font-black text-text-main">
                {isAvailable ? 'Open problems you can bid on' : 'Turn availability on to see requests'}
              </h3>
            </div>
            {bidMessage && (
              <span className="rounded-lg bg-success-subtle px-3 py-2 text-xs font-black text-success">
                {bidMessage}
              </span>
            )}
          </div>

          {!isAvailable ? (
            <div className="rounded-lg border border-border bg-surface p-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-surface-hover text-text-muted">
                <Clock className="h-6 w-6" />
              </div>
              <h4 className="font-black text-text-main">You are unavailable</h4>
              <p className="mt-2 text-sm text-text-muted">Switch availability on when you want to receive student requests.</p>
              <Button onClick={handleAvailabilityToggle} disabled={isUpdatingAvailability} className="mt-5">
                {isUpdatingAvailability && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Go Available
              </Button>
            </div>
          ) : isLoadingProblems ? (
            <div className="flex min-h-48 items-center justify-center rounded-lg border border-border bg-surface/70">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : openProblems.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                <BookOpen className="h-6 w-6" />
              </div>
              <h4 className="font-black text-text-main">No matching requests yet</h4>
              <p className="mt-2 text-sm text-text-muted">New student problems for your subjects will appear here.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {openProblems.map((problem) => (
                <article key={problem.id} className="rounded-lg border border-border bg-surface p-5 shadow-sm">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-primary-subtle px-3 py-1 text-xs font-black text-primary">{problem.subject}</span>
                        <span className="rounded-full bg-secondary-subtle px-3 py-1 text-xs font-black text-secondary-dark">{problem.class}</span>
                        <span className="rounded-full bg-surface-hover px-3 py-1 text-xs font-bold text-text-muted">{problem.duration_min} min</span>
                      </div>
                      <h4 className="text-lg font-black text-text-main">Rs. {Number(problem.offer_price || 0).toLocaleString()} student offer</h4>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-muted">
                        {problem.details || 'Student uploaded a problem and is waiting for tutor bids.'}
                      </p>
                      <p className="mt-3 text-xs font-bold text-text-muted">
                        {(problem.bids || []).length} bid(s) placed
                      </p>
                    </div>

                    <div className="w-full shrink-0 md:w-56"></div>