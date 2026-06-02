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