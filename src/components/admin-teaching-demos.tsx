"use client"

import { useCallback, useEffect, useState } from 'react'
import { Check, RefreshCw, Undo2, Mail, Video, Clock3, AlertCircle, ListChecks } from 'lucide-react'
import { DEMO_CRITERIA, type DemoScores, type TeachingDemo } from '@/lib/teaching-demos'
import { TeachingDemoPlayer } from '@/components/teaching-demo-player'

export function AdminTeachingDemos({ tutorEmail }: { tutorEmail?: string }) {
  const [rows, setRows] = useState<(TeachingDemo & { tutor_email: string })[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch(`/api/admin/demos${tutorEmail ? `?tutorEmail=${encodeURIComponent(tutorEmail)}` : ''}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setRows(data.demos)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load demos') }
    finally { setLoading(false) }
  }, [tutorEmail])
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer) }, [load])
  return <section className="min-w-0 space-y-5 py-5">
    <div className="flex flex-col gap-4 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.07] via-surface to-secondary/[0.07] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex items-center gap-4"><div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20"><Video className="size-6" /></div><div><h2 className="text-xl font-bold tracking-tight text-text-main">Teaching demo reviews</h2><p className="mt-1 text-sm text-text-muted">Watch each lesson, score the teaching, then record your decision.</p></div></div>
      <div className="flex items-center gap-3"><span className="rounded-full border border-border bg-surface px-3 py-2 text-xs font-bold text-text-muted">{rows.filter(row => row.status === 'pending').length} pending</span><button type="button" title="Refresh reviews" aria-label="Refresh reviews" disabled={loading} onClick={() => void load()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text-main shadow-sm transition hover:border-primary/40 hover:text-primary disabled:opacity-50"><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button></div>
    </div>
    {loading && <p role="status" className="rounded-xl border border-border bg-surface p-4 text-sm text-text-muted">Loading demo reviews…</p>}
    {error && <p role="alert" className="rounded-xl border border-error/20 bg-red-50 p-4 text-sm text-error">{error}</p>}
    {!loading && !error && !rows.length && <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center"><span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-success-subtle text-success"><Check className="size-6" /></span><h3 className="mt-3 font-bold text-text-main">All caught up</h3><p className="mt-1 text-sm text-text-muted">There are no teaching demos waiting for review.</p></div>}
    <div className="grid gap-5">{rows.map(row => <DemoReview key={row.id} demo={row} onSaved={load} />)}</div>
  </section>
}

function DemoReview({ demo, onSaved }: { demo: TeachingDemo & { tutor_email: string }; onSaved: () => Promise<void> }) {
  const [scores, setScores] = useState<DemoScores>({ accuracy: 0, clarity: 0, example: 0, communication: 0 })
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const total = Object.values(scores).reduce((sum, score) => sum + score, 0)
  async function review(action: 'approve' | 'reject' | 'resend_email') {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/admin/demos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: demo.id, action, scores, feedback }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      await onSaved()
      if (data.emailStatus === 'failed') setError('Review saved, but the email was not sent. Retry the email below.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Review failed') }
    finally { setBusy(false) }
  }
  return <article className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition hover:border-primary/25 hover:shadow-md">
    <div className="flex flex-col gap-4 border-b border-border bg-background/70 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
      <div className="flex min-w-0 items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Video className="size-5" /></span><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.12em] text-text-muted">{demo.subject}</p><h3 className="mt-1 break-words text-lg font-bold text-text-main">{demo.topic}</h3><p className="mt-1 break-all text-sm text-text-muted">{demo.tutor_email}<span className="mx-2 text-border">•</span>{demo.class_level}</p></div></div>
      <span className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold capitalize ${demo.status === 'pending' ? 'bg-amber-500/10 text-amber-700' : demo.status === 'approved' ? 'bg-success-subtle text-success' : 'bg-primary/10 text-primary'}`}><Clock3 className="size-3.5" />{demo.status === 'rejected' ? 'Changes requested' : demo.status}</span>
    </div>
    <div className="space-y-5 p-5 sm:p-6">
      <div className="rounded-xl border border-border bg-background p-4"><TeachingDemoPlayer id={demo.id} /></div>
      {demo.feedback && <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4"><p className="text-xs font-bold uppercase tracking-wide text-amber-800">Previous review feedback</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-text-main">{demo.feedback}</p></div>}
      {demo.status === 'rejected' && <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm"><p className="font-semibold text-text-main">Review email</p><p className="mt-1 text-text-muted">{demo.review_email_status === 'sent' ? 'Sent to tutor' : demo.review_email_status === 'sending' ? 'Sending; retry after five minutes if delivery stalls' : 'Not sent'}</p></div>
        {demo.review_email_status !== 'sent' && <button type="button" disabled={busy} onClick={() => void review('resend_email')} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text-main transition hover:border-primary/40 hover:text-primary disabled:opacity-50"><Mail className="size-4" />Retry email</button>}
      </div>}
      {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-error/20 bg-red-50 p-3 text-sm text-error"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</p>}
    {demo.status === 'pending' && <>
      <div className="rounded-xl border border-border bg-background p-4 sm:p-5"><div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><ListChecks className="size-4 text-primary" /><h4 className="font-bold text-text-main">Teaching scorecard</h4></div><span className={`w-fit rounded-full px-3 py-1 text-sm font-bold ${total >= 14 && scores.accuracy >= 4 ? 'bg-success-subtle text-success' : 'bg-primary/10 text-primary'}`}>Score {total}/20</span></div>
        <div className="grid gap-4 sm:grid-cols-2">{DEMO_CRITERIA.map(key => <label key={key} className="grid gap-1.5 text-sm font-semibold capitalize text-text-main">{key}<select aria-label={`${demo.subject} ${key} score`} value={scores[key]} disabled={busy} onChange={e => setScores(s => ({ ...s, [key]: Number(e.target.value) }))} className="min-h-11 rounded-xl border border-border bg-surface px-3 py-2 font-normal outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-60"><option value={0}>Choose score</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} / 5</option>)}</select></label>)}</div>
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-primary/[0.06] p-3 text-xs leading-5 text-text-muted"><AlertCircle className="mt-0.5 size-4 shrink-0 text-primary" />Approval requires at least 14/20 overall and 4/5 for accuracy.</p>
      </div>
      <label className="grid gap-1.5 text-sm font-semibold text-text-main">Review feedback<textarea maxLength={2000} rows={3} value={feedback} disabled={busy} onChange={e => setFeedback(e.target.value)} placeholder="Share clear, actionable feedback with the tutor…" className="w-full rounded-xl border border-border bg-surface px-3.5 py-3 font-normal outline-none transition placeholder:text-text-muted/70 focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-60" /></label>
      <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
        <button type="button" disabled={busy || feedback.trim().length < 10} onClick={() => void review('reject')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-bold text-text-main transition hover:border-amber-500/40 hover:bg-amber-500/[0.05] disabled:cursor-not-allowed disabled:opacity-50"><Undo2 className="size-4" />Request changes</button>
        <button type="button" disabled={busy || total < 14 || scores.accuracy < 4 || Object.values(scores).some(v => v === 0)} onClick={() => void review('approve')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/15 transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"><Check className="size-4" />Approve demo</button>
      </div>
    </>}
    </div>
  </article>
}
