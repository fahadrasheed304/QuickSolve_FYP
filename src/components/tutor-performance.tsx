"use client"

import { useEffect, useState } from 'react'
import type { TutorPerformance as Performance } from '@/lib/tutor-performance'
import { Award, MessageSquare, RefreshCw, Star } from 'lucide-react'
import { RatingStars } from '@/components/rating/rating-stars'
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
  return <section className="mb-8 space-y-4">
    <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-5 md:px-6">
        <div><p className="mb-1 text-xs font-bold uppercase tracking-widest text-primary">Your teaching impact</p><h2 className="text-xl font-black">Ratings & performance</h2></div>
        <button className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-bold text-text-muted hover:bg-surface-hover" onClick={() => setRevision(value => value + 1)}><RefreshCw className="h-4 w-4" />Refresh</button>
      </div>
      {error && <p role="alert" className="m-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{error} {data && 'Showing the last successful evaluation.'}</p>}
      {!data && !error && <div role="status" className="grid gap-4 p-6 md:grid-cols-3"><span className="sr-only">Loading performance...</span>{[1, 2, 3].map(item => <div key={item} className="h-36 animate-pulse rounded-lg bg-surface-hover" />)}</div>}
      {data && <>
        <div className="grid gap-6 p-5 md:p-6 lg:grid-cols-[260px_1fr]">
          <div className="rounded-lg bg-hero-gradient p-6 text-white">
            <div className="mb-6 flex items-center gap-2 text-sm font-semibold"><Star className="h-4 w-4 text-amber-300" />Student rating</div>
            <div className="flex items-baseline gap-2"><span className="text-5xl font-black">{data.average === null ? '--' : data.average.toFixed(1)}</span><span className="text-white/70">/ 5</span></div>
            <div className="mt-3"><RatingStars value={data.average} /></div>
            <p className="mt-3 text-sm text-white/80">{data.reviews} student reviews</p>
            <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-bold"><Award className="h-4 w-4" />{data.status}</span>
          </div>
          <div className="min-w-0 space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[{ label: 'Recent sessions', value: data.sessions }, { label: 'Student reviews', value: data.reviews }, { label: 'Low ratings (1-3)', value: data.lowRatings }].map(item => <div key={item.label} className="rounded-lg border border-border bg-surface-container-low p-5"><p className="text-3xl font-black text-primary">{item.value}</p><p className="mt-2 text-xs font-semibold text-text-muted">{item.label}</p></div>)}
            </div>
            <div><h3 className="mb-3 text-sm font-bold">Payment overview</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[{ label: 'Released', value: data.released, tone: 'bg-success-subtle text-emerald-800' }, { label: 'Pending', value: data.pending, tone: 'bg-amber-50 text-amber-800' }, { label: 'Held', value: data.held, tone: 'bg-accent-subtle text-orange-800' }, { label: 'Refunded', value: data.refunded, tone: 'bg-primary-subtle text-primary-dark' }].map(item => <div key={item.label} className={'rounded-lg px-3 py-3 text-xs font-bold ' + item.tone}>{item.label}<p className="mt-1 text-xl">{item.value}</p></div>)}</div><p className="mt-3 text-xs text-text-muted">{data.openDisputes} open disputes / Latest {data.sessions} of up to 20 session payments</p></div>
            {data.reasons.map(reason => <p key={reason} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{reason}</p>)}
          </div>
        </div>
        <div className="border-t border-border bg-surface-container-low p-5 md:p-6">
          <h3 className="mb-4 flex items-center gap-2 font-bold"><MessageSquare className="h-4 w-4 text-primary" />Recent student feedback</h3>
          {!data.feedback.length ? <div className="rounded-lg border border-dashed border-border p-6 text-center"><MessageSquare className="mx-auto mb-3 h-7 w-7 text-primary/60" /><p className="font-semibold">No written feedback yet</p><p className="mt-1 text-sm text-text-muted">Student comments will appear here after your sessions.</p></div> : <div className="grid gap-3 md:grid-cols-2">{data.feedback.map(item => <blockquote key={item.problemId} className="rounded-lg border border-border bg-surface p-4"><RatingStars value={item.rating} /><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{item.text}</p><footer className="mt-3 text-xs text-text-muted">Student feedback</footer></blockquote>)}</div>}
          <details className="mt-4 text-xs leading-relaxed text-text-muted"><summary className="w-fit py-2 font-semibold">How performance is evaluated</summary><p className="mt-2 max-w-3xl">Based on the latest 20 session payment records; refreshed every 30 seconds and when you return. Evaluation needs 5 ratings, or 5 resolved payments for refund review. Below 3.5 stars or at least 30% refunds needs attention. Excellent needs 4.5+ stars, no refunds and no open disputes; otherwise good standing. Unrated sessions do not lower the average. Disputes and refunds require context and do not prove tutor fault. This summary does not change account access.</p></details>
        </div>
      </>}
    </div>
    <TutorConduct key={tutorEmail || 'self'} tutorEmail={tutorEmail} />
  </section>
}
