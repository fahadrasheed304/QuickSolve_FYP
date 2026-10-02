"use client"
import { useEffect, useState } from 'react'
import { ShieldCheck, RefreshCw, AlertTriangle, CheckCircle2, Clock3, Gavel } from 'lucide-react'

type Record = { conduct: { status: string; reason: string; violations: number }; events: { id: string; action: string; reason: string; created_at: string }[]; count: number }
export function TutorConduct({ tutorEmail }: { tutorEmail?: string }) {
  const [data, setData] = useState<Record | null>(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [action, setAction] = useState('clear')
  const [note, setNote] = useState('')
  const [decision, setDecision] = useState<{ email: string; action: string; note: string; requestId: string } | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const params = new URLSearchParams({ page: String(page) })
        if (tutorEmail) params.set('tutorEmail', tutorEmail)
        const res = await fetch(`/api/tutor/conduct?${params}`, { cache: 'no-store', signal: controller.signal })
        if (!res.ok) throw new Error()
        const body = await res.json()
        if (!controller.signal.aborted) { setData(body); setError('') }
      } catch { if (!controller.signal.aborted) { setData(null); setError('Conduct status could not be loaded. Retry shortly.') } }
    }
    void load()
    const timer = setInterval(load, 30000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [tutorEmail, page, revision])
  const save = async () => {
    if (!decision || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/tutor/conduct', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(decision) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error)
      setDecision(null); setNote(''); setData(null); setPage(0); setRevision(value => value + 1)
    } catch (error) { setError(error instanceof Error ? error.message : 'Decision failed. Retry.') }
    finally { setSaving(false) }
  }
  return <section className="space-y-5 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="rounded-lg bg-primary-subtle p-2.5 text-primary"><ShieldCheck className="h-5 w-5" /></span><div><h2 className="font-bold">Account conduct review</h2><p className="mt-0.5 text-xs text-text-muted">Account status and review decisions</p></div></div><button className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold text-text-muted hover:bg-surface-hover" onClick={() => setRevision(value => value + 1)}><RefreshCw className="h-3.5 w-3.5" />Refresh status</button></div>
    {error && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
    {!data && !error && <p role="status" className="rounded-lg bg-background p-4 text-sm text-text-muted">Loading account status...</p>}
    {data && <>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]"><div className="flex items-center gap-2 rounded-xl border border-border bg-background p-4"><span className={"flex size-9 items-center justify-center rounded-lg " + (data.conduct.status === "restricted" ? "bg-red-100 text-red-700" : data.conduct.status === "flagged" ? "bg-amber-100 text-amber-800" : "bg-success-subtle text-success")}><ShieldCheck size={18} /></span><div><p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Current status</p><span className={"text-sm font-black capitalize " + (data.conduct.status === "restricted" ? "text-red-700" : data.conduct.status === "flagged" ? "text-amber-800" : "text-success")}>{data.conduct.status}</span></div></div><div className="flex items-center gap-3 rounded-xl border border-border bg-background p-4"><span className="text-2xl font-black">{data.conduct.violations}</span><span className="text-xs leading-5 text-text-muted">Confirmed violations<br />since last clearance</span></div></div>
      {data.conduct.reason && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-amber-900"><AlertTriangle size={14} />Current review reason</p><p className="whitespace-pre-wrap break-words text-sm leading-6 text-amber-950">{data.conduct.reason}</p></div>}
      {data.conduct.status === 'restricted' && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-900">New bids and bookings are blocked until admin review. Existing sessions and wallet access remain available. Contact support to request review.</p>}
      {data.conduct.status === 'flagged' && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">This account needs review. New bookings remain available while recent student feedback is assessed.</p>}
      <details className="rounded-xl border border-border bg-background p-4 text-sm"><summary className="cursor-pointer font-bold">Decision history <span className="ml-1 rounded-full bg-surface-container-high px-2 py-0.5 text-xs">{data.count}</span></summary>
        <div className="mt-3 space-y-2">{data.events.map(event => <article key={event.id} className="rounded-lg border border-border bg-surface p-3"><p className="flex flex-wrap items-center gap-2 font-bold capitalize"><Clock3 size={14} className="text-primary" />{event.action.replaceAll('_', ' ')}<span className="text-xs font-normal text-text-muted">{new Date(event.created_at).toLocaleString()}</span></p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-text-muted">{event.reason}</p></article>)}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><button className="rounded-lg border border-border px-3 py-2 text-xs font-bold disabled:opacity-40" disabled={!page} onClick={() => { setData(null); setPage(value => value - 1) }}>Previous</button><span className="text-xs text-text-muted">Page {page + 1}</span><button className="rounded-lg border border-border px-3 py-2 text-xs font-bold disabled:opacity-40" disabled={(page + 1) * 20 >= data.count} onClick={() => { setData(null); setPage(value => value + 1) }}>Next</button></div>
      </details>
    </>}
    {tutorEmail && <div className="space-y-4 border-t border-border pt-5">
      <div className="rounded-xl border border-primary/15 bg-primary-subtle/50 p-4"><p className="flex items-center gap-2 text-sm font-bold text-primary-dark"><Gavel size={16} />Admin decision</p><p className="mt-1 text-xs leading-5 text-text-muted">Only record a violation after reviewing evidence. First confirmed violation flags; second restricts. Clearing starts a new evaluation period without deleting history.</p></div>
      <label className="block space-y-1.5 text-xs font-bold uppercase tracking-wide text-text-muted">Action <select disabled={!!decision} className="block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-text-main" value={action} onChange={event => setAction(event.target.value)}><option value="clear">Clear after review</option><option value="restrict">Restrict new bookings</option><option value="violation">Record confirmed violation</option></select></label>
      <label className="block space-y-1.5 text-xs font-bold uppercase tracking-wide text-text-muted">Reason / evidence reference<textarea maxLength={2000} disabled={!!decision} className="block w-full rounded-lg border border-border bg-surface p-3 text-sm font-normal normal-case tracking-normal text-text-main outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" rows={4} placeholder="Describe the evidence and why this action is appropriate..." value={note} onChange={event => setNote(event.target.value)} /></label>
      {!decision ? <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-45" disabled={!data || note.trim().length < 10} onClick={() => setDecision({ email: tutorEmail, action, note: note.trim(), requestId: crypto.randomUUID() })}><Gavel size={16} />Review decision</button>
        : <div className="space-y-3 rounded-xl border border-primary/20 bg-primary-subtle/40 p-4"><p className="flex items-center gap-2 text-sm font-black"><CheckCircle2 size={16} className="text-primary" />Confirm {decision.action.replaceAll('_', ' ')} for {decision.email}</p><p className="whitespace-pre-wrap break-words text-sm text-text-muted">{decision.note}</p><div className="flex flex-wrap gap-2"><button className="rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50" disabled={saving} onClick={() => void save()}>{saving ? 'Saving...' : 'Confirm decision'}</button><button className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-bold disabled:opacity-50" disabled={saving} onClick={() => setDecision(null)}>Cancel</button></div></div>}
    </div>}
  </section>
}
