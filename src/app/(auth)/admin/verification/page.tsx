"use client"

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  BadgeCheck,
  BookOpen,
  Camera,
  CheckCircle2,
  CheckSquare,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  FileText,
  GraduationCap,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getCurrentTutorDocuments } from '@/lib/tutor-documents'
import { getApiMessage, notifyError, notifySuccess } from '@/lib/toast'

interface TutorDegree {
  degree_name?: string | null
  institution?: string | null
  board_university?: string | null
  year_completed?: string | number | null
}

interface TutorDocument {
  id?: string
  document_type?: string | null
  document_url?: string | null
  file_name?: string | null
  uploaded_at?: string | null
}

interface TutorNote {
  message: string
  note_type: string
  created_at: string
}

interface Tutor {
  user_email: string
  fullname: string
  email?: string
  phone?: string
  subjects?: string[]
  verification_status?: string
  verification_stage?: string
  city?: string
  test_attempts?: number
  subject_test_passed?: boolean
  _degreeCount?: number
  _docCount?: number
   degrees?: TutorDegree[]
  documents?: TutorDocument[]
  notes?: TutorNote[]
  testResults?: unknown[]
  users?: {
    email?: string
    fullname?: string
    created_at?: string
    phone?: string
  }
}

interface TutorDetailResponse {
  profile?: Partial<Tutor>
  degrees?: TutorDegree[]
  documents?: TutorDocument[]
  notes?: TutorNote[]
  testResults?: unknown[]
  user?: {
    email?: string
    fullname?: string
    phone?: string
    createdAt?: string
  }
}

const STAGES = [
  { value: 'all', label: 'All' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'pending', label: 'Pending' },
  { value: 'under_review', label: 'Reviewing' },
  { value: 'test_invited', label: 'Test' },
  { value: 'test_passed', label: 'Passed' },
  { value: 'test_failed', label: 'Failed' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
]

const STAGE_META: Record<string, { label: string; badge: string; dot: string }> = {
  submitted: {
    label: 'Submitted',
    badge: 'border-primary/20 bg-primary-subtle text-primary-dark',
    dot: 'bg-primary',
  },
  pending: {
    label: 'Pending',
    badge: 'border-amber-200 bg-amber-50 text-amber-800',
    dot: 'bg-warning',
  },
  under_review: {
    label: 'Under review',
    badge: 'border-secondary/20 bg-secondary-subtle text-secondary-dark',
    dot: 'bg-secondary',
  },
  test_invited: {
    label: 'Test invited',
    badge: 'border-primary/20 bg-primary-subtle text-primary-dark',
    dot: 'bg-primary',
  },
  test_passed: {
    label: 'Test passed',
    badge: 'border-success/20 bg-success-subtle text-success',
    dot: 'bg-success',
  },
  test_failed: {
    label: 'Test failed',
    badge: 'border-red-200 bg-red-50 text-red-700',
    dot: 'bg-error',