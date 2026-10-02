"use client"
import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, Clock, RefreshCw, ReceiptText } from 'lucide-react'
import { RatingStars } from '@/components/rating/rating-stars'
import { StudentReview } from '@/components/student-review'
import { ReviewModal } from '@/components/rating/review-modal'
type Payment = { problem_id: string; amount: number; rating: number; feedback: string; status: string; release_at: string; review_submitted_at: string | null; hold_reason: string | null; resolution_note: string | null }
export function SessionPayments({ student = false }: { student?: boolean }) {
  const [payments, setPayments] = useState<Payment[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState('all')
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const pending = useRef<AbortController | null>(null)
  const load = useCallback(async () => {
    pending.current?.abort()
    const controller = new AbortController()
    pending.current = controller
    setLoading(true)
    try {
      const res = await fetch(`/api/sessions/payments?page=${page}&status=${status}`, { cache: 'no-store', signal: controller.signal })
      if (!res.ok) throw new Error()
      const body = await res.json()
      if (!controller.signal.aborted) { setPayments(body.payments); setCount(body.count); setError('') }
    } catch { if (!controller.signal.aborted) { setPayments([]); setError('Could not load session payments. Please refresh.') } }
    finally { if (!controller.signal.aborted) setLoading(false) }
  }, [page, status])
  useEffect(() => { const first = setTimeout(load, 0); const timer = setInterval(load, 30000); return () => { clearTimeout(first); clearInterval(timer); pending.current?.abort() } }, [load])
  const dispute = async (payment: Payment) => {
    const reason = window.prompt('Describe the issue with this session:')?.trim()
    if (!reason) return
    setBusy(true)
    try {
      const res = await fetch('/api/sessions/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ problemId: payment.problem_id, rating: payment.rating, dispute: reason }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMessage('Dispute saved. Tutor payment is on hold.')
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save dispute.') }
    finally { setBusy(false) }
  }
  const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold transition hover:bg-surface-hover disabled:opacity-40'
  const tones: Record<string, string> = { released: 'bg-success-subtle text-emerald-800', pending: 'bg-amber-50 text-amber-800', held: 'bg-accent-subtle text-orange-800', refunded: 'bg-primary-subtle text-primary-dark' }
  return <section className="mb-6 space-y-5 rounded-lg border border-border bg-surface p-4 shadow-sm md:p-6">
    <div className="flex items-center gap-3"><span className="rounded-lg bg-primary-subtle p-3 text-primary"><ReceiptText className="h-5 w-5" /></span><div><h2 className="text-xl font-black">Session payments & reviews</h2><p className="mt-1 text-sm text-text-muted">Your sessions, feedback and payment updates in one place.</p></div></div>
    <p className="rounded-lg bg-primary-subtle/50 p-4 text-xs leading-relaxed text-text-muted">Payments release after the 20-minute dispute window from the session end, even without a review. Disputes, low ratings and sessions that never started stay on hold for admin review. Available recordings are kept for held payments until admin resolution. Refunds return to the student wallet.</p>
    {message && <p role="status" className="rounded-lg bg-primary-subtle p-4 text-sm">{message}</p>}
    <div className="flex flex-wrap items-center gap-3 border-y border-border py-4">
      <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">Payment status <select value={status} className="rounded-lg border border-border bg-surface p-2.5 capitalize" onChange={event => { pending.current?.abort(); setPayments([]); setLoading(true); setStatus(event.target.value); setPage(0) }}>
        {['all', 'pending', 'held', 'released', 'refunded'].map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <button className={buttonClass} onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Refresh</button>
      {!error && <span className="ml-auto rounded-full bg-surface-hover px-3 py-1.5 text-xs font-bold text-text-muted">{count} payments</span>}
    </div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {loading && <div role="status" className="space-y-3"><span className="sr-only">Loading payments...</span>{[1, 2, 3].map(item => <div key={item} className="h-28 animate-pulse rounded-lg bg-surface-hover" />)}</div>}
    {!loading && payments.map(payment => <article key={payment.problem_id} className="rounded-lg border border-border p-4 transition hover:border-primary/40 hover:shadow-sm md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3"><span className="rounded-lg bg-primary-subtle p-3 text-primary"><BookOpen className="h-5 w-5" /></span><div className="min-w-0"><h3 className="font-bold">{student ? "Learning session" : "Teaching session"}</h3><p className="mt-1 break-all text-xs text-text-muted">Reference #{payment.problem_id.slice(0, 8)}</p></div></div>
        <div className="sm:text-right"><p className="text-xl font-black">Rs. {Number(payment.amount).toLocaleString()}</p><span className={'mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ' + (tones[payment.status] || 'bg-surface-hover text-text-muted')}>{payment.status === 'held' ? 'On hold' : payment.status}</span></div>
      </div>
      <div className="mt-4 rounded-lg bg-surface-container-low p-4">
        <div className="flex flex-wrap items-center gap-3"><span className="text-xs font-semibold text-text-muted">{student ? 'Your rating of tutor' : 'Rating received from student'}</span><RatingStars value={payment.rating} /><span className="text-xs font-bold">{payment.rating > 0 ? payment.rating + '/5' : 'Awaiting review'}</span></div>
        {payment.feedback && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{payment.feedback}</p>}
      </div>
      {payment.status === 'pending' && <p className="mt-3 flex items-center gap-2 text-xs text-text-muted"><Clock className="h-4 w-4 shrink-0" />Eligible for release {new Date(payment.release_at).toLocaleString()}</p>}
      {payment.status === 'held' && payment.hold_reason && <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><span className="font-bold">Hold reason: </span>{payment.hold_reason}</p>}
      {payment.resolution_note && <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-primary-subtle p-3 text-sm"><span className="font-bold">Resolution: </span>{payment.resolution_note}</p>}
      {!student && <StudentReview problemId={payment.problem_id} />}
      {student && <div className="mt-3 flex flex-wrap gap-3">{payment.status === 'pending' && <button disabled={busy} onClick={() => dispute(payment)} className={buttonClass + ' text-red-700'}>Open dispute</button>}{!payment.review_submitted_at && <button onClick={() => setReviewId(payment.problem_id)} className={buttonClass + ' text-primary'}>Leave a review</button>}</div>}
    </article>)}
    {!loading && !error && !payments.length && <div className="rounded-lg border border-dashed border-border px-5 py-12 text-center"><ReceiptText className="mx-auto mb-4 h-10 w-10 text-primary/50" /><h3 className="font-bold">No session payments here yet</h3><p className="mx-auto mt-2 max-w-sm text-sm text-text-muted">Completed session payments will appear here. Try another status if you are looking for a specific payment.</p></div>}
    <div className="flex items-center justify-between gap-2 border-t border-border pt-4 text-sm">
      <button className={buttonClass} disabled={loading || page === 0} onClick={() => { pending.current?.abort(); setPayments([]); setLoading(true); setPage(value => value - 1) }}><ChevronLeft className="h-4 w-4" />Previous</button>
      <span>Page {page + 1}</span>
      <button className={buttonClass} disabled={loading || !!error || (page + 1) * 25 >= count} onClick={() => { pending.current?.abort(); setPayments([]); setLoading(true); setPage(value => value + 1) }}>Next<ChevronRight className="h-4 w-4" /></button>
    </div>
    {reviewId && <ReviewModal key={reviewId} isOpen fromHistory onClose={() => { setReviewId(null); void load() }} tutorName="your tutor" problemId={reviewId} />}
  </section>
}
