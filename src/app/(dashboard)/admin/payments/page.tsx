"use client"

import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { AdminSessionRecordings } from '@/components/admin-session-recordings'
import { CheckCircle2, Clock3, CreditCard, RefreshCw, ShieldAlert } from 'lucide-react'

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

  const currentPageAmount = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  return <main className="space-y-6 pb-8">
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="max-w-3xl"><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-800"><ShieldAlert size={14} />Payment review desk</div><p className="text-sm leading-6 text-text-muted">Review disputes and low-rated sessions before deciding where the held payment goes. Session recordings remain private and can be reviewed below.</p></div>
      <div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-border bg-surface p-4 shadow-sm"><span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{status} payments</span><div className="mt-1 text-2xl font-black">{count}</div></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm"><span className="text-xs font-semibold uppercase tracking-wide text-amber-800">Value on this page</span><div className="mt-1 text-2xl font-black text-amber-950">Rs. {currentPageAmount.toLocaleString()}</div></div></div>
    </section>
    <div className="sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white/95 p-3 shadow-md backdrop-blur sm:p-4">
      <label htmlFor="payment-status" className="text-sm font-bold">Filter status</label>
      <select id="payment-status" value={status} disabled={saving} onChange={event => { setStatus(event.target.value); setPage(0); setDecision(null) }} className="min-w-36 rounded-lg border border-border bg-surface p-2.5 text-sm font-semibold capitalize">
        {['held', 'pending', 'released', 'refunded'].map(value => <option key={value} value={value}>{value}</option>)}
      </select>
      <Button onClick={refresh} disabled={loading} className="inline-flex items-center gap-2"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Refresh</Button>
      <span className="text-sm text-text-muted">{count} {status} {count === 1 ? 'payment' : 'payments'}</span>
      {status === 'held' && <span className="ml-auto hidden items-center gap-1.5 text-xs font-semibold text-amber-800 sm:inline-flex"><Clock3 size={14} />Needs admin decision</span>}
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</p>}
    {loading && <div role="status" className="rounded-2xl border border-border bg-surface p-10 text-center text-sm font-medium text-text-muted">Loading payment records…</div>}
    {!loading && !error && !payments.length && <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center"><CheckCircle2 className="mx-auto mb-3 text-success" size={32} /><h2 className="font-bold">No {status} payments</h2><p className="mt-1 text-sm text-text-muted">There are no records in this status right now.</p></div>}
    {payments.map(payment => <article key={payment.problem_id} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-white to-slate-50 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary"><CreditCard size={19} /></span><div className="min-w-0"><h2 className="truncate text-base font-black sm:text-lg">{payment.problem?.subject || 'Tutoring session'}</h2><p className="text-xs text-text-muted">Session payment review</p></div></div>
        <div className="flex items-center gap-3"><span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${payment.status === 'held' ? 'bg-amber-100 text-amber-900' : payment.status === 'released' ? 'bg-emerald-100 text-emerald-900' : payment.status === 'refunded' ? 'bg-slate-200 text-slate-700' : 'bg-blue-100 text-blue-900'}`}>{payment.status}</span><span className="text-xl font-black sm:text-2xl">Rs. {Number(payment.amount).toLocaleString()}</span></div>
      </header>
      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
        <section className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-border bg-background p-4"><span className="text-xs font-bold uppercase tracking-wide text-text-muted">Student</span><p className="mt-1 break-all text-sm font-semibold">{payment.student_email}</p></div><div className="rounded-xl border border-border bg-background p-4"><span className="text-xs font-bold uppercase tracking-wide text-text-muted">Tutor</span><p className="mt-1 break-all text-sm font-semibold">{payment.tutor_email}</p></div></div>
          <div className="rounded-xl border border-border p-4"><span className="text-xs font-bold uppercase tracking-wide text-text-muted">Session timeline</span><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-text-muted">Started</dt><dd className="mt-1 font-semibold">{timestamp(payment.problem?.session_started_at ?? null)}</dd></div><div><dt className="text-xs text-text-muted">Ended</dt><dd className="mt-1 font-semibold">{timestamp(payment.problem?.session_ended_at ?? null)}</dd></div><div><dt className="text-xs text-text-muted">Agreed duration</dt><dd className="mt-1 font-semibold">{payment.problem?.bid?.duration_min ?? 'Unknown'} min + {payment.problem?.extension_minutes ?? 0} extra</dd></div><div><dt className="text-xs text-text-muted">Student rating</dt><dd className="mt-1 font-semibold">{payment.rating ? `${payment.rating}/5 stars` : 'Not submitted'}</dd></div>{payment.status === 'pending' && <div className="sm:col-span-2"><dt className="text-xs text-text-muted">Automatic release eligible</dt><dd className="mt-1 font-semibold">{timestamp(payment.release_at)}</dd></div>}</dl></div>
          <div className="rounded-xl border border-border bg-background p-4"><span className="text-xs font-bold uppercase tracking-wide text-text-muted">Session reference</span><p className="mt-1 break-all font-mono text-xs text-text-muted">{payment.problem_id}</p></div>
        </section>
        <section className="min-w-0 space-y-3">
          {(payment.dispute || payment.hold_reason || payment.feedback) ? <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">{payment.dispute && <div><span className="text-xs font-bold uppercase tracking-wide text-amber-900">Dispute</span><p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-amber-950">{payment.dispute}</p></div>}{payment.hold_reason && <div><span className="text-xs font-bold uppercase tracking-wide text-amber-900">Hold reason</span><p className="mt-1 whitespace-pre-wrap break-words text-sm text-amber-950">{payment.hold_reason}</p></div>}{payment.feedback && <div><span className="text-xs font-bold uppercase tracking-wide text-amber-900">Student feedback</span><p className="mt-1 whitespace-pre-wrap break-words text-sm text-amber-950">{payment.feedback}</p></div>}</div> : <div className="rounded-xl border border-border bg-background p-4 text-sm text-text-muted">No dispute or feedback was submitted.</div>}
          {payment.resolved_at && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><strong>Resolved by {payment.resolved_by || 'Automatic payout'}</strong><br />{timestamp(payment.resolved_at)}{payment.resolution_note && <><br /><span className="mt-2 inline-block">{payment.resolution_note}</span></>}</p>}
        </section>
      </div>
      <div className="mx-5 mb-5 rounded-xl border border-border bg-background p-4 sm:mx-6 sm:mb-6 sm:p-5"><AdminSessionRecordings problemId={payment.problem_id} /></div>
      {payment.status === 'held' && <div className="flex flex-col gap-3 border-t border-border bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
        <Button disabled={saving} onClick={() => { setDecision({ payment, action: 'release' }); setNote('') }}>Release to tutor</Button>
        <Button variant="outline" disabled={saving} onClick={() => { setDecision({ payment, action: 'refund' }); setNote('') }}>Refund student wallet</Button>
      </div>}
      {decision?.payment.problem_id === payment.problem_id && <section aria-label="Confirm payment decision" className="mx-5 mb-5 mt-0 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 sm:mx-6 sm:p-5">
        <div><h3 className="font-bold">{decision.action === 'refund' ? 'Refund student wallet' : 'Release to tutor'}: Rs. {Number(payment.amount).toLocaleString()}</h3><p className="mt-1 break-all text-xs text-text-muted">{decision.action === 'refund' ? payment.student_email : payment.tutor_email}</p></div>
        <label className="block text-sm font-semibold" htmlFor="resolution-note">Reason for this decision</label>
        <textarea id="resolution-note" value={note} maxLength={2000} disabled={saving} onChange={event => setNote(event.target.value)} className="w-full rounded-lg border border-border bg-surface p-3 text-sm" />
        <p className="text-xs text-text-muted">This moves the full session payment and saves your decision in the payment history.</p>
        <div className="flex flex-wrap gap-3"><Button onClick={resolve} disabled={saving || note.trim().length < 5}>{saving ? 'Processing…' : 'Confirm decision'}</Button><Button variant="outline" disabled={saving} onClick={() => setDecision(null)}>Cancel</Button></div>
      </section>}
    </article>)}
    <div className="flex items-center gap-3"><Button variant="outline" disabled={page === 0 || loading} onClick={() => setPage(value => value - 1)}>Previous</Button><span>Page {page + 1}</span><Button variant="outline" disabled={(page + 1) * 25 >= count || loading} onClick={() => setPage(value => value + 1)}>Next</Button></div>
  </main>
}
