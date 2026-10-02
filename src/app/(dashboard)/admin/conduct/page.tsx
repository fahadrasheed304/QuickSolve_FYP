"use client"

import { useEffect, useState } from 'react'
import { TutorConduct } from '@/components/tutor-conduct'
import { AlertTriangle, RefreshCw, ShieldCheck, Users } from 'lucide-react'

export default function ConductQueue() {
  const [rows, setRows] = useState<{ tutor_email: string; status: string; reason: string }[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(0)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/tutor/conduct?queue=1&page=${page}`, { cache: 'no-store', signal: controller.signal })
        if (!res.ok) throw new Error()
        const body = await res.json()
        if (!controller.signal.aborted) { setRows(body.tutors); setCount(body.count); setError('') }
      } catch { if (!controller.signal.aborted) { setRows([]); setError('Review queue unavailable.') } }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load(); const timer = setInterval(load, 30000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [page, revision])
  return <main className="space-y-5 pb-8">
    <section className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-900"><ShieldCheck size={14} />Tutor conduct</div><p className="max-w-2xl text-sm leading-6 text-text-muted">Review student feedback and session evidence before recording a violation or restricting new bookings.</p></div><div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm"><span className="flex size-10 items-center justify-center rounded-lg bg-amber-50 text-amber-800"><Users size={19} /></span><div><p className="text-xs font-bold uppercase tracking-wide text-text-muted">Needs review</p><p className="text-2xl font-black">{count.toLocaleString()}</p></div></div></section>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm"><div className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle size={17} className="text-amber-700" />Flagged or restricted tutors</div><button disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold text-primary transition hover:bg-primary-subtle disabled:opacity-50" onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Refresh queue</button></div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</p>}
    {loading && <div role="status" className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-text-muted">Loading conduct review queue…</div>}
    {!loading && !error && !rows.length && <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center"><ShieldCheck className="mx-auto mb-3 text-success" size={32} /><h2 className="font-bold">Queue is clear</h2><p className="mt-1 text-sm text-text-muted">No flagged or restricted tutors need review on this page.</p></div>}
    {rows.map(row => <article className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm" key={row.tutor_email}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-white to-slate-50 px-5 py-4"><div className="flex min-w-0 items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle font-black text-primary">{row.tutor_email.slice(0,1).toUpperCase()}</span><div className="min-w-0"><h2 className="truncate font-bold">{row.tutor_email}</h2><p className="text-xs text-text-muted">Tutor account</p></div></div><span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${row.status === 'restricted' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'}`}>{row.status}</span></div><div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-text-muted">Review reason</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{row.reason || 'No reason provided'}</p></div><button className="shrink-0 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-dark" onClick={() => setSelected(row.tutor_email)}>Review account</button></div></article>)}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3"><span className="text-sm text-text-muted">Page {page + 1} · {count} tutors in queue</span><div className="flex gap-2"><button className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-bold transition hover:bg-primary-subtle disabled:opacity-50" disabled={loading || !page} onClick={() => setPage(value => value - 1)}>Previous</button><button className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-bold transition hover:bg-primary-subtle disabled:opacity-50" disabled={loading || !!error || (page + 1) * 25 >= count} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
    {selected && <TutorConduct key={selected} tutorEmail={selected} />}
  </main>
}
