'use client'
import { useEffect, useState } from 'react'

type Event = { id: string; action: string; reason: string; actor?: string; created_at: string }
type Review = { state: { status: string; reason: string; suspended_until: string | null; revision: number }; events: Event[]; count: number; conduct: { status: string; reason: string; violations: number } | null; conductAvailable: boolean; conductEvents: Event[]; conductCount: number }
type Evidence = Record<string, string | number | boolean | string[] | null>
const button = 'rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold disabled:opacity-50'
export function AdminAccountModeration({ email, role, payments }: { email: string; role: string; payments: Evidence[] | null }) {
  const [data, setData] = useState<Review | null>(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [action, setAction] = useState('suspend')
  const [days, setDays] = useState(7)
  const [reason, setReason] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [decision, setDecision] = useState<Record<string, unknown> | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [checkedAt, setCheckedAt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setData(null); setError('')
      try {
        const res = await fetch(`/api/admin/users/moderation?${new URLSearchParams({ email, page: String(page) })}`, { cache: 'no-store', signal: controller.signal })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error)
        if (!controller.signal.aborted) { setData(body); setCheckedAt(Date.now()) }
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Review unavailable.') }
    }
    void load(); return () => controller.abort()
  }, [email, page, refresh])
  async function save() {
    if (!decision || saving) return
    setSaving(true); setError(''); setMessage('')
    try {
      const res = await fetch('/api/admin/users/moderation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(decision) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error)
      setMessage(body.warning || 'Decision saved. Account access updated across both roles.')
      if (!body.warning) { setDecision(null); setReason(''); setConfirmEmail('') }
      setRefresh(value => value + 1)
    } catch (err) { setError(err instanceof Error ? err.message : 'Decision failed. Retry.') }
    finally { setSaving(false) }
  }
  const disputes = payments?.filter(row => row.status === 'held' && row.dispute)
  const expired = data?.state.status === 'suspended' && data.state.suspended_until && Date.parse(data.state.suspended_until) <= checkedAt
  return <section className="space-y-5">
    <div className="flex items-center justify-between"><h3 className="text-lg font-bold">Account safety & decisions</h3><button className={button} disabled={saving} onClick={() => { setDecision(null); setRefresh(value => value + 1) }}>Refresh evidence</button></div>
    {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-blue-500/10 p-3 text-sm">{message}</p>}
    {!data && !error && <p role="status">Loading account review…</p>}
    {data && <><div className="rounded-xl border border-border p-4"><p className="font-bold capitalize">Account: {expired ? 'Active (suspension expired)' : data.state.status}</p>{data.state.suspended_until && <p className="text-sm">Suspended until: {new Date(data.state.suspended_until).toLocaleString()}</p>}<p className="mt-2 whitespace-pre-wrap break-words text-sm">{data.state.reason || 'No account restriction recorded.'}</p></div>
      <div className="rounded-xl border border-border p-4"><h4 className="font-bold">Tutor conduct evidence</h4>{data.conductAvailable ? <><p className="mt-2 text-sm">Confirmed violations since last clearance: {data.conduct?.violations || 0} · Conduct status: {data.conduct?.status || 'clear'}</p><p className="mt-2 text-sm">{data.conduct?.reason}</p></> : <p className="mt-2 text-sm text-amber-600">Conduct records are unavailable. This does not mean there are no violations.</p>}{data.conductEvents.map(event => <article key={event.id} className="mt-3 border-t border-border pt-3 text-sm"><p className="font-semibold">{event.action} · {new Date(event.created_at).toLocaleString()}</p><p className="whitespace-pre-wrap break-words">{event.reason}</p></article>)}</div>
      <div className="rounded-xl border border-border p-4"><h4 className="font-bold">Open disputes ({disputes ? disputes.length : 'unavailable'})</h4><p className="mt-1 text-xs text-muted-foreground">A dispute is an allegation, not a confirmed violation. Review both sides before deciding.</p>{disputes?.map(row => <article key={String(row.problem_id)} className="mt-3 border-t border-border pt-3 text-sm"><p className="break-all font-semibold">Session: {String(row.problem_id)}</p><p>Student: {String(row.student_email)} · Tutor: {String(row.tutor_email)}</p><p className="whitespace-pre-wrap break-words">{String(row.dispute)}</p><p className="mt-1">Feedback: {String(row.feedback || 'None')} · Rating: {Number(row.rating) || 'Not rated'}</p></article>)}{disputes?.length === 0 && <p className="mt-3 text-sm">No open disputes recorded.</p>}</div>
      <div className="rounded-xl border border-border p-4"><h4 className="font-bold">Account decision history ({data.count})</h4>{!data.events.length && <p className="mt-2 text-sm">No decisions on this page.</p>}{data.events.map(event => <article key={event.id} className="mt-3 border-t border-border pt-3 text-sm"><p className="font-bold">{event.action} · {new Date(event.created_at).toLocaleString()}</p><p className="whitespace-pre-wrap break-words">{event.reason}</p><p className="text-xs text-muted-foreground">By {event.actor}</p></article>)}</div>
      <div className="flex items-center gap-3"><button className={button} disabled={saving || page === 0} onClick={() => setPage(value => value - 1)}>Previous history</button><span>Page {page + 1}</span><button className={button} disabled={saving || (page + 1) * 20 >= Math.max(data.count, data.conductCount)} onClick={() => setPage(value => value + 1)}>Next history</button></div>
      {role !== 'admin' && email !== 'quicksolve.officials@gmail.com' && <div className="space-y-4 rounded-xl border border-red-500/30 p-5"><h4 className="font-bold">Admin decision</h4><p className="text-sm text-muted-foreground">Applies to all roles registered with this email. Payment and dispute records are preserved. Permanent bans have no expiry; only an explicit admin restoration can lift them.</p><fieldset disabled={!!decision || saving} className="space-y-3"><label className="block text-sm">Action<select className="mt-1 block w-full rounded-lg border border-border bg-background p-2" value={action} onChange={event => setAction(event.target.value)}><option value="suspend">Suspend temporarily</option><option value="ban">Permanently ban</option><option value="restore">Restore account access</option></select></label>{action === 'suspend' && <label className="block text-sm">Duration (days)<input type="number" min={1} max={365} className="ml-3 w-24 rounded border border-border bg-background p-2" value={days} onChange={event => setDays(Number(event.target.value))} /></label>}<label className="block text-sm">Reason and evidence reference<textarea value={reason} onChange={event => setReason(event.target.value)} minLength={10} maxLength={2000} className="mt-1 block min-h-24 w-full rounded-lg border border-border bg-background p-3" /></label>{action === 'ban' && <label className="block text-sm">Type {email} to confirm permanent ban<input value={confirmEmail} onChange={event => setConfirmEmail(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-background p-2" /></label>}</fieldset>
      {!decision ? <button className={button} disabled={reason.trim().length < 10 || (action === 'ban' && confirmEmail !== email) || (action === 'suspend' && (!Number.isInteger(days) || days < 1 || days > 365))} onClick={() => setDecision({ email, action, days, reason: reason.trim(), confirmEmail, revision: data.state.revision, requestId: crypto.randomUUID() })}>Review decision</button> : <div className="space-y-3 rounded-lg bg-red-500/10 p-4"><p className="text-sm">Confirm <strong>{String(decision.action)}</strong> for {email}{decision.action === 'suspend' ? ` for ${decision.days} days` : ''}?</p><button className={button} disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Confirm / retry decision'}</button><button className={`${button} ml-2`} disabled={saving} onClick={() => setDecision(null)}>Cancel</button></div>}</div>}
    </>}
  </section>
}
