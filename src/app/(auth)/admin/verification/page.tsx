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
    },
  verified: {
    label: 'Verified',
    badge: 'border-success/20 bg-success-subtle text-success',
    dot: 'bg-success',
  },
  rejected: {
    label: 'Rejected',
    badge: 'border-red-200 bg-red-50 text-red-700',
    dot: 'bg-error',
  },
  not_started: {
    label: 'Not started',
    badge: 'border-border bg-surface-container-low text-text-muted',
    dot: 'bg-text-muted',
  },
}

function formatStage(stage?: string) {
  return (stage || 'not_started')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function getStageMeta(stage?: string) {
  const safeStage = stage || 'not_started'
  return STAGE_META[safeStage] || {
    label: formatStage(safeStage),
    badge: 'border-border bg-surface-container-low text-text-muted',
    dot: 'bg-text-muted',
  }
}

function getTutorName(tutor?: Tutor | null) {
  return tutor?.fullname || tutor?.users?.fullname || tutor?.email || tutor?.user_email || 'Tutor'
}

function getTutorEmail(tutor?: Tutor | null) {
  return tutor?.email || tutor?.users?.email || tutor?.user_email || ''
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] || 'T'
  const second = parts.length > 1 ? parts[1]?.[0] : ''
  return `${first}${second}`.toUpperCase()
}

function getDocumentIcon(type?: string | null) {
  const safeType = type || ''
  if (safeType.includes('cnic')) return ShieldCheck
  if (safeType === 'profile_photo') return Camera
  return FileText
}

function formatDate(value?: string | null) {
  if (!value) return 'Recent'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recent'
  return date.toLocaleDateString()
}

export default function AdminVerificationsPage() {
  const router = useRouter()
  const [tutors, setTutors] = useState<Tutor[]>([])
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [selectedTutor, setSelectedTutor] = useState<Tutor | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [updating, setUpdating] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')

  useEffect(() => {
    if (error) {
      notifyError(error)
    }
  }, [error])

  const fetchTutors = useCallback(async () => {
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/admin/verifications', { cache: 'no-store' })

      if (res.ok) {
        const data = await res.json() as { tutors?: Tutor[] }
        setTutors(data.tutors || [])
      } else if (res.status === 401) {
        router.push('/admin/signin')
      } else if (res.status === 403) {
        setError('Admin access is required to view tutor applications.')
      } else {
        setError('We could not load tutor applications. Please refresh and try again.')
      }
    } catch {
      setError('We could not reach the admin service. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [router])

  const fetchTutorDetail = useCallback(async (tutorEmail: string) => {
    setDetailLoading(tutorEmail)

    try {
      const res = await fetch(`/api/admin/tutor-detail?tutorEmail=${encodeURIComponent(tutorEmail)}`, { cache: 'no-store' })

      if (res.ok) {
        const data = await res.json() as TutorDetailResponse
        const cleanDocuments = getCurrentTutorDocuments(data.documents || [])
        const profile = data.profile || {}
        const updatedStage = profile.verification_stage || 'under_review'
        const updatedStatus = profile.verification_status || 'pending'

        setSelectedTutor({
          ...profile,
          user_email: profile.user_email || tutorEmail,
          degrees: data.degrees || [],
          documents: cleanDocuments,
          notes: data.notes || [],
          testResults: data.testResults || [],
          fullname: data.user?.fullname || profile.fullname || tutorEmail,
          email: data.user?.email || profile.email || tutorEmail,
          phone: profile.phone || data.user?.phone || '',
        } as Tutor)
        setTutors(prev => prev.map(tutor =>
          tutor.user_email === tutorEmail
            ? {
                ...tutor,
                verification_stage: updatedStage,
                verification_status: updatedStatus,
              }
              Add admin verification helpers"
               : tutor
        ))
      } else if (res.status === 401) {
        router.push('/admin/signin')
      }
    } catch (err) {
      console.error('Failed to fetch tutor detail:', err)
    } finally {
      setDetailLoading(null)
    }
  }, [router])

  useEffect(() => {
    fetchTutors()
  }, [fetchTutors])

  const updateStatus = useCallback(async (tutorEmail: string, newStage: string, newStatus: string) => {
    setUpdating(tutorEmail)

    try {
      const res = await fetch('/api/admin/verifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tutorEmail,
          newStage,
          newStatus,
          notes: noteText,
        }),
      })

      if (res.ok) {
        notifySuccess('Tutor verification status updated.')
        setTutors(prev => prev.map(tutor =>
          tutor.user_email === tutorEmail
            ? { ...tutor, verification_stage: newStage, verification_status: newStatus }
            : tutor
        ))
        setNoteText('')

        if (selectedTutor?.user_email === tutorEmail) {
          setSelectedTutor(prev => prev ? {
            ...prev,
            verification_stage: newStage,
            verification_status: newStatus,
          } : null)
          void fetchTutorDetail(tutorEmail)
        }
      } else {
        const data = await res.json().catch(() => ({ error: 'Failed to update status' })) as { error?: string }
        notifyError(getApiMessage(data, 'We could not update the tutor status. Please try again.'))
      }
    } catch {
      notifyError('We could not update the tutor status right now. Please check your connection and try again.')
    } finally {
      setUpdating(null)
    }
  }, [fetchTutorDetail, noteText, selectedTutor?.user_email])

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/admin/signin')
    } catch (err) {
      console.error('Logout failed:', err)
    }
  }, [router])
  const filteredTutors = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()

    return tutors.filter(tutor => {
      const matchesSearch = !search ||
        getTutorEmail(tutor).toLowerCase().includes(search) ||
        getTutorName(tutor).toLowerCase().includes(search)

      const matchesStage = stageFilter === 'all' || tutor.verification_stage === stageFilter

      return matchesSearch && matchesStage
    })
  }, [searchTerm, stageFilter, tutors])

  const stageCounts = useMemo(() => {
    return tutors.reduce<Record<string, number>>((counts, tutor) => {
      const stage = tutor.verification_stage || 'not_started'
      counts[stage] = (counts[stage] || 0) + 1
      counts.all = (counts.all || 0) + 1
      return counts
    }, { all: 0 })
  }, [tutors])

  const queueStats = useMemo(() => {
    const activeReviewCount = tutors.filter(tutor =>
      ['submitted', 'pending', 'under_review'].includes(tutor.verification_stage || '')
    ).length
    const testCount = tutors.filter(tutor =>
      ['test_invited', 'test_passed', 'test_failed'].includes(tutor.verification_stage || '')
    ).length

    return [
      {
        label: 'Applications',
        value: tutors.length,
        icon: Users,
        tone: 'border-white/20 bg-white/12 text-white',
      },
      {
        label: 'In review',
        value: activeReviewCount,
        icon: ClipboardCheck,
        tone: 'border-white/20 bg-white/12 text-white',
      },
      {
        label: 'Test flow',
        value: testCount,
        icon: Clock3,
        tone: 'border-white/20 bg-white/12 text-white',
      },
      {
        label: 'Verified',
        value: stageCounts.verified || 0,
        icon: CheckCircle2,
        tone: 'border-white/20 bg-white/12 text-white',
      },
    ]
  }, [stageCounts.verified, tutors])

  const selectedDegrees = selectedTutor?.degrees || []
  const selectedDocuments = useMemo(
    () => getCurrentTutorDocuments(selectedTutor?.documents || []),
    [selectedTutor?.documents]
  )
  const selectedSubjects = Array.isArray(selectedTutor?.subjects) ? selectedTutor.subjects : []
  const selectedStageMeta = getStageMeta(selectedTutor?.verification_stage)
  const selectedEmail = getTutorEmail(selectedTutor)
  const selectedName = getTutorName(selectedTutor)
  const isIncompleteSubmission = Boolean(selectedTutor && selectedDegrees.length === 0)
  const isUpdatingSelected = Boolean(selectedTutor && updating === selectedTutor.user_email)

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="qs-panel flex w-full max-w-sm flex-col items-center rounded-lg p-8 text-center">
          <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
          <p className="font-semibold text-text-main">Loading verification desk</p>
          <p className="mt-1 text-sm text-text-muted">Fetching tutor applications...</p>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <div className="qs-panel w-full max-w-lg rounded-lg p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-red-50 text-error">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-black text-text-main">Verification desk unavailable</h1>
          <p className="mt-2 text-sm text-text-muted">{error}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button type="button" variant="outline" onClick={fetchTutors}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
            <Button type="button" variant="outline" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 qs-page-enter lg:px-6">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-5 overflow-hidden rounded-lg bg-hero-gradient surface-grid text-white shadow-2xl shadow-primary/10">
          <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-black uppercase">
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin verification
              </div>
              <h1 className="text-3xl font-black md:text-4xl">Tutor verification desk</h1>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-white/78">
                <span>{filteredTutors.length} visible</span>
                <span>/</span>
                <span>{tutors.length} total applications</span>
                <span>/</span>
                <span>{stageCounts.rejected || 0} rejected</span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-white/24 bg-white/12 px-4 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-white/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[520px]">
              {queueStats.map(stat => {
                const Icon = stat.icon
                return (
                  <div key={stat.label} className={`rounded-lg border p-3 ${stat.tone}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase text-white/68">{stat.label}</span>
                      <Icon className="h-4 w-4 text-white/78" />
                    </div>
                    <p className="mt-2 text-2xl font-black">{stat.value}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </header>

        <section className="qs-panel mb-5 rounded-lg p-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="qs-input h-11 w-full rounded-lg px-10 text-sm"
                placeholder="Search name or email"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {STAGES.map(stage => {
                const active = stageFilter === stage.value
                return (
                  <button
                    key={stage.value}
                    type="button"
                    onClick={() => setStageFilter(stage.value)}
                    className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-black transition ${
                      active
                        ? 'border-primary bg-primary text-white shadow-lg shadow-primary/20'
                        : 'border-border bg-surface/80 text-text-muted hover:border-primary/40 hover:text-primary'
                    }`}
                  >
                    <span>{stage.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                      active ? 'bg-white/18 text-white' : 'bg-surface-container-low text-text-muted'
                    }`}>
                      {stageCounts[stage.value] || 0}
                    </span>
                  </button>
                )
              })}
            </div>

            <Button type="button" variant="outline" onClick={fetchTutors} className="xl:ml-auto">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="qs-panel overflow-hidden rounded-lg">
            <div className="border-b border-border/80 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase text-text-muted">Queue</p>
                  <h2 className="mt-1 text-xl font-black text-text-main">{filteredTutors.length} applications</h2>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                  <Users className="h-5 w-5" />
                </div>
              </div>
            </div>

            <div className="max-h-[calc(100vh-318px)] min-h-[420px] overflow-y-auto p-2">
              {filteredTutors.length > 0 ? (
                <div className="space-y-2">
                  {filteredTutors.map(tutor => {
                    const stageMeta = getStageMeta(tutor.verification_stage)
                    const tutorName = getTutorName(tutor)
                    const tutorEmail = getTutorEmail(tutor)
                    const degreeCount = tutor._degreeCount ?? tutor.degrees?.length ?? 0
                    const docCount = tutor._docCount ?? getCurrentTutorDocuments(tutor.documents || []).length
                    const active = selectedTutor?.user_email === tutor.user_email
                    const opening = detailLoading === tutor.user_email

                    return (
                      <button
                        key={tutor.user_email}
                        type="button"
                        onClick={() => fetchTutorDetail(tutor.user_email)}
                        className={`w-full rounded-lg border p-3 text-left transition ${
                          active
                            ? 'border-primary bg-primary-subtle shadow-lg shadow-primary/10'
                            : 'border-transparent bg-surface/68 hover:border-border hover:bg-surface'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-black ${
                            active ? 'bg-primary text-white' : 'bg-surface-container-low text-primary'
                          }`}>
                            {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : getInitials(tutorName)}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h3 className="truncate text-sm font-black text-text-main">{tutorName}</h3>
                                <p className="mt-0.5 truncate text-xs text-text-muted">{tutorEmail}</p>
                              </div>
                              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-black ${stageMeta.badge}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${stageMeta.dot}`} />
                                {stageMeta.label}
                              </span>
                            </div>

                            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] font-bold text-text-muted">
                              <span className="rounded-md bg-surface-container-low px-2 py-1">{tutor.subjects?.length || 0} subjects</span>
                              <span className="rounded-md bg-surface-container-low px-2 py-1">{degreeCount} degrees</span>
                              <span className="rounded-md bg-surface-container-low px-2 py-1">{docCount} docs</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-surface-container-low text-text-muted">
                    <Search className="h-6 w-6" />
                  </div>
                  <p className="font-black text-text-main">No applications found</p>