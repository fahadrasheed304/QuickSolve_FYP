"use client"

import { useCallback, useEffect, useState } from 'react'
import { Check, RefreshCw, Undo2, Mail } from 'lucide-react'
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
  return <section className="min-w-0 py-5">
    <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Teaching demo reviews</h2><button type="button" title="Refresh reviews" aria-label="Refresh reviews" disabled={loading} onClick={() => void load()} className="p-2"><RefreshCw className="h-4 w-4" /></button></div>
    {loading && <p role="status">Loading reviews...</p>}
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {!loading && !error && !rows.length && <p className="mt-3 text-sm text-text-muted">No demos to review.</p>}
    <div className="divide-y divide-border">{rows.map(row => <DemoReview key={row.id} demo={row} onSaved={load} />)}</div>
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
  return <article className="space-y-3 py-4">
    <div><h3 className="break-words font-semibold">{demo.subject}: {demo.topic}</h3><p className="break-words text-sm text-text-muted">{demo.tutor_email} / {demo.class_level}</p><p className="text-sm capitalize">{demo.status === 'rejected' ? 'Changes requested' : demo.status}</p></div>
    <TeachingDemoPlayer id={demo.id} />
    {demo.feedback && <p className="whitespace-pre-wrap break-words text-sm">{demo.feedback}</p>}
    {demo.status === 'rejected' && <div className="space-y-2 text-sm">
      <p>Email: {demo.review_email_status === 'sent' ? 'Sent to tutor' : demo.review_email_status === 'sending' ? 'Sending; retry after five minutes if delivery stalls' : 'Not sent'}</p>
      {demo.review_email_status !== 'sent' && <button type="button" disabled={busy} onClick={() => void review('resend_email')} className="inline-flex items-center gap-2 rounded border border-border px-3 py-2"><Mail className="h-4 w-4" />Retry email</button>}
    </div>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {demo.status === 'pending' && <>
      <div className="grid grid-cols-2 gap-3">{DEMO_CRITERIA.map(key => <label key={key} className="grid gap-1 text-sm capitalize">{key}<select aria-label={`${demo.subject} ${key} score`} value={scores[key]} disabled={busy} onChange={e => setScores(s => ({ ...s, [key]: Number(e.target.value) }))} className="rounded border border-border bg-surface p-2"><option value={0}>Not scored</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} / 5</option>)}</select></label>)}</div>
      <p className="text-sm text-text-muted">Score: {total}/20. Approval: 14/20 minimum, accuracy 4/5 minimum.</p>
      <label className="grid gap-1 text-sm">Review feedback<textarea maxLength={2000} rows={3} value={feedback} disabled={busy} onChange={e => setFeedback(e.target.value)} className="w-full rounded border border-border bg-surface p-2" /></label>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy || total < 14 || scores.accuracy < 4 || Object.values(scores).some(v => v === 0)} onClick={() => void review('approve')} className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Check className="h-4 w-4" />Approve demo</button>
        <button type="button" disabled={busy || feedback.trim().length < 10} onClick={() => void review('reject')} className="inline-flex items-center gap-2 rounded border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"><Undo2 className="h-4 w-4" />Request changes</button>
      </div>
    </>}
  </article>
}
