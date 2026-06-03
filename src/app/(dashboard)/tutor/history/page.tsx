"use client"

import { CalendarClock, CheckCircle2, Clock3, History, Star, Users } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'

export default function TutorHistoryPage() {
  const { user } = useAuthStore()
  const profile = user?.tutorProfile
  const totalSessions = profile?.totalSessions || 0
  const totalEarnings = profile?.totalEarnings || 0
  const rating = profile?.rating

  const stats = [
    { label: 'Sessions', value: totalSessions, icon: Users, tone: 'bg-primary-subtle text-primary' },
    { label: 'Earnings', value: `Rs. ${totalEarnings.toLocaleString()}`, icon: CheckCircle2, tone: 'bg-success-subtle text-success' },
    { label: 'Rating', value: rating ? `${rating}/5` : 'New', icon: Star, tone: 'bg-secondary-subtle text-secondary' },
  ]

  return (
    <div className="p-4 pb-20 md:p-8 qs-stagger">
      <div className="mb-8">
        <div className="qs-kicker rounded-full px-3 py-1.5">
          <History className="h-4 w-4" />
          Tutor history
        </div>
        <h1 className="mt-4 text-4xl font-black text-text-main">Teaching history</h1>
        <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-text-muted">
          A clean record of completed tutoring work, performance, and past activity.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {stats.map((item) => (
          <article key={item.label} className="qs-panel rounded-lg p-5">
            <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-lg ${item.tone}`}>
              <item.icon className="h-6 w-6" />
            </div>
            <p className="text-sm font-black uppercase text-text-muted">{item.label}</p>
            <p className="mt-2 text-3xl font-black text-text-main">{item.value}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="qs-panel rounded-lg p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-text-main">Recent activity</h2>
              <p className="mt-1 text-sm font-semibold text-text-muted">Completed sessions will appear here.</p>
            </div>
            <span className="rounded-full border border-border bg-surface-container-low px-3 py-1 text-xs font-black text-text-muted">
              {totalSessions} records
            </span>
          </div>

          {totalSessions > 0 ? (
            <div className="space-y-3">
              <HistoryRow title="Tutoring session completed" subtitle="Session record synced from your workspace." />
              <HistoryRow title="Student problem accepted" subtitle="A student selected your bid for help." />
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-surface-container-low p-8 text-center">
              <CalendarClock className="mx-auto h-11 w-11 text-text-muted" />
              <h3 className="mt-4 text-lg font-black text-text-main">No history yet</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-text-muted">
                Once you complete sessions or solve student problems, your history will show here.
              </p>
            </div>
          )}
        </div>

        <aside className="qs-panel rounded-lg p-5 md:p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent-subtle text-accent">
            <Clock3 className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-xl font-black text-text-main">Timeline status</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-text-muted">
            History is connected with tutor sessions. New completed sessions will be shown in this page as the activity grows.
          </p>
          <div className="mt-5 rounded-lg border border-success/20 bg-success-subtle p-4 text-sm font-bold text-success">
            Profile status: {profile?.verificationStatus === 'verified' ? 'Verified tutor' : 'Verification pending'}
          </div>
        </aside>
      </section>
    </div>
  )
}

function HistoryRow({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4">
      <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-primary-subtle text-primary">
        <CheckCircle2 className="h-5 w-5" />
      </span>
      <div>
        <p className="font-black text-text-main">{title}</p>
        <p className="mt-1 text-sm font-semibold text-text-muted">{subtitle}</p>
      </div>
    </div>
  )
}
