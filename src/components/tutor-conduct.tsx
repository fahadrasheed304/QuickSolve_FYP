"use client"
import { useEffect, useState } from 'react'

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
  return <section className="mb-5 space-y-3 rounded-lg border border-border bg-surface p-5">
    <h2 className="text-xl font-bold">Account conduct review</h2>
    <button className="text-primary" onClick={() => setRevision(value => value + 1)}>Refresh status</button>
    {error && <p role="alert">{error}</p>}
    {data && <>
      <p className="font-bold">Status: {data.conduct.status} · Confirmed violations since last clearance: {data.conduct.violations}</p>
      {data.conduct.reason && <p className="whitespace-pre-wrap break-words">{data.conduct.reason}</p>}
      {data.conduct.status === 'restricted' && <p>New bids and bookings are blocked until admin review. Existing sessions and wallet access remain available. Contact support to request review.</p>}
      {data.conduct.status === 'flagged' && <p>Your account needs review. New bookings remain available; review recent student feedback.</p>}
      <details><summary>Decision history ({data.count})</summary>
        {data.events.map(event => <article key={event.id} className="my-2 border-t border-border py-2 text-sm"><p>{event.action} · {new Date(event.created_at).toLocaleString()}</p><p className="whitespace-pre-wrap break-words">{event.reason}</p></article>)}
        <button disabled={!page} onClick={() => { setData(null); setPage(value => value - 1) }}>Previous</button>
        <span className="mx-3">Page {page + 1}</span>
        <button disabled={(page + 1) * 20 >= data.count} onClick={() => { setData(null); setPage(value => value + 1) }}>Next</button>
      </details>
    </>}
    {tutorEmail && <div className="space-y-3 border-t border-border pt-3">
      <p className="text-sm">Only record a violation after reviewing evidence. First confirmed violation flags; second restricts. Clearing starts a new evaluation period without deleting history.</p>
      <label className="block">Action <select disabled={!!decision} className="rounded border border-border bg-surface p-2" value={action} onChange={event => setAction(event.target.value)}>
        <option value="clear">Clear after review</option><option value="restrict">Restrict new bookings</option><option value="violation">Record confirmed violation</option>
      </select></label>
      <label className="block">Reason / evidence reference<textarea maxLength={2000} disabled={!!decision} className="block w-full rounded border border-border bg-surface p-2" value={note} onChange={event => setNote(event.target.value)} /></label>
      {!decision ? <button disabled={!data || note.trim().length < 10} onClick={() => setDecision({ email: tutorEmail, action, note: note.trim(), requestId: crypto.randomUUID() })}>Review decision</button>
        : <div><p>Confirm {decision.action} for {decision.email}: {decision.note}</p><button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Confirm / retry decision'}</button><button className="ml-4" disabled={saving} onClick={() => setDecision(null)}>Cancel</button></div>}
    </div>}
  </section>
}
