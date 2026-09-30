"use client"

import { useEffect, useState } from 'react'
import { TutorConduct } from '@/components/tutor-conduct'

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
  return <main className="space-y-5">
    <div className="qs-panel flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-5"><p className="text-sm text-text-muted">{count} tutors awaiting conduct review</p>
    <button className="rounded-lg border border-border bg-surface px-4 py-2 font-bold text-primary" onClick={() => setRevision(value => value + 1)}>Refresh queue</button></div>
    {error && <p role="alert">{error}</p>}
    {loading && <p role="status">Loading…</p>}
    {!loading && !error && !rows.length && <p className="qs-panel rounded-xl border border-border p-10 text-center text-text-muted">No flagged or restricted tutors on this page.</p>}
    {rows.map(row => <article className="qs-panel rounded-xl border border-border p-5" key={row.tutor_email}><p>{row.tutor_email} · {row.status}</p><p>{row.reason}</p><button className="text-primary" onClick={() => setSelected(row.tutor_email)}>Review tutor</button></article>)}
    <div className="flex items-center gap-3"><button className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-bold disabled:opacity-50" disabled={loading || !page} onClick={() => setPage(value => value - 1)}>Previous</button><span className="mx-3">Page {page + 1}</span><button className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-bold disabled:opacity-50" disabled={loading || !!error || (page + 1) * 25 >= count} onClick={() => setPage(value => value + 1)}>Next</button></div>
    {selected && <TutorConduct key={selected} tutorEmail={selected} />}
  </main>
}
