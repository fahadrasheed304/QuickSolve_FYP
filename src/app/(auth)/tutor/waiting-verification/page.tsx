"use client"

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Clock3,
  FileText,
  GraduationCap,
  Loader2,
  LogOut,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notifyError } from '@/lib/toast'

interface VerificationStatus {
  status: string
  stage: string
  message: string
  canTakeTest: boolean
  canRetakeTest: boolean
  retakeAvailableAt: string | null
  retakeRemainingMs: number
  testAttempts: number
  lastTestScore: number | null
  testPassed: boolean | null
  stats: {
    degreesCount: number
    documentsCount: number
    testResultsCount: number
  }
  adminNotes: string[]
}

const stages = [
  { key: 'submitted', label: 'Submitted', icon: FileText },
  { key: 'under_review', label: 'Review', icon: ShieldCheck },
  { key: 'test_invited', label: 'Test', icon: GraduationCap },
  { key: 'test_passed', label: 'Passed', icon: Award },
  { key: 'verified', label: 'Verified', icon: CheckCircle2 },
]

const stageMeta: Record<string, { title: string; eyebrow: string; tone: string }> = {
  submitted: {
    title: 'Application submitted',
    eyebrow: 'Profile in queue',
    tone: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  pending: {
    title: 'Application submitted',
    eyebrow: 'Profile in queue',
    tone: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  under_review: {
    title: 'Admin review in progress',
    eyebrow: 'Documents under review',
    tone: 'bg-primary-subtle text-primary border-primary/20',
  },
  test_invited: {
    title: 'Subject test available',
    eyebrow: 'Ready for next step',
    tone: 'bg-success-subtle text-success border-success/20',
  },
  test_scheduled: {
    title: 'Subject test scheduled',
    eyebrow: 'Prepare for test',
    tone: 'bg-primary-subtle text-primary border-primary/20',
  },
  test_passed: {
    title: 'Test passed',
    eyebrow: 'Final review',
    tone: 'bg-success-subtle text-success border-success/20',
  },
  test_failed: {
    title: 'Test retake needed',
    eyebrow: 'Action required',
    tone: 'bg-red-50 text-red-600 border-red-200',
  },
  rejected: {
    title: 'Application needs attention',
    eyebrow: 'Admin feedback',
    tone: 'bg-red-50 text-red-600 border-red-200',
  },
}

export default function WaitingVerificationPage() {
  const router = useRouter()
  const [status, setStatus] = useState<VerificationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (error) {
      notifyError(error)
    }
  }, [error])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/signin-page?role=tutor')
    } catch (err) {
      console.error('Logout failed:', err)
    }
  }

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/tutor/verification-status', { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        if (data?.requiresProfileCompletion || data?.stage === 'not_started') {
          router.replace('/tutor/complete-profile')
          return
        }
        if (data?.stage === 'verified' || data?.status === 'verified') {
          router.replace('/tutor/dashboard')
          return
        }
        setStatus(data)
        setError('')
      } else if (res.status === 401) {
        router.replace('/signin-page?role=tutor')
      } else if (res.status === 404 || res.status === 409 || data?.requiresProfileCompletion) {
        router.replace('/tutor/complete-profile')
      } else {
        setError('We could not load your verification status. Please refresh and try again.')
         }
    } catch {
      setError('We could not reach the verification service. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const currentIndex = getStepIndex(status?.stage || 'pending')
  const currentMeta = useMemo(() => {
    return stageMeta[status?.stage || 'pending'] || stageMeta.pending
  }, [status?.stage])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="qs-panel flex w-full max-w-sm flex-col items-center rounded-lg p-8 text-center">
          <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
          <p className="font-bold text-text-main">Loading verification status</p>
          <p className="mt-1 text-sm text-text-muted">Checking your tutor application.</p>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="qs-panel w-full max-w-md rounded-lg p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-red-50 text-red-600">
            <RefreshCw className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-black text-text-main">Status unavailable</h1>
          <p className="mt-2 text-sm text-text-muted">{error}</p>
          <Button onClick={fetchStatus} className="mt-6">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:py-8">
      <div className="mx-auto max-w-6xl qs-page-enter">
        <header className="mb-5 overflow-hidden rounded-lg bg-hero-gradient surface-grid text-white shadow-2xl shadow-primary/10">
          <div className="relative p-6 sm:p-8">
            <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-black uppercase">
                  <Sparkles className="h-4 w-4" />
                  Tutor verification
                </div>
                <h1 className="text-4xl font-black leading-tight sm:text-5xl">{currentMeta.title}</h1>
                <p className="mt-3 max-w-2xl text-base font-semibold leading-7 text-white/72">
                  {status?.message || 'Your application is moving through the verification workflow.'}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
                <span className={`inline-flex items-center justify-center rounded-lg border bg-white px-4 py-2 text-sm font-black ${currentMeta.tone}`}>
                  {currentMeta.eyebrow}
                </span>
                <Button onClick={handleLogout} className="h-11 border border-white/20 bg-white/10 px-4 text-white hover:bg-white/20">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </Button>
              </div>
            </div>
          </div>
        </header>

        <section className="mb-5 grid gap-4 md:grid-cols-3">
          <StatCard icon={Award} label="Degrees" value={status?.stats.degreesCount ?? 0} />
          <StatCard icon={FileText} label="Documents" value={status?.stats.documentsCount ?? 0} />
          <StatCard icon={GraduationCap} label="Test Attempts" value={status?.testAttempts ?? 0} />
        </section>

        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <section className="qs-panel rounded-lg p-5 sm:p-6">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="qs-kicker rounded-full px-3 py-1.5">Progress</div>
                <h2 className="mt-3 text-2xl font-black text-text-main">Application timeline</h2>
              </div>
              <button
                type="button"
                onClick={fetchStatus}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-bold text-text-muted transition hover:bg-surface-hover hover:text-text-main"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>

            <div className="grid gap-3">
              {stages.map((step, index) => {
                const Icon = step.icon
                const isDone = index < currentIndex
                const isCurrent = index === currentIndex

                return (
                  <div
                    key={step.key}
                    className={`rounded-lg border p-4 transition ${
                      isCurrent
                        ? 'border-primary bg-primary-subtle/60 shadow-lg shadow-primary/10'
                        : isDone
                          ? 'border-success/20 bg-success-subtle/45'
                          : 'border-border bg-surface/76'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                        isDone
                          ? 'bg-success text-white'
                          : isCurrent
                            ? 'bg-primary text-white'
                            : 'bg-surface-hover text-text-muted'
                      }`}>
                        {isDone ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-black text-text-main">{step.label}</h3>
                        <p className="mt-1 text-sm font-semibold text-text-muted">
                          {getStepText(step.key, isCurrent, status)}
                        </p>
                      </div>
                      {isCurrent && (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-primary shadow-sm">
                          Current
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <aside className="space-y-5">
            {(status?.canTakeTest || status?.stage === 'test_failed') && (
              <section className="qs-card rounded-lg p-5">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                  <GraduationCap className="h-6 w-6" />
                </div>
                <h2 className="text-xl font-black text-text-main">
                  {status.canRetakeTest ? 'Retake available' : status.stage === 'test_failed' ? 'Retake locked' : 'Test available'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  {status.canRetakeTest
                    ? `Previous score: ${status.lastTestScore || 0}%. You can retake the subject test.`
                    : status.stage === 'test_failed'
                      ? `${status.message}${status.retakeAvailableAt ? ` Available on ${new Date(status.retakeAvailableAt).toLocaleDateString()}.` : ''}`
                    : 'You are invited to take the subject proficiency test.'}
                </p>
                <div className="mt-4 space-y-2 rounded-lg bg-surface-hover p-3 text-sm font-bold text-text-muted">
                  <p>20 minutes duration</p>
                  <p>80% passing score</p>
                  <p>Camera and tab monitoring</p>
                </div>
                <Button
                  onClick={() => router.push('/tutor/take-test')}
                  disabled={!status.canTakeTest}
                  className="mt-5 h-11 w-full"
                >
                  {status.canTakeTest ? 'Start Test' : 'Retake not available yet'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </section>
            )}

            <section className="qs-card rounded-lg p-5">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-secondary-subtle text-secondary">
                <Clock3 className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-black text-text-main">Auto updates</h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                This page refreshes every 30 seconds while your application is being reviewed.
              </p>
            </section>

            {status?.adminNotes && status.adminNotes.length > 0 && (
              <section className="qs-card rounded-lg p-5">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                    <MessageSquare className="h-5 w-5" />
                  </span>
                  <h2 className="text-xl font-black text-text-main">Admin notes</h2>
                </div>
                <div className="space-y-3">
                  {status.adminNotes.map((note, index) => (
                    <div key={`${note}-${index}`} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-900">
                      {note}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>
    </main>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: number
}) {
  return (
    <div className="qs-card rounded-lg p-5">
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-subtle text-primary">
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <p className="text-sm font-bold text-text-muted">{label}</p>
          <p className="text-3xl font-black text-text-main">{value}</p>
        </div>
      </div>
    </div>
  )
}

function getStepIndex(stage: string): number {
  const indexByStage: Record<string, number> = {
    submitted: 0,
    pending: 0,
    under_review: 1,
    test_invited: 2,
    test_scheduled: 2,
    test_failed: 2,
    test_passed: 3,
    verified: 4,
    rejected: 1,
  }
  return indexByStage[stage] ?? 0
}

function getStepText(step: string, isCurrent: boolean, status: VerificationStatus | null) {
  if (step === 'submitted') return isCurrent ? 'Your profile is in the verification queue.' : 'Profile submitted successfully.'
  if (step === 'under_review') return isCurrent ? 'Admin is reviewing your profile, degrees, and documents.' : 'Document review step.'
  if (step === 'test_invited') return isCurrent ? 'Your subject test is ready when invited.' : 'Subject proficiency test.'
  if (step === 'test_passed') {
    if (status?.testPassed) return `Passed with ${status.lastTestScore || 0}%.`
    return 'Pass the subject test to move forward.'
  }
  if (step === 'verified') return 'Tutor dashboard unlocks after final approval.'
  return 'Pending'
}
