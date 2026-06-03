"use client"

import { Award, BookOpen, CheckCircle2, GraduationCap, Layers, Sparkles } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'

export default function TutorSubjectsPage() {
  const { user } = useAuthStore()
  const profile = user?.tutorProfile
  const subjects = profile?.subjects || []
  const displayName = (user?.fullname || user?.email || 'Tutor').split(' ')[0].split('@')[0]

  return (
    <div className="p-4 pb-20 md:p-8 qs-stagger">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="qs-kicker rounded-full px-3 py-1.5">
            <BookOpen className="h-4 w-4" />
            My subjects
          </div>
          <h1 className="mt-4 text-4xl font-black text-text-main">Teaching subjects</h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-text-muted">
            Subjects linked with {displayName}'s verified tutor profile.
          </p>
        </div>

        <div className="grid min-w-[260px] grid-cols-2 gap-3">
          <SummaryCard label="Subjects" value={subjects.length} icon={Layers} />
          <SummaryCard label="Status" value={profile?.verificationStatus === 'verified' ? 'Verified' : 'Pending'} icon={CheckCircle2} />
        </div>
      </div>

      <section className="overflow-hidden rounded-lg bg-hero-gradient surface-grid p-6 text-white shadow-2xl shadow-primary/10 md:p-8">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-black uppercase">
            <Sparkles className="h-4 w-4" />
            Tutor profile
          </div>
          <h2 className="mt-5 text-3xl font-black">Your expertise, ready for students</h2>
          <p className="mt-3 text-sm font-semibold leading-6 text-white/75">
            These subjects decide which student problems and tutoring opportunities appear in your workspace.
          </p>
        </div>
      </section>

      <section className="mt-6 qs-panel rounded-lg p-5 md:p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-subtle text-primary">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-text-main">Subject list</h2>
            <p className="text-sm font-semibold text-text-muted">{subjects.length} selected</p>
          </div>
        </div>

        {subjects.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {subjects.map((subject, index) => (
              <article key={`${subject}-${index}`} className="rounded-lg border border-border bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="mb-4 flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary-subtle text-secondary-dark">
                    <BookOpen className="h-5 w-5" />
                  </span>
                  <span className="rounded-full border border-success/20 bg-success-subtle px-3 py-1 text-xs font-black text-success">
                    Active
                  </span>
                </div>
                <h3 className="text-lg font-black text-text-main">{subject}</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-text-muted">
                  Available for student questions and subject test matching.
                </p>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-surface-container-low p-8 text-center">
            <Award className="mx-auto h-10 w-10 text-text-muted" />
            <h3 className="mt-4 text-lg font-black text-text-main">No subjects added yet</h3>
            <p className="mt-2 text-sm font-semibold text-text-muted">Complete your tutor profile to add teaching subjects.</p>
          </div>
        )}
      </section>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string | number
  icon: typeof BookOpen
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <Icon className="mb-3 h-5 w-5 text-primary" />
      <p className="text-xs font-black uppercase text-text-muted">{label}</p>
      <p className="mt-1 truncate text-xl font-black text-text-main">{value}</p>
    </div>
  )
}
