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