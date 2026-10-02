'use client'


import { useEffect, useState } from 'react'
import { UserDetailsModal } from '@/components/admin-user-details'
import { RefreshCw, Search, ShieldCheck, Users as UsersIcon } from 'lucide-react'

type User = { id: string; email: string; fullname: string; phone: string | null; role: string; roles?: string[]; created_at: string }
const control = 'rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50'

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(0)
  const [role, setRole] = useState('all')
  const [search, setSearch] = useState('')
  const [draftSearch, setDraftSearch] = useState('')
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selected, setSelected] = useState<User | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/admin/users?${new URLSearchParams({ page: String(page), role, search })}`, { cache: 'no-store', signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Users could not be loaded.')
        if (!controller.signal.aborted) { setUsers(data.users); setCount(data.count) }
      } catch (err) {
        if (!controller.signal.aborted) { setUsers([]); setError(err instanceof Error ? err.message : 'Users could not be loaded.') }
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [page, role, search, revision])

  return <main className="space-y-5 pb-8">
    <section className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary-subtle px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary-dark"><ShieldCheck size={14} />Account directory</div><p className="max-w-2xl text-sm leading-6 text-text-muted">Find a registered account and open its profile, activity, wallet and review history.</p></div><div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm"><span className="flex size-10 items-center justify-center rounded-lg bg-primary-subtle text-primary"><UsersIcon size={19} /></span><div><p className="text-xs font-bold uppercase tracking-wide text-text-muted">Matching accounts</p><p className="text-2xl font-black">{count.toLocaleString()}</p></div></div></section>
    <form className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-end" onSubmit={event => { event.preventDefault(); setPage(0); setSearch(draftSearch.trim()); setRevision(value => value + 1) }}>
      <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-bold uppercase tracking-wide text-text-muted">Name or email<span className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} /><input className={`${control} w-full pl-9 normal-case tracking-normal text-text-main`} value={draftSearch} maxLength={100} onChange={event => setDraftSearch(event.target.value)} placeholder="Search registered users" /></span></label>
      <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wide text-text-muted">Role<select className={`${control} min-w-40 normal-case tracking-normal text-text-main`} value={role} onChange={event => { setRole(event.target.value); setPage(0) }}><option value="all">All roles</option><option value="student">Students</option><option value="tutor">Tutors</option><option value="admin">Admins</option></select></label>
      <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-dark" type="submit"><Search size={16} />Search</button>
    </form>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</p>}
    {loading ? <div role="status" className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-text-muted">Loading registered users…</div> : !error && <>
      {!users.length ? <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center"><UsersIcon className="mx-auto mb-3 text-text-muted" size={30} /><h2 className="font-bold">No users found</h2><p className="mt-1 text-sm text-text-muted">Try another search or return to the previous page.</p></div> : <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"><div className="flex items-center justify-between border-b border-border px-4 py-3"><p className="text-sm font-bold">Registered accounts</p><span className="text-xs text-text-muted">{count.toLocaleString()} results</span></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-text-muted"><tr>{['Account', 'Role', 'Phone', 'Registered', ''].map(title => <th className="px-4 py-3.5 font-bold" key={title} scope="col">{title}</th>)}</tr></thead>
        <tbody>{users.map(user => <tr className="border-t border-border transition-colors hover:bg-primary/[0.035]" key={user.id}><td className="px-4 py-4"><div className="flex min-w-0 items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-sm font-black text-primary">{(user.fullname || user.email).slice(0, 1).toUpperCase()}</span><div className="min-w-0"><p className="truncate font-bold">{user.fullname || 'Name not provided'}</p><p className="max-w-[320px] truncate text-xs text-text-muted">{user.email}</p></div></div></td><td className="px-4 py-4"><div className="flex flex-wrap gap-1.5">{(user.roles || [user.role]).map(item => <span key={item} className="rounded-full border border-primary/10 bg-primary-subtle px-2.5 py-1 text-xs font-bold capitalize text-primary-dark">{item}</span>)}</div></td><td className="px-4 py-4 text-text-muted">{user.phone || 'Not provided'}</td><td className="whitespace-nowrap px-4 py-4 text-text-muted">{new Date(user.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</td><td className="px-4 py-4 text-right"><button className="whitespace-nowrap rounded-lg border border-border px-3 py-2 text-xs font-bold text-primary transition hover:border-primary/30 hover:bg-primary-subtle" onClick={() => setSelected(user)} aria-label={`View details for ${user.email}`}>View profile</button></td></tr>)}</tbody>
      </table></div></div>}
    </>}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3"><span className="text-sm text-text-muted">Page {page + 1} · showing up to 25 accounts</span><div className="flex gap-2"><button className={control} disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}>Previous</button><button className={control} disabled={loading || !!error || (page + 1) * 25 >= count} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
    {selected && <UserDetailsModal user={selected} onClose={() => setSelected(null)} />}
  </main>
}
