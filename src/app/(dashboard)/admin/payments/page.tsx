"use client"

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

type Payment = {
  problem_id: string; student_email: string; tutor_email: string; amount: number
  rating: number; feedback: string; dispute: string | null; hold_reason: string | null
  status: string; release_at: string; resolved_by: string | null; resolution_note: string | null; resolved_at: string | null
  problem: { subject: string; class: string; session_started_at: string | null; session_ended_at: string | null; extension_minutes: number; bid: { duration_min: number } | null } | null
}
const timestamp = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded'

export default function AdminPaymentsPage() {
  const [status, setStatus] = useState('held')
  const [page, setPage] = useState(0)
  const [payments, setPayments] = useState<Payment[]>([])
  const [count, setCount] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [decision, setDecision] = useState<{ payment: Payment; action: 'release' | 'refund' } | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const refresh = useCallback(() => setRevision(value => value + 1), [])

  useEffect(() => {
    const abort = new AbortController()
    const load = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/admin/payments?status=${status}&page=${page}`, { cache: 'no-store', signal: abort.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        if (!abort.signal.aborted) { setPayments(data.payments); setCount(data.count); setError('') }
      } catch (error) {
        if (!abort.signal.aborted) { setPayments([]); setError(error instanceof Error ? error.message : 'Could not load payments') }
      } finally { if (!abort.signal.aborted) setLoading(false) }
    }
    void load()
    return () => abort.abort()
  }, [status, page, revision])
  useEffect(() => {
    const timer = setInterval(refresh, 30000)
    return () => clearInterval(timer)
  }, [refresh])

  const resolve = async () => {
    if (!decision || saving) return
    setSaving(true)
    try {
      const response = await fetch('/api/admin/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemId: decision.payment.problem_id, action: decision.action, note }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setDecision(null); setNote(''); refresh()
    } catch (error) { setError(error instanceof Error ? error.message : 'Resolution failed') }
    finally { setSaving(false) }
  }

  return <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
    <Link href="/admin/verifications" className="font-bold text-primary">← Tutor verifications</Link>
    <h1 className="text-3xl font-black">Session payments & disputes</h1>
    <p className="text-text-muted">Completed sessions enter a 5-minute dispute window without requiring a review. Low ratings, disputes and sessions that never started require a decision here. Refunds return the full amount to the student wallet.</p>
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="payment-status">Status</label>
      <select id="payment-status" value={status} disabled={saving} onChange={event => { setStatus(event.target.value); setPage(0); setDecision(null) }} className="rounded border border-border bg-surface p-2">
        {['held', 'pending', 'released', 'refunded'].map(value => <option key={value} value={value}>{value}</option>)}
      </select>
      <Button onClick={refresh} disabled={loading}>Refresh</Button>
      <span>{count} payments</span>
    </div>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {decision && <section aria-label="Confirm payment decision" className="space-y-3 rounded-lg border border-amber-500 bg-surface p-5">
      <h2 className="font-bold">{decision.action === 'refund' ? 'Refund student wallet' : 'Release to tutor'}: Rs. {Number(decision.payment.amount).toLocaleString()}</h2>
      <p className="break-all text-sm">Session {decision.payment.problem_id} · {decision.action === 'refund' ? decision.payment.student_email : decision.payment.tutor_email}</p>
      <label className="block" htmlFor="resolution-note">Reason for this decision</label>
      <textarea id="resolution-note" value={note} maxLength={2000} disabled={saving} onChange={event => setNote(event.target.value)} className="w-full rounded border border-border bg-surface p-3" />
      <p className="text-sm text-text-muted">This moves the full session payment and saves your decision in the payment history.</p>
      <div className="flex gap-3"><Button onClick={resolve} disabled={saving || note.trim().length < 5}>{saving ? 'Processing…' : 'Confirm decision'}</Button><Button variant="outline" disabled={saving} onClick={() => setDecision(null)}>Cancel</Button></div>
    </section>}
    {loading && <p role="status">Loading payments…</p>}
    {!loading && !error && !payments.length && <p>No {status} payments.</p>}
    {payments.map(payment => <article key={payment.problem_id} className="space-y-2 rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold">{payment.problem?.subject || 'Session'} · Rs. {Number(payment.amount).toLocaleString()}</h2><span>{payment.status}</span></div>
      <p className="break-all text-xs text-text-muted">Session: {payment.problem_id}</p>
      <p className="break-all text-sm">Student: {payment.student_email}<br />Tutor: {payment.tutor_email}</p>
      <p className="text-sm">Started: {timestamp(payment.problem?.session_started_at ?? null)}<br />Ended: {timestamp(payment.problem?.session_ended_at ?? null)}<br />Agreed duration: {payment.problem?.bid?.duration_min ?? 'Unknown'} min + {payment.problem?.extension_minutes ?? 0} extra</p>
      {payment.status === 'pending' && <p className="text-sm">Eligible for automatic release: {timestamp(payment.release_at)}</p>}
      <p className="text-sm">Rating: {payment.rating ? `${payment.rating}/5` : 'Not submitted'}</p>
      {payment.feedback && <p className="whitespace-pre-wrap text-sm">Feedback: {payment.feedback}</p>}
      {payment.dispute && <p className="whitespace-pre-wrap font-semibold">Dispute: {payment.dispute}</p>}
      {payment.hold_reason && <p className="text-sm">Hold reason: {payment.hold_reason}</p>}
      {payment.resolved_at && <p className="whitespace-pre-wrap text-sm">Resolved by {payment.resolved_by || 'Automatic payout'} at {timestamp(payment.resolved_at)}<br />{payment.resolution_note}</p>}
      {payment.status === 'held' && <div className="flex flex-wrap gap-3 pt-2">
        <Button disabled={saving} onClick={() => { setDecision({ payment, action: 'release' }); setNote('') }}>Release to tutor</Button>
        <Button variant="outline" disabled={saving} onClick={() => { setDecision({ payment, action: 'refund' }); setNote('') }}>Refund student wallet</Button>
      </div>}
    </article>)}
    <div className="flex items-center gap-3"><Button variant="outline" disabled={page === 0 || loading} onClick={() => setPage(value => value - 1)}>Previous</Button><span>Page {page + 1}</span><Button variant="outline" disabled={(page + 1) * 25 >= count || loading} onClick={() => setPage(value => value + 1)}>Next</Button></div>
  </main>
}
