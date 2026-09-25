"use client"
import { useEffect, useState } from 'react'
import { ReviewModal } from '@/components/rating/review-modal'
type Payment = { problem_id: string; amount: number; rating: number; feedback: string; status: string; release_at: string; review_submitted_at: string | null; hold_reason: string | null; resolution_note: string | null }
export function SessionPayments({ student = false }: { student?: boolean }) {
  const [payments, setPayments] = useState<Payment[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const load = async () => {
    try {
      const res = await fetch('/api/sessions/payments', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      setPayments((await res.json()).payments)
    } catch { setMessage('Could not load session payments. Please refresh.') }
  }
  useEffect(() => { const first = setTimeout(load, 0); const timer = setInterval(load, 10000); return () => { clearTimeout(first); clearInterval(timer) } }, [])
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
  return <section className="mb-6 rounded-lg border border-border bg-surface p-4">
    <h2 className="text-lg font-bold">Session payments & reviews</h2>
    <p className="text-sm text-text-muted">Payments release after the 5-minute dispute window, even without a review. Disputes, low ratings and sessions that never started stay on hold for admin review. Refunds return to the student wallet.</p>
    {message && <p role="status">{message}</p>}
    {payments.map(payment => <div key={payment.problem_id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <p>Rs. {payment.amount} — {payment.status}{payment.status === 'pending' && ` · Eligible ${new Date(payment.release_at).toLocaleTimeString()}`}</p>
        <p className="text-sm font-bold text-text-main">
          {student ? 'Your rating: ' : 'Student rating: '}{payment.rating > 0 ? `${payment.rating}/5 stars` : 'No star rating submitted'}
        </p>
        {payment.feedback && <p className="whitespace-pre-wrap break-words text-sm text-text-muted">{payment.feedback}</p>}
        {payment.status === 'held' && payment.hold_reason && <p className="text-sm">Hold reason: {payment.hold_reason}</p>}
        {payment.resolution_note && <p className="whitespace-pre-wrap text-sm">Resolution: {payment.resolution_note}</p>}
      </div>
      {student && payment.status === 'pending' && <button disabled={busy} onClick={() => dispute(payment)} className="text-red-600 underline">Open dispute</button>}
      {student && !payment.review_submitted_at && <button onClick={() => setReviewId(payment.problem_id)} className="text-primary underline">Leave a review</button>}
    </div>)}
    {!payments.length && <p className="mt-3 text-sm">No session payments yet.</p>}
    {reviewId && <ReviewModal key={reviewId} isOpen fromHistory onClose={() => { setReviewId(null); void load() }} tutorName="your tutor" problemId={reviewId} />}
  </section>
}
