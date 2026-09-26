"use client"
import Link from 'next/link'
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
  return <main className="space-y-5 p-6">
    <Link href="/admin/verifications">Tutor verifications</Link>
    <h1 className="text-3xl font-bold">Tutor conduct queue</h1>
    <p>Persistent flags and booking restrictions awaiting review.</p>
    <button onClick={() => setRevision(value => value + 1)}>Refresh queue</button>
    {error && <p role="alert">{error}</p>}
    {loading && <p role="status">Loading…</p>}
    {!loading && !error && !rows.length && <p>No flagged or restricted tutors on this page.</p>}
    {rows.map(row => <article className="rounded border border-border p-4" key={row.tutor_email}><p>{row.tutor_email} · {row.status}</p><p>{row.reason}</p><button className="text-primary" onClick={() => setSelected(row.tutor_email)}>Review tutor</button></article>)}
    <div><button disabled={loading || !page} onClick={() => setPage(value => value - 1)}>Previous</button><span className="mx-3">Page {page + 1}</span><button disabled={loading || !!error || (page + 1) * 25 >= count} onClick={() => setPage(value => value + 1)}>Next</button></div>
    {selected && <TutorConduct key={selected} tutorEmail={selected} />}
  </main>
}
