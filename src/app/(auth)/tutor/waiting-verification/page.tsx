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