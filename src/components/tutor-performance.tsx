"use client"

import { useEffect, useState } from 'react'
import type { TutorPerformance as Performance } from '@/lib/tutor-performance'
import { TutorConduct } from '@/components/tutor-conduct'

export function TutorPerformance({ tutorEmail }: { tutorEmail?: string }) {
  const [result, setResult] = useState<{ email?: string; data: Performance } | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch('/api/tutor/performance' + (tutorEmail ? `?tutorEmail=${encodeURIComponent(tutorEmail)}` : ''), { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error()
        const body = await response.json()
        if (!controller.signal.aborted) { setResult({ email: tutorEmail, data: body.performance }); setError('') }
      } catch {
        if (!controller.signal.aborted) setError('Performance could not be refreshed. Please retry.')
      }
    }
    void load()
    const timer = setInterval(load, 30000)
    window.addEventListener('focus', load)
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('focus', load) }
  }, [tutorEmail, revision])
  const data = result?.email === tutorEmail ? result?.data : null
  return <section className="mb-6 space-y-3 rounded-lg border border-border bg-surface p-5">
    <TutorConduct key={tutorEmail || 'self'} tutorEmail={tutorEmail} />
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-xl font-bold">Session performance</h2>
      <button className="text-sm font-bold text-primary" onClick={() => setRevision(value => value + 1)}>Refresh</button>
    </div>
    <p className="text-sm text-text-muted">Latest 20 session payment records. Updates every 30 seconds and when you return to this page.</p>
    {error && <p role="alert">{error} {data && 'Showing the last successful evaluation.'}</p>}
    {!data && !error && <p role="status">Loading performance…</p>}
    {data && <>
      <p className="font-bold">{data.status}</p>
      <p>{data.average === null ? 'No ratings yet' : `${data.average}/5 average`} · {data.reviews} rated / {data.sessions} sessions · {data.lowRatings} low ratings (1–3 stars)</p>
      <p className="text-sm">Payments: {data.released} released · {data.refunded} refunded · {data.pending} pending · {data.held} held. Open disputes: {data.openDisputes}.</p>
      {data.reasons.map(reason => <p key={reason} className="text-sm">{reason}</p>)}
      <p className="text-sm text-text-muted">Evaluation needs 5 ratings, or 5 resolved payments for refund review. Below 3.5 stars or at least 30% refunds needs attention. Excellent needs 4.5+ stars, no refunds and no open disputes; otherwise good standing. Unrated sessions do not lower the average. Disputes and refunds require context and do not prove tutor fault. This summary does not change account access.</p>
      <h3 className="font-semibold">Recent student feedback</h3>
      {!data.feedback.length && <p className="text-sm">No written feedback yet.</p>}
      {data.feedback.map(item => <blockquote key={item.problemId} className="whitespace-pre-wrap break-words border-l-2 border-primary pl-3 text-sm">{item.rating ? `${item.rating}/5 — ` : ''}{item.text}</blockquote>)}
    </>}
  </section>
}
