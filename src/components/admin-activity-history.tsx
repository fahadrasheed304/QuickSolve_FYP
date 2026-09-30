'use client'

import { useEffect, useState } from 'react'

const kinds = {
  requests: { label: 'Student requests', statuses: ['open','accepted','completed','cancelled','expired'], columns: ['subject','class','status','offer_price','duration_min','created_at','session_started_at','session_ended_at','id'] },
  bids: { label: 'Tutor bids', statuses: ['pending','accepted','rejected','cancelled'], columns: ['status','price','duration_min','created_at','problem_id','id'] },
  transactions: { label: 'Wallet transactions', statuses: ['pending','completed','failed'], columns: ['user_role','type','amount','method','description','status','created_at','id'] },
}
const control = 'rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50'
function format(key: string, value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (key.endsWith('_at')) return new Date(String(value)).toLocaleString()
  if (['amount','price','offer_price'].includes(key)) return `PKR ${Number(value).toLocaleString()}`
  if (key === 'duration_min') return `${value} min`
  return String(value)
}
export function AdminActivityHistory({ email }: { email: string }) {
  const [kind, setKind] = useState<keyof typeof kinds>('requests')
  const [status, setStatus] = useState('all')
  const [role, setRole] = useState('all')
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<{ records: Record<string, unknown>[]; count: number } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setData(null); setError('')
      try {
        const response = await fetch(`/api/admin/users/activity?${new URLSearchParams({ email, kind, status, role, page: String(page) })}`, { cache: 'no-store', signal: controller.signal })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error)
        if (!controller.signal.aborted) setData(body)
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'History unavailable.') }
    }
    void load(); return () => controller.abort()
  }, [email, kind, status, role, page, revision])
  return <section className="space-y-4"><h3 className="text-lg font-bold">Activity records</h3><p className="text-sm text-muted-foreground">Browse all saved requests, bids and wallet transactions. Sessions and reviews are in the student and tutor activity tabs.</p>
    <div className="flex flex-wrap gap-3 rounded-xl border border-border p-4"><label className="grid gap-1 text-xs font-semibold">Record type<select className={control} value={kind} onChange={event => { setKind(event.target.value as keyof typeof kinds); setStatus('all'); setRole('all'); setPage(0) }}>{Object.entries(kinds).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label><label className="grid gap-1 text-xs font-semibold">Status<select className={control} value={status} onChange={event => { setStatus(event.target.value); setPage(0) }}><option value="all">All statuses</option>{kinds[kind].statuses.map(value => <option key={value} value={value}>{value}</option>)}</select></label>{kind === 'transactions' && <label className="grid gap-1 text-xs font-semibold">Wallet role<select className={control} value={role} onChange={event => { setRole(event.target.value); setPage(0) }}><option value="all">Both roles</option><option value="student">Student</option><option value="tutor">Tutor</option></select></label>}<button className={`${control} self-end`} onClick={() => setRevision(value => value + 1)}>Refresh</button></div>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {!data && !error && <p role="status">Loading activity…</p>}
    {data && <><p className="text-sm text-muted-foreground">{data.count} matching records · newest first</p>{data.records.length ? <div className="space-y-3">{data.records.map(row => <article key={String(row.id)} className="rounded-xl border border-border p-4"><dl className="grid gap-4 sm:grid-cols-2">{kinds[kind].columns.map(key => <div key={key}><dt className="text-xs font-semibold uppercase text-muted-foreground">{key.replaceAll('_',' ')}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{format(key,row[key])}</dd></div>)}</dl></article>)}</div> : <p className="rounded-xl border border-border p-6 text-sm">No records match these filters.</p>}</>}
    <div className="flex items-center gap-3"><button className={control} disabled={!data || page === 0} onClick={() => setPage(value => value - 1)}>Previous</button><span className="text-sm">Page {page + 1}{data ? ` of ${Math.max(1, Math.ceil(data.count / 20))}` : ''}</span><button className={control} disabled={!data || (page + 1) * 20 >= data.count} onClick={() => setPage(value => value + 1)}>Next</button></div>
  </section>
}
